from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.core.database import get_db
from app.core.exceptions import Forbidden
from app.core.permissions import CurrentUser
from app.schemas.task import TaskOut, TaskPatch
from app.services import task_service


router = APIRouter(
    prefix="/tasks",
    tags=["tasks"],
)


@router.get(
    "",
    response_model=list[TaskOut],
)
async def list_tasks(
    project_id: uuid.UUID | None = Query(default=None),
    assigned_to_me: bool = Query(default=False),
    active_only: bool = Query(default=True),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TaskOut]:
    """
    Return tasks that belong to projects in the
    current user's organization.

    Optional filters:
    - project_id
    - assigned_to_me
    - active_only
    """

    assignee_user_id = (
        user.id
        if assigned_to_me
        else None
    )

    tasks = await task_service.list_tasks(
        db,
        user.org_id,
        project_id=project_id,
        assignee_user_id=assignee_user_id,
        active_only=active_only,
    )

    return [
        TaskOut.model_validate(task)
        for task in tasks
    ]


@router.get(
    "/{task_id}",
    response_model=TaskOut,
)
async def get_task(
    task_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskOut:
    """
    Return one task from the current user's organization.
    """

    task = await task_service.get_task_or_404(
        db,
        task_id,
        user.org_id,
    )

    return TaskOut.model_validate(task)


@router.patch(
    "/{task_id}",
    response_model=TaskOut,
)
async def update_task(
    task_id: uuid.UUID,
    payload: TaskPatch,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskOut:
    task = await task_service.get_task_or_404(
        db,
        task_id,
        user.org_id,
    )
    if not (user.is_manager or task.assignee_user_id == user.id):
        raise Forbidden("You may only edit tasks assigned to you")
    updated = await task_service.update_task(
        db,
        task,
        **payload.model_dump(exclude_unset=True),
    )
    await db.commit()
    await db.refresh(updated)
    return TaskOut.model_validate(updated)