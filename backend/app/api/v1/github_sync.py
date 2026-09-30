from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user, require_admin
from app.core.database import get_db
from app.core.permissions import CurrentUser
from app.integrations.github import sync_service
from app.models.task import Task
from app.schemas.task import TaskOut

router = APIRouter(
    prefix="/github-sync",
    tags=["github-sync"],
)


@router.get(
    "/projects/{project_id}/status",
)
async def get_project_sync_status(
    project_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    return await sync_service.project_status(db, project_id, user.org_id)


@router.post(
    "/projects/{project_id}/pull",
)
async def pull_project(
    project_id: uuid.UUID,
    user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    return await sync_service.pull_project(db, project_id, user.org_id)


@router.post(
    "/tasks/{task_id}/push",
)
async def push_task(
    task_id: uuid.UUID,
    user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await sync_service.push_task(db, task_id, user.org_id)
    return _task_result(result)


@router.post(
    "/tasks/{task_id}/resolve/use-github",
    response_model=TaskOut,
)
async def resolve_use_github(
    task_id: uuid.UUID,
    user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> TaskOut:
    task = await sync_service.resolve_use_github(db, task_id, user.org_id)
    return TaskOut.model_validate(task)


@router.post(
    "/tasks/{task_id}/resolve/keep-local",
)
async def resolve_keep_local(
    task_id: uuid.UUID,
    user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await sync_service.resolve_keep_local(db, task_id, user.org_id)
    return _task_result(result)


def _task_result(result: dict[str, Any]) -> dict[str, Any]:
    task = result["task"]
    if not isinstance(task, Task):
        raise TypeError("Sync result did not contain a Task")
    return {
        "task": TaskOut.model_validate(task).model_dump(mode="json"),
        "warnings": result["warnings"],
    }
