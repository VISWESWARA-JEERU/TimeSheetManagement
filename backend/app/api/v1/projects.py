from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.core.database import get_db
from app.core.permissions import CurrentUser
from app.schemas.project import ProjectOut
from app.services import project_service


router = APIRouter(
    prefix="/projects",
    tags=["projects"],
)


@router.get(
    "",
    response_model=list[ProjectOut],
)
async def list_projects(
    active_only: bool = Query(default=True),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProjectOut]:
    """
    Return projects belonging to the current user's organization.

    By default, only active projects are returned.
    """

    projects = await project_service.list_projects(
        db,
        user.org_id,
        active_only=active_only,
    )

    return [
        ProjectOut.model_validate(project)
        for project in projects
    ]


@router.get(
    "/{project_id}",
    response_model=ProjectOut,
)
async def get_project(
    project_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectOut:
    """
    Return one project from the current user's organization.
    """

    project = await project_service.get_project_or_404(
        db,
        project_id,
        user.org_id,
    )

    return ProjectOut.model_validate(project)