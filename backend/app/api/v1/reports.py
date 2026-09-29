from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.core.database import get_db
from app.core.permissions import CurrentUser
from app.schemas.report import (
    ProjectReportOut,
    ReportSummaryOut,
)
from app.services import report_service


router = APIRouter(
    prefix="/reports",
    tags=["reports"],
)


# =========================================================
# PHASE 5.1
# REPORT SUMMARY
# =========================================================

@router.get(
    "/summary",
    response_model=ReportSummaryOut,
)
async def get_report_summary(
    period_start: date = Query(
        ...,
        description="Report start date",
    ),
    period_end: date = Query(
        ...,
        description="Report end date",
    ),
    user: CurrentUser = Depends(
        get_current_user
    ),
    db: AsyncSession = Depends(
        get_db
    ),
) -> ReportSummaryOut:
    """
    Return report summary for the
    currently logged-in user.
    """

    return await report_service.get_report_summary(
        db,
        user_id=user.id,
        org_id=user.org_id,
        period_start=period_start,
        period_end=period_end,
    )


# =========================================================
# PHASE 5.2
# PROJECT-WISE REPORT
# =========================================================

@router.get(
    "/projects",
    response_model=ProjectReportOut,
)
async def get_project_report(
    period_start: date = Query(
        ...,
        description="Report start date",
    ),
    period_end: date = Query(
        ...,
        description="Report end date",
    ),
    user: CurrentUser = Depends(
        get_current_user
    ),
    db: AsyncSession = Depends(
        get_db
    ),
) -> ProjectReportOut:
    """
    Return project-wise logged work
    for the currently logged-in user.

    Includes:
    - project name
    - project code
    - total minutes
    - billable minutes
    - non-billable minutes
    - entry count
    - percentage of total logged time
    """

    return await report_service.get_project_report(
        db,
        user_id=user.id,
        org_id=user.org_id,
        period_start=period_start,
        period_end=period_end,
    )