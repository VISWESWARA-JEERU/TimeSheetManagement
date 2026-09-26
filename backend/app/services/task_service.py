from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFound
from app.models.project import Project
from app.models.task import Task


async def get_task(
    db: AsyncSession,
    task_id: uuid.UUID,
    org_id: uuid.UUID,
) -> Task | None:
    """
    Return a task only if its project belongs
    to the current user's organization.
    """

    stmt = (
        select(Task)
        .join(
            Project,
            Project.id == Task.project_id,
        )
        .where(
            Task.id == task_id,
            Project.org_id == org_id,
        )
    )

    result = await db.execute(stmt)

    return result.scalar_one_or_none()


async def get_task_or_404(
    db: AsyncSession,
    task_id: uuid.UUID,
    org_id: uuid.UUID,
) -> Task:
    """
    Return the task or raise a structured 404 error.
    """

    task = await get_task(
        db,
        task_id,
        org_id,
    )

    if task is None:
        raise NotFound("Task not found")

    return task


async def list_tasks(
    db: AsyncSession,
    org_id: uuid.UUID,
    *,
    project_id: uuid.UUID | None = None,
    assignee_user_id: uuid.UUID | None = None,
    active_only: bool = True,
) -> list[Task]:
    """
    List tasks belonging to projects in the organization.

    Optional filters:
    - project_id
    - assignee_user_id
    - active_only
    """

    stmt = (
        select(Task)
        .join(
            Project,
            Project.id == Task.project_id,
        )
        .where(
            Project.org_id == org_id
        )
    )

    if project_id is not None:
        stmt = stmt.where(
            Task.project_id == project_id
        )

    if assignee_user_id is not None:
        stmt = stmt.where(
            Task.assignee_user_id == assignee_user_id
        )

    if active_only:
        stmt = stmt.where(
            Task.is_active.is_(True)
        )

    stmt = stmt.order_by(
        Task.title.asc()
    )

    result = await db.execute(stmt)

    return list(
        result.scalars().all()
    )