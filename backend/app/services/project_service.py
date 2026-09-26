from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFound
from app.models.project import Project


async def get_project(
    db: AsyncSession,
    project_id: uuid.UUID,
    org_id: uuid.UUID,
) -> Project | None:
    """
    Return a project only when it belongs to the current user's organization.
    """

    stmt = select(Project).where(
        Project.id == project_id,
        Project.org_id == org_id,
    )

    result = await db.execute(stmt)

    return result.scalar_one_or_none()


async def get_project_or_404(
    db: AsyncSession,
    project_id: uuid.UUID,
    org_id: uuid.UUID,
) -> Project:
    """
    Return the project or raise a structured 404 error.
    """

    project = await get_project(
        db,
        project_id,
        org_id,
    )

    if project is None:
        raise NotFound("Project not found")

    return project


async def list_projects(
    db: AsyncSession,
    org_id: uuid.UUID,
    *,
    active_only: bool = True,
) -> list[Project]:
    """
    List projects belonging to the organization.

    By default only active projects are returned because
    these are the projects users should normally select
    while creating time entries.
    """

    stmt = select(Project).where(
        Project.org_id == org_id
    )

    if active_only:
        stmt = stmt.where(
            Project.is_active.is_(True)
        )

    stmt = stmt.order_by(
        Project.name.asc()
    )

    result = await db.execute(stmt)

    return list(result.scalars().all())