from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.core.database import get_db
from app.core.permissions import CurrentUser
from app.schemas.timesheet import (
    TimesheetPeriodOut,
    TimesheetSubmitRequest,
    TimesheetWeekSummary,
)
from app.services import timesheet_service


router = APIRouter(
    prefix="/timesheets",
    tags=["timesheets"],
)


# =========================================================
# GET WEEK SUMMARY
# =========================================================


@router.get(
    "/week",
    response_model=TimesheetWeekSummary,
)
async def get_week(
    period_start: date = Query(...),
    period_end: date = Query(...),
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> TimesheetWeekSummary:
    """
    Return the current user's weekly timesheet summary.

    Example:
    GET /api/v1/timesheets/week
        ?period_start=2026-09-21
        &period_end=2026-09-27
    """

    summary = (
        await timesheet_service
        .get_week_summary(
            db,
            user_id=user.id,
            period_start=period_start,
            period_end=period_end,
        )
    )

    return TimesheetWeekSummary(
        **summary
    )


# =========================================================
# SUBMIT WEEK
# =========================================================

@router.post(
    "/submit",
    response_model=TimesheetPeriodOut,
)
async def submit_week(
    payload: TimesheetSubmitRequest,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> TimesheetPeriodOut:
    """
    Submit one weekly timesheet.

    The service will:
    - validate Monday -> Sunday
    - reject empty weeks
    - prevent duplicate submission
    - change time entries to submitted
    - change the timesheet period to submitted
    """

    period = (
        await timesheet_service
        .submit_timesheet(
            db,
            user_id=user.id,
            period_start=payload.period_start,
            period_end=payload.period_end,
        )
    )

    # Make sure database-generated values such as
    # updated_at are loaded before Pydantic reads them.
    await db.flush()
    await db.refresh(period)

    return TimesheetPeriodOut.model_validate(
        period
    )