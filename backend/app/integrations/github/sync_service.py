from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    Conflict,
    IntegrationError,
    NotFound,
    RateLimited,
    ValidationError,
)
from app.integrations.github import graphql
from app.integrations.github.client import GitHubClient
from app.models.enums import (
    GhContentType,
    SyncDirection,
    SyncEntity,
    SyncState,
    SyncStatus,
    SyncTrigger,
    TaskSource,
)
from app.models.github_project_link import GitHubProjectLink
from app.models.project import Project
from app.models.sync_log import SyncLog
from app.models.task import Task
from app.models.user import AppUser
from app.services import task_service

_MANAGED_START = "<!-- TIMESHEET-MANAGED-START -->"
_MANAGED_END = "<!-- TIMESHEET-MANAGED-END -->"
_CONTENT_TYPES = {
    "Issue": GhContentType.issue,
    "PullRequest": GhContentType.pull_request,
    "DraftIssue": GhContentType.draft,
}


async def get_project_link(
    db: AsyncSession,
    project_id: uuid.UUID,
    org_id: uuid.UUID,
) -> GitHubProjectLink | None:
    result = await db.execute(
        select(GitHubProjectLink)
        .join(Project, Project.id == GitHubProjectLink.project_id)
        .where(
            GitHubProjectLink.project_id == project_id,
            Project.org_id == org_id,
        )
    )
    return result.scalar_one_or_none()


async def project_status(
    db: AsyncSession,
    project_id: uuid.UUID,
    org_id: uuid.UUID,
) -> dict[str, Any]:
    project_result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.org_id == org_id,
        )
    )
    if project_result.scalar_one_or_none() is None:
        raise NotFound("Project not found")
    link = await get_project_link(db, project_id, org_id)
    return {
        "project_id": str(project_id),
        "linked": link is not None,
        "owner": link.gh_owner if link else None,
        "project_number": link.gh_project_number if link else None,
        "last_synced_at": link.last_synced_at if link else None,
    }


async def pull_project(
    db: AsyncSession,
    project_id: uuid.UUID,
    org_id: uuid.UUID,
    *,
    trigger: SyncTrigger = SyncTrigger.manual,
) -> dict[str, Any]:
    link = await get_project_link(db, project_id, org_id)
    if link is None:
        project_result = await db.execute(
            select(Project.id).where(
                Project.id == project_id,
                Project.org_id == org_id,
            )
        )
        if project_result.scalar_one_or_none() is None:
            raise NotFound("Project not found")
        raise ValidationError("Project is not linked to a GitHub Project")

    client = GitHubClient()
    try:
        items = await _fetch_project_items(client, link.gh_project_node_id)
    except Exception as exc:
        await _write_log(
            db,
            direction=SyncDirection.pull,
            entity=SyncEntity.project,
            entity_id=project_id,
            gh_node_id=link.gh_project_node_id,
            status=SyncStatus.failed,
            trigger=trigger,
            error_message=_safe_error(exc),
            request_payload={"project_id": str(project_id)},
        )
        await db.commit()
        raise

    user_ids = await _get_user_ids(db, org_id, items)
    summary = {
        "project_id": str(project_id),
        "status": "success",
        "created": 0,
        "updated": 0,
        "skipped": 0,
        "conflicts": 0,
        "errors": 0,
        "synced_at": datetime.now(UTC),
    }
    for item in items:
        content = item.get("content")
        content_type = _CONTENT_TYPES.get(
            content.get("__typename") if isinstance(content, dict) else None
        )
        if content_type is None:
            summary["skipped"] += 1
            await _write_log(
                db,
                direction=SyncDirection.pull,
                entity=SyncEntity.task,
                entity_id=None,
                gh_node_id=item.get("id"),
                status=SyncStatus.skipped,
                trigger=trigger,
                error_message="Unsupported or deleted GitHub Project item",
                request_payload={"project_id": str(project_id)},
            )
            continue

        remote_updated_at = _parse_datetime(content.get("updatedAt"))
        if remote_updated_at is None:
            remote_updated_at = datetime.now(UTC)
        remote_status = _item_status(item)
        assignee_login = _first_assignee(content)
        result = await db.execute(
            select(Task).where(Task.gh_item_node_id == item.get("id"))
        )
        task = result.scalar_one_or_none()
        if task is not None and task.project_id != project_id:
            summary["skipped"] += 1
            await _write_log(
                db,
                direction=SyncDirection.pull,
                entity=SyncEntity.task,
                entity_id=task.id,
                gh_node_id=item.get("id"),
                status=SyncStatus.skipped,
                trigger=trigger,
                error_message="GitHub item is already linked to another local project",
                request_payload={"project_id": str(project_id)},
            )
            continue
        values = {
            "title": content.get("title") or "Untitled GitHub item",
            "description": _description_for_local(content.get("body") or ""),
            "status": remote_status or "No Status",
            "assignee_user_id": user_ids.get(assignee_login.casefold())
            if assignee_login
            else None,
            "gh_content_type": content_type,
            "gh_issue_number": content.get("number"),
            "gh_repo": (content.get("repository") or {}).get("nameWithOwner")
            or link.default_repo,
            "gh_url": content.get("url"),
            "gh_updated_at": remote_updated_at,
        }

        if task is None:
            task = Task(
                id=uuid.uuid4(),
                project_id=project_id,
                source=TaskSource.github,
                gh_item_node_id=item.get("id"),
                sync_state=SyncState.synced,
                is_active=True,
                local_updated_at=remote_updated_at,
                **values,
            )
            db.add(task)
            summary["created"] += 1
            await _write_log(
                db,
                direction=SyncDirection.pull,
                entity=SyncEntity.task,
                entity_id=task.id,
                gh_node_id=item.get("id"),
                status=SyncStatus.success,
                trigger=trigger,
                request_payload={"project_id": str(project_id)},
                response_payload={"operation": "created"},
            )
            continue

        remote_changed = (
            task.gh_updated_at is None
            or remote_updated_at > task.gh_updated_at
        )
        local_changed = (
            task.sync_state in {SyncState.pending_push, SyncState.conflict}
            or (
                task.gh_updated_at is not None
                and task.local_updated_at > task.gh_updated_at
            )
        )
        if remote_changed and local_changed:
            task.sync_state = SyncState.conflict
            summary["conflicts"] += 1
            await _write_log(
                db,
                direction=SyncDirection.pull,
                entity=SyncEntity.task,
                entity_id=task.id,
                gh_node_id=item.get("id"),
                status=SyncStatus.conflict,
                trigger=trigger,
                request_payload={"project_id": str(project_id)},
            )
            continue

        if not remote_changed:
            summary["skipped"] += 1
            continue

        for field, value in values.items():
            setattr(task, field, value)
        task.local_updated_at = remote_updated_at
        task.sync_state = SyncState.synced
        summary["updated"] += 1
        await _write_log(
            db,
            direction=SyncDirection.pull,
            entity=SyncEntity.task,
            entity_id=task.id,
            gh_node_id=item.get("id"),
            status=SyncStatus.success,
            trigger=trigger,
            request_payload={"project_id": str(project_id)},
            response_payload={"operation": "updated"},
        )

    link.last_synced_at = summary["synced_at"]
    await _write_log(
        db,
        direction=SyncDirection.pull,
        entity=SyncEntity.project,
        entity_id=project_id,
        gh_node_id=link.gh_project_node_id,
        status=SyncStatus.success,
        trigger=trigger,
        request_payload={"project_id": str(project_id), "item_count": len(items)},
        response_payload={key: value for key, value in summary.items() if key != "synced_at"},
    )
    await db.commit()
    return summary


async def get_project_link_by_gh_node_id(
    db: AsyncSession,
    gh_project_node_id: str,
) -> tuple[uuid.UUID, uuid.UUID] | None:
    result = await db.execute(
        select(GitHubProjectLink.project_id, Project.org_id)
        .join(Project, Project.id == GitHubProjectLink.project_id)
        .where(GitHubProjectLink.gh_project_node_id == gh_project_node_id)
    )
    row = result.one_or_none()
    return (row.project_id, row.org_id) if row else None


async def push_task(
    db: AsyncSession,
    task_id: uuid.UUID,
    org_id: uuid.UUID,
) -> dict[str, Any]:
    task = await task_service.get_task_or_404(db, task_id, org_id)
    return await _push_local_task(db, task, org_id, force=False)


async def resolve_keep_local(
    db: AsyncSession,
    task_id: uuid.UUID,
    org_id: uuid.UUID,
) -> dict[str, Any]:
    task = await task_service.get_task_or_404(db, task_id, org_id)
    if task.sync_state != SyncState.conflict:
        raise Conflict("Task is not in conflict")
    return await _push_local_task(db, task, org_id, force=True)


async def resolve_use_github(
    db: AsyncSession,
    task_id: uuid.UUID,
    org_id: uuid.UUID,
) -> Task:
    task = await task_service.get_task_or_404(db, task_id, org_id)
    if task.sync_state != SyncState.conflict:
        raise Conflict("Task is not in conflict")
    link = await get_project_link(db, task.project_id, org_id)
    if task.source != TaskSource.github or not task.gh_item_node_id or link is None:
        raise ValidationError("Task is missing its GitHub Project link")

    try:
        client = GitHubClient()
        item = await _fetch_item(client, task.gh_item_node_id)
        _validate_item_project(item, link)
        content = item.get("content")
        if not isinstance(content, dict):
            raise IntegrationError("GitHub Project item has no supported content")
        _apply_remote_values(task, item, content)
        login = _first_assignee(content)
        user_ids = await _get_user_ids(db, org_id, [item])
        task.assignee_user_id = user_ids.get(login.casefold()) if login else None
        task.sync_state = SyncState.synced
        await _write_log(
            db,
            direction=SyncDirection.pull,
            entity=SyncEntity.task,
            entity_id=task.id,
            gh_node_id=task.gh_item_node_id,
            status=SyncStatus.success,
            request_payload={"task_id": str(task.id)},
            response_payload={"operation": "resolved_use_github"},
        )
        await db.commit()
        await db.refresh(task)
        return task
    except Exception as exc:
        await _write_log(
            db,
            direction=SyncDirection.pull,
            entity=SyncEntity.task,
            entity_id=task.id,
            gh_node_id=task.gh_item_node_id,
            status=SyncStatus.failed,
            request_payload={"task_id": str(task.id)},
            error_message=_safe_error(exc),
        )
        await db.commit()
        raise


async def _push_local_task(
    db: AsyncSession,
    task: Task,
    org_id: uuid.UUID,
    *,
    force: bool,
) -> dict[str, Any]:
    if not force and task.sync_state == SyncState.conflict:
        raise Conflict("Resolve the task conflict before pushing")
    if task.source != TaskSource.github or not task.gh_item_node_id:
        raise ValidationError("Task is not linked to a GitHub item")
    link = await get_project_link(db, task.project_id, org_id)
    if link is None:
        raise ValidationError("Task project is not linked to GitHub")

    client = GitHubClient()
    try:
        item = await _fetch_item(client, task.gh_item_node_id)
        _validate_item_project(item, link)
        status_field = await _fetch_status_field(client, link.gh_project_node_id)
        content = item.get("content")
        if not isinstance(content, dict):
            raise IntegrationError("GitHub Project item has no supported content")
        remote_updated_at = _parse_datetime(content.get("updatedAt"))
        if (
            not force
            and task.sync_state in {SyncState.pending_push, SyncState.error}
            and task.gh_updated_at is not None
            and remote_updated_at is not None
            and remote_updated_at > task.gh_updated_at
        ):
            task.sync_state = SyncState.conflict
            await _write_log(
                db,
                direction=SyncDirection.push,
                entity=SyncEntity.task,
                entity_id=task.id,
                gh_node_id=task.gh_item_node_id,
                status=SyncStatus.conflict,
                trigger=SyncTrigger.manual,
                request_payload={"task_id": str(task.id)},
            )
            await db.commit()
            raise Conflict("GitHub changed after the last synchronization")

        warnings: list[str] = []
        remote_body = content.get("body") or ""
        body_to_push = _merge_managed_description(remote_body, task.description)
        if body_to_push is None and task.description != remote_body:
            warnings.append(
                "Description was not pushed because the GitHub body has no managed description block."
            )
        elif body_to_push is not None and body_to_push != remote_body:
            await _push_body(client, content, body_to_push)

        remote_status = _item_status(item)
        if task.status != remote_status:
            if status_field is None:
                warnings.append("Status was not pushed because the project has no Status field.")
            else:
                option = next(
                    (
                        option
                        for option in status_field["options"]
                        if option["name"].casefold() == task.status.casefold()
                    ),
                    None,
                )
                if option is None:
                    warnings.append(
                        f"Status '{task.status}' is not an option in the GitHub Project."
                    )
                else:
                    await client.graphql(
                        graphql.UPDATE_STATUS,
                        {
                            "projectId": link.gh_project_node_id,
                            "itemId": task.gh_item_node_id,
                            "fieldId": status_field["id"],
                            "optionId": option["id"],
                        },
                    )

        latest_item = await _fetch_item(client, task.gh_item_node_id)
        _validate_item_project(latest_item, link)
        latest_content = latest_item.get("content")
        latest_updated_at = (
            _parse_datetime(latest_content.get("updatedAt"))
            if isinstance(latest_content, dict)
            else None
        )
        task.gh_updated_at = latest_updated_at or remote_updated_at or datetime.now(UTC)
        fully_synced = not warnings
        task.sync_state = SyncState.synced if fully_synced else (
            SyncState.conflict if force else SyncState.pending_push
        )
        if fully_synced:
            task.local_updated_at = task.gh_updated_at
        await _write_log(
            db,
            direction=SyncDirection.push,
            entity=SyncEntity.task,
            entity_id=task.id,
            gh_node_id=task.gh_item_node_id,
            status=SyncStatus.success if fully_synced else SyncStatus.skipped,
            trigger=SyncTrigger.manual,
            request_payload={"task_id": str(task.id)},
            response_payload={"warnings": warnings},
        )
        await db.commit()
        await db.refresh(task)
        return {"task": task, "warnings": warnings}
    except Conflict:
        raise
    except Exception as exc:
        task.sync_state = SyncState.error
        await _write_log(
            db,
            direction=SyncDirection.push,
            entity=SyncEntity.task,
            entity_id=task.id,
            gh_node_id=task.gh_item_node_id,
            status=SyncStatus.failed,
            trigger=SyncTrigger.manual,
            request_payload={"task_id": str(task.id)},
            error_message=_safe_error(exc),
        )
        await db.commit()
        raise


async def _fetch_status_field(
    client: GitHubClient,
    project_node_id: str,
) -> dict[str, Any] | None:
    data = await client.graphql(
        graphql.PROJECT_STATUS_FIELDS,
        {"projectId": project_node_id},
    )
    project = data.get("node")
    if not isinstance(project, dict):
        raise IntegrationError("Configured GitHub Project could not be found")
    for field in project.get("fields", {}).get("nodes", []):
        if (
            isinstance(field, dict)
            and field.get("__typename") == "ProjectV2SingleSelectField"
            and str(field.get("name", "")).casefold() == "status"
        ):
            return {
                "id": field["id"],
                "options": field.get("options", []),
            }
    return None


async def _fetch_project_items(
    client: GitHubClient,
    project_node_id: str,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    cursor: str | None = None
    while True:
        data = await client.graphql(
            graphql.PROJECT_ITEMS,
            {"projectId": project_node_id, "after": cursor},
        )
        project = data.get("node")
        connection = project.get("items") if isinstance(project, dict) else None
        if not isinstance(connection, dict):
            raise IntegrationError("GitHub Project items could not be loaded")
        items.extend(
            item for item in connection.get("nodes", []) if isinstance(item, dict)
        )
        page_info = connection.get("pageInfo") or {}
        if not page_info.get("hasNextPage"):
            return items
        cursor = page_info.get("endCursor")
        if not cursor:
            raise IntegrationError("GitHub returned an invalid pagination cursor")


async def _fetch_item(
    client: GitHubClient,
    item_node_id: str,
) -> dict[str, Any]:
    data = await client.graphql(
        graphql.PROJECT_ITEM,
        {"itemId": item_node_id},
    )
    item = data.get("node")
    if not isinstance(item, dict):
        raise NotFound("GitHub Project item not found")
    return item


async def _push_body(
    client: GitHubClient,
    content: dict[str, Any],
    body: str,
) -> None:
    content_type = content.get("__typename")
    mutation = {
        "Issue": graphql.UPDATE_ISSUE_BODY,
        "PullRequest": graphql.UPDATE_PULL_REQUEST_BODY,
        "DraftIssue": graphql.UPDATE_DRAFT_BODY,
    }.get(content_type)
    if mutation is None:
        raise ValidationError("GitHub item type does not support description updates")
    await client.graphql(mutation, {"id": content["id"], "body": body})


async def _get_user_ids(
    db: AsyncSession,
    org_id: uuid.UUID,
    items: list[dict[str, Any]],
) -> dict[str, uuid.UUID]:
    logins = {
        login.casefold()
        for item in items
        if isinstance(item.get("content"), dict)
        for login in [_first_assignee(item["content"])]
        if login
    }
    if not logins:
        return {}
    result = await db.execute(
        select(AppUser.github_login, AppUser.id).where(
            AppUser.org_id == org_id,
            func.lower(AppUser.github_login).in_(logins),
        )
    )
    matches: dict[str, set[uuid.UUID]] = {}
    for login, user_id in result.all():
        if login is not None:
            matches.setdefault(login.casefold(), set()).add(user_id)
    return {
        login: next(iter(user_ids))
        for login, user_ids in matches.items()
        if len(user_ids) == 1
    }


def _first_assignee(content: dict[str, Any]) -> str | None:
    assignees = content.get("assignees")
    nodes = assignees.get("nodes", []) if isinstance(assignees, dict) else []
    if nodes and isinstance(nodes[0], dict):
        login = nodes[0].get("login")
        return login if isinstance(login, str) else None
    return None


def _item_status(item: dict[str, Any]) -> str | None:
    for value in (item.get("fieldValues") or {}).get("nodes", []):
        if (
            isinstance(value, dict)
            and value.get("__typename") == "ProjectV2ItemFieldSingleSelectValue"
            and str((value.get("field") or {}).get("name", "")).casefold() == "status"
        ):
            return value.get("name")
    return None


def _description_for_local(body: str) -> str:
    if body.count(_MANAGED_START) != 1 or body.count(_MANAGED_END) != 1:
        return body
    start = body.find(_MANAGED_START)
    end = body.find(_MANAGED_END)
    if start >= 0 and end > start:
        description = body[start + len(_MANAGED_START):end]
        if description.startswith("\r\n"):
            description = description[2:]
        elif description.startswith("\n"):
            description = description[1:]
        if description.endswith("\r\n"):
            description = description[:-2]
        elif description.endswith("\n"):
            description = description[:-1]
        return description
    return body


def _merge_managed_description(body: str, description: str) -> str | None:
    if _MANAGED_START in description or _MANAGED_END in description:
        return None
    if body.count(_MANAGED_START) != 1 or body.count(_MANAGED_END) != 1:
        return body if body == description else None
    start = body.find(_MANAGED_START)
    end = body.find(_MANAGED_END)
    if start < 0 or end < start:
        return body if body == description else None
    replacement = f"{_MANAGED_START}\n{description}\n{_MANAGED_END}"
    return body[:start] + replacement + body[end + len(_MANAGED_END):]


def _apply_remote_values(
    task: Task,
    item: dict[str, Any],
    content: dict[str, Any],
) -> None:
    content_type = _CONTENT_TYPES.get(content.get("__typename"))
    if content_type is None:
        raise IntegrationError("GitHub item type is not supported")
    updated_at = _parse_datetime(content.get("updatedAt")) or datetime.now(UTC)
    task.title = content.get("title") or task.title
    task.description = _description_for_local(content.get("body") or "")
    task.status = _item_status(item) or task.status
    task.gh_content_type = content_type
    task.gh_issue_number = content.get("number")
    task.gh_repo = (content.get("repository") or {}).get("nameWithOwner") or task.gh_repo
    task.gh_url = content.get("url") or task.gh_url
    task.gh_updated_at = updated_at
    task.local_updated_at = updated_at


def _validate_item_project(
    item: dict[str, Any],
    link: GitHubProjectLink,
) -> None:
    project = item.get("project")
    if not isinstance(project, dict) or project.get("id") != link.gh_project_node_id:
        raise ValidationError("GitHub task does not belong to the linked GitHub Project")


async def _write_log(
    db: AsyncSession,
    *,
    direction: SyncDirection,
    entity: SyncEntity,
    entity_id: uuid.UUID | None,
    gh_node_id: str | None,
    status: SyncStatus,
    trigger: SyncTrigger = SyncTrigger.manual,
    request_payload: dict[str, Any] | None = None,
    response_payload: dict[str, Any] | None = None,
    error_message: str | None = None,
) -> None:
    db.add(
        SyncLog(
            direction=direction,
            entity=entity,
            entity_id=entity_id,
            gh_node_id=gh_node_id,
            trigger=trigger,
            status=status,
            request_payload=request_payload,
            response_payload=response_payload,
            error_message=error_message,
        )
    )


def _parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _safe_error(error: Exception) -> str:
    if isinstance(
        error,
        (IntegrationError, NotFound, RateLimited, ValidationError, Conflict),
    ):
        return str(error)
    return "GitHub synchronization failed"
