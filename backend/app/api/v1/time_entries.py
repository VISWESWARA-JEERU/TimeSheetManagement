from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.core.database import get_db
from app.core.permissions import CurrentUser
from app.schemas.common import OkResponse
from app.schemas.time_entry import (
    TimeEntryCreate,
    TimeEntryOut,
    TimeEntryUpdate,
)
from app.services import time_entry_service


router = APIRouter(
    prefix="/time-entries",
    tags=["time-entries"],
)


# =========================================================
# LIST TIME ENTRIES
# =========================================================


@router.get(
    "",
    response_model=list[TimeEntryOut],
)
async def list_time_entries(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    project_id: uuid.UUID | None = Query(default=None),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TimeEntryOut]:
    """
    Return time entries belonging to the logged-in user.

    Optional filters:
    - start_date
    - end_date
    - project_id
    """

    entries = await time_entry_service.list_time_entries(
        db,
        user_id=user.id,
        start_date=start_date,
        end_date=end_date,
        project_id=project_id,
    )

    return [
        TimeEntryOut.model_validate(entry)
        for entry in entries
    ]


# =========================================================
# GET ONE TIME ENTRY
# =========================================================


@router.get(
    "/{entry_id}",
    response_model=TimeEntryOut,
)
async def get_time_entry(
    entry_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TimeEntryOut:
    """
    Return one time entry owned by the logged-in user.
    """

    entry = await time_entry_service.get_time_entry_or_404(
        db,
        entry_id=entry_id,
        user_id=user.id,
    )

    return TimeEntryOut.model_validate(entry)


# =========================================================
# CREATE TIME ENTRY
# =========================================================


@router.post(
    "",
    response_model=TimeEntryOut,
)
async def create_time_entry(
    payload: TimeEntryCreate,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> TimeEntryOut:
    entry = await time_entry_service.create_time_entry(
        db,
        user_id=user.id,
        org_id=user.org_id,
        timezone_name=user.timezone,
        payload=payload,
    )

    return TimeEntryOut.model_validate(
        entry
    )


# =========================================================
# UPDATE TIME ENTRY
# =========================================================


@router.patch(
    "/{entry_id}",
    response_model=TimeEntryOut,
)
async def update_time_entry(
    entry_id: uuid.UUID,
    payload: TimeEntryUpdate,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TimeEntryOut:
    """
    Update a draft time entry.

    The request must include the current version.
    """

    entry = await time_entry_service.update_time_entry(
        db,
        entry_id=entry_id,
        user_id=user.id,
        org_id=user.org_id,
        payload=payload,
    )

    return TimeEntryOut.model_validate(entry)


# =========================================================
# DELETE TIME ENTRY
# =========================================================


@router.delete(
    "/{entry_id}",
    response_model=OkResponse,
)
async def delete_time_entry(
    entry_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OkResponse:
    """
    Delete a draft time entry owned by the logged-in user.
    """

    await time_entry_service.delete_time_entry(
        db,
        entry_id=entry_id,
        user_id=user.id,
    )

    return OkResponse(ok=True)