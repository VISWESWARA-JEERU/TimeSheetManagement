from __future__ import annotations

import uuid
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    Conflict,
    NotFound,
    OptimisticConcurrencyError,
    ValidationError,
)
from app.models.code_link import CodeLink
from app.models.enums import TimeEntryStatus
from app.models.project import Project
from app.models.task import Task
from app.models.time_entry import TimeEntry
from app.schemas.time_entry import (
    CodeLinkInput,
    TimeEntryCreate,
    TimeEntryUpdate,
)
from app.services import (
    attendance_service,
    project_service,
    task_service,
)


# =========================================================
# DATE VALIDATION
# =========================================================


def _today_for_user(
    timezone_name: str | None,
) -> date:
    """
    Return today's date using the user's timezone.

    Falls back to UTC if the timezone is missing
    or invalid.
    """

    timezone_value = (
        timezone_name or "UTC"
    )

    try:
        timezone_info = ZoneInfo(
            timezone_value
        )
    except Exception:
        timezone_info = ZoneInfo("UTC")

    return datetime.now(
        timezone_info
    ).date()


def _validate_not_future_date(
    work_date: date,
    *,
    timezone_name: str | None,
) -> None:
    """
    Prevent creating or moving a time entry
    into a future date.
    """

    today = _today_for_user(
        timezone_name
    )

    if work_date > today:
        raise ValidationError(
            "Time entries cannot be created for a future date"
        )


# =========================================================
# PROJECT / TASK VALIDATION
# =========================================================


async def _validate_project_and_task(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    task_id: uuid.UUID | None,
) -> tuple[Project, Task | None]:
    """
    Validate project and task ownership.

    Rules:
    - project must belong to current organization
    - project must be active
    - task must belong to current organization
    - task must belong to selected project
    - task must be active
    """

    project = (
        await project_service
        .get_project_or_404(
            db,
            project_id,
            org_id,
        )
    )

    if not project.is_active:
        raise ValidationError(
            "Selected project is inactive"
        )

    if task_id is None:
        return project, None

    task = (
        await task_service
        .get_task_or_404(
            db,
            task_id,
            org_id,
        )
    )

    if task.project_id != project.id:
        raise ValidationError(
            "Selected task does not belong "
            "to the selected project"
        )

    if not task.is_active:
        raise ValidationError(
            "Selected task is inactive"
        )

    return project, task


# =========================================================
# CODE LINKS
# =========================================================


async def _add_code_links(
    db: AsyncSession,
    *,
    time_entry_id: uuid.UUID,
    links: list[CodeLinkInput],
) -> None:
    """
    Add code/GitHub links to a time entry.
    """

    for link in links:
        db.add(
            CodeLink(
                time_entry_id=time_entry_id,
                url=link.url,
                link_type=link.link_type,
                repo=link.repo,
                ref=link.ref,
                number=link.number,
                note=link.note,
            )
        )

    await db.flush()


async def _replace_code_links(
    db: AsyncSession,
    *,
    time_entry_id: uuid.UUID,
    links: list[CodeLinkInput],
) -> None:
    """
    Delete existing code links and replace
    them with the supplied links.
    """

    await db.execute(
        delete(CodeLink).where(
            CodeLink.time_entry_id
            == time_entry_id
        )
    )

    if links:
        await _add_code_links(
            db,
            time_entry_id=time_entry_id,
            links=links,
        )


# =========================================================
# GET ONE
# =========================================================


async def get_time_entry(
    db: AsyncSession,
    *,
    entry_id: uuid.UUID,
    user_id: uuid.UUID,
    for_update: bool = False,
) -> TimeEntry | None:
    """
    Return a time entry belonging to
    the logged-in user.
    """

    stmt = select(TimeEntry).where(
        TimeEntry.id == entry_id,
        TimeEntry.user_id == user_id,
    )

    if for_update:
        stmt = stmt.with_for_update()

    result = await db.execute(stmt)

    return result.scalar_one_or_none()


async def get_time_entry_or_404(
    db: AsyncSession,
    *,
    entry_id: uuid.UUID,
    user_id: uuid.UUID,
    for_update: bool = False,
) -> TimeEntry:
    entry = await get_time_entry(
        db,
        entry_id=entry_id,
        user_id=user_id,
        for_update=for_update,
    )

    if entry is None:
        raise NotFound(
            "Time entry not found"
        )

    return entry


# =========================================================
# LIST
# =========================================================


async def list_time_entries(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    start_date: date | None = None,
    end_date: date | None = None,
    project_id: uuid.UUID | None = None,
) -> list[TimeEntry]:
    """
    Return time entries belonging to
    the current user.

    Optional filters:
    - start_date
    - end_date
    - project_id
    """

    if (
        start_date is not None
        and end_date is not None
        and start_date > end_date
    ):
        raise ValidationError(
            "start_date cannot be after end_date"
        )

    stmt = select(TimeEntry).where(
        TimeEntry.user_id == user_id
    )

    if start_date is not None:
        stmt = stmt.where(
            TimeEntry.work_date
            >= start_date
        )

    if end_date is not None:
        stmt = stmt.where(
            TimeEntry.work_date
            <= end_date
        )

    if project_id is not None:
        stmt = stmt.where(
            TimeEntry.project_id
            == project_id
        )

    stmt = stmt.order_by(
        TimeEntry.work_date.desc(),
        TimeEntry.created_at.desc(),
    )

    result = await db.execute(stmt)

    return list(
        result.scalars().unique().all()
    )


# =========================================================
# CREATE
# =========================================================


async def create_time_entry(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    timezone_name: str | None,
    payload: TimeEntryCreate,
) -> TimeEntry:
    """
    Create a new draft time entry.

    Handles:
    - future-date validation
    - idempotency
    - project validation
    - task validation
    - task title snapshot
    - code links
    - attendance logged-time recalculation
    """

    # -----------------------------------------------------
    # Future date validation
    # -----------------------------------------------------

    _validate_not_future_date(
        payload.work_date,
        timezone_name=timezone_name,
    )

    # -----------------------------------------------------
    # Idempotency
    # -----------------------------------------------------

    if payload.client_idempotency_key:
        existing = (
            await db.execute(
                select(TimeEntry).where(
                    TimeEntry.user_id
                    == user_id,
                    TimeEntry.client_idempotency_key
                    == payload.client_idempotency_key,
                )
            )
        ).scalar_one_or_none()

        if existing is not None:
            return existing

    # -----------------------------------------------------
    # Validate project + task
    # -----------------------------------------------------

    _, task = (
        await _validate_project_and_task(
            db,
            org_id=org_id,
            project_id=payload.project_id,
            task_id=payload.task_id,
        )
    )

    # -----------------------------------------------------
    # Snapshot task title
    # -----------------------------------------------------

    task_title_snapshot = (
        task.title
        if task is not None
        else None
    )

    # -----------------------------------------------------
    # Create time entry
    # -----------------------------------------------------

    entry = TimeEntry(
        user_id=user_id,
        work_date=payload.work_date,
        project_id=payload.project_id,
        task_id=payload.task_id,
        task_title_snapshot=(
            task_title_snapshot
        ),
        description=payload.description,
        started_at=payload.started_at,
        ended_at=payload.ended_at,
        duration_minutes=(
            payload.duration_minutes
        ),
        billable=payload.billable,
        status=TimeEntryStatus.draft,
        version=1,
        client_idempotency_key=(
            payload.client_idempotency_key
        ),
    )

    db.add(entry)

    await db.flush()

    # -----------------------------------------------------
    # Code links
    # -----------------------------------------------------

    if payload.code_links:
        await _add_code_links(
            db,
            time_entry_id=entry.id,
            links=payload.code_links,
        )

    # -----------------------------------------------------
    # Recompute attendance
    # -----------------------------------------------------

    await attendance_service.recompute_day(
        db,
        user_id,
        payload.work_date,
    )

    # -----------------------------------------------------
    # Refresh relationships
    # -----------------------------------------------------

    await db.refresh(
        entry,
        attribute_names=[
            "code_links"
        ],
    )

    return entry


# =========================================================
# UPDATE
# =========================================================


async def update_time_entry(
    db: AsyncSession,
    *,
    entry_id: uuid.UUID,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    timezone_name: str | None,
    payload: TimeEntryUpdate,
) -> TimeEntry:
    """
    Update a draft time entry.

    Uses the version field for optimistic
    concurrency control.
    """

    entry = (
        await get_time_entry_or_404(
            db,
            entry_id=entry_id,
            user_id=user_id,
            for_update=True,
        )
    )

    # -----------------------------------------------------
    # Only drafts are editable
    # -----------------------------------------------------

    if (
        entry.status
        != TimeEntryStatus.draft
    ):
        raise Conflict(
            "Only draft time entries can be edited"
        )

    # -----------------------------------------------------
    # Version check
    # -----------------------------------------------------

    if entry.version != payload.version:
        raise OptimisticConcurrencyError(
            "Time entry was modified by another session",
            details={
                "expected_version":
                    payload.version,
                "current_version":
                    entry.version,
            },
        )

    old_work_date = entry.work_date

    fields_set = (
        payload.model_fields_set
    )

    # -----------------------------------------------------
    # Prevent future date
    # -----------------------------------------------------

    if "work_date" in fields_set:
        _validate_not_future_date(
            payload.work_date,
            timezone_name=timezone_name,
        )

    # -----------------------------------------------------
    # Determine project
    # -----------------------------------------------------

    new_project_id = (
        payload.project_id
        if "project_id" in fields_set
        else entry.project_id
    )

    # -----------------------------------------------------
    # Determine task
    # -----------------------------------------------------

    new_task_id = (
        payload.task_id
        if "task_id" in fields_set
        else entry.task_id
    )

    # If project changes but task was not
    # explicitly supplied, clear old task.
    if (
        "project_id" in fields_set
        and payload.project_id
        != entry.project_id
        and "task_id"
        not in fields_set
    ):
        new_task_id = None

    # -----------------------------------------------------
    # Validate resulting project/task
    # -----------------------------------------------------

    _, task = (
        await _validate_project_and_task(
            db,
            org_id=org_id,
            project_id=new_project_id,
            task_id=new_task_id,
        )
    )

    # -----------------------------------------------------
    # Apply work date
    # -----------------------------------------------------

    if "work_date" in fields_set:
        entry.work_date = (
            payload.work_date
        )

    # -----------------------------------------------------
    # Apply project
    # -----------------------------------------------------

    if "project_id" in fields_set:
        entry.project_id = (
            payload.project_id
        )

    # -----------------------------------------------------
    # Apply task
    # -----------------------------------------------------

    if (
        "task_id" in fields_set
        or "project_id"
        in fields_set
    ):
        entry.task_id = new_task_id

    # -----------------------------------------------------
    # Update task snapshot
    # -----------------------------------------------------

    entry.task_title_snapshot = (
        task.title
        if task is not None
        else None
    )

    # -----------------------------------------------------
    # Description
    # -----------------------------------------------------

    if "description" in fields_set:
        entry.description = (
            payload.description or ""
        )

    # -----------------------------------------------------
    # Start/end timestamps
    # -----------------------------------------------------

    if "started_at" in fields_set:
        entry.started_at = (
            payload.started_at
        )

    if "ended_at" in fields_set:
        entry.ended_at = (
            payload.ended_at
        )

    # -----------------------------------------------------
    # Duration
    # -----------------------------------------------------

    if (
        "duration_minutes"
        in fields_set
    ):
        entry.duration_minutes = (
            payload.duration_minutes
        )

    # -----------------------------------------------------
    # Billable
    # -----------------------------------------------------

    if "billable" in fields_set:
        entry.billable = (
            payload.billable
        )

    # -----------------------------------------------------
    # Validate final time range
    # -----------------------------------------------------

    if (
        entry.started_at is not None
        and entry.ended_at is not None
        and entry.ended_at
        < entry.started_at
    ):
        raise ValidationError(
            "ended_at must be after started_at"
        )

    # -----------------------------------------------------
    # Replace code links when supplied
    # -----------------------------------------------------

    if "code_links" in fields_set:
        await _replace_code_links(
            db,
            time_entry_id=entry.id,
            links=(
                payload.code_links
                or []
            ),
        )

    # -----------------------------------------------------
    # Increase version
    # -----------------------------------------------------

    entry.version += 1

    await db.flush()

    # -----------------------------------------------------
    # Recompute old work date
    # -----------------------------------------------------

    await attendance_service.recompute_day(
        db,
        user_id,
        old_work_date,
    )

    # -----------------------------------------------------
    # If date changed, recompute new day too
    # -----------------------------------------------------

    if (
        entry.work_date
        != old_work_date
    ):
        await attendance_service.recompute_day(
            db,
            user_id,
            entry.work_date,
        )

    # -----------------------------------------------------
    # Reload code links
    # -----------------------------------------------------

    await db.refresh(
        entry,
        attribute_names=[
            "code_links"
        ],
    )

    return entry


# =========================================================
# DELETE
# =========================================================


async def delete_time_entry(
    db: AsyncSession,
    *,
    entry_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    """
    Delete a draft time entry.

    Submitted / approved / rejected
    entries cannot be deleted.
    """

    entry = (
        await get_time_entry_or_404(
            db,
            entry_id=entry_id,
            user_id=user_id,
            for_update=True,
        )
    )

    if (
        entry.status
        != TimeEntryStatus.draft
    ):
        raise Conflict(
            "Only draft time entries can be deleted"
        )

    work_date = entry.work_date

    await db.delete(entry)

    await db.flush()

    # Recalculate logged_seconds
    await attendance_service.recompute_day(
        db,
        user_id,
        work_date,
    )