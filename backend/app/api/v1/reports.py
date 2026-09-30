from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.core.database import get_db
from app.core.permissions import CurrentUser
from app.schemas.report import (
    AttendanceComparisonItemOut,
    DailyReportItemOut,
    MemberReportItemOut,
    ProjectReportOut,
    ReportSummaryOut,
)
from app.services import report_service

router = APIRouter(prefix="/reports", tags=["reports"])


async def _resolve_scope(
    db: AsyncSession,
    user: CurrentUser,
    user_id: uuid.UUID | None,
) -> list[uuid.UUID]:
    return await report_service.resolve_report_user_ids(
        db, user=user, requested_user_id=user_id
    )


@router.get("/summary", response_model=ReportSummaryOut)
async def get_report_summary(
    period_start: date = Query(..., description="Report start date"),
    period_end: date = Query(..., description="Report end date"),
    user_id: uuid.UUID | None = Query(default=None),
    project_id: uuid.UUID | None = Query(default=None),
    billable: bool | None = Query(default=None),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReportSummaryOut:
    user_ids = await _resolve_scope(db, user, user_id)
    return await report_service.get_report_summary(
        db,
        user_ids=user_ids,
        org_id=user.org_id,
        period_start=period_start,
        period_end=period_end,
        project_id=project_id,
        billable=billable,
    )


@router.get("/projects", response_model=ProjectReportOut)
async def get_project_report(
    period_start: date = Query(...),
    period_end: date = Query(...),
    user_id: uuid.UUID | None = Query(default=None),
    project_id: uuid.UUID | None = Query(default=None),
    billable: bool | None = Query(default=None),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectReportOut:
    user_ids = await _resolve_scope(db, user, user_id)
    return await report_service.get_project_report(
        db,
        user_ids=user_ids,
        org_id=user.org_id,
        period_start=period_start,
        period_end=period_end,
        project_id=project_id,
        billable=billable,
    )


@router.get("/members", response_model=list[MemberReportItemOut])
async def get_member_report(
    period_start: date = Query(...),
    period_end: date = Query(...),
    user_id: uuid.UUID | None = Query(default=None),
    project_id: uuid.UUID | None = Query(default=None),
    billable: bool | None = Query(default=None),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MemberReportItemOut]:
    user_ids = await _resolve_scope(db, user, user_id)
    return await report_service.get_member_report(
        db,
        user_ids=user_ids,
        org_id=user.org_id,
        period_start=period_start,
        period_end=period_end,
        project_id=project_id,
        billable=billable,
    )


@router.get("/daily", response_model=list[DailyReportItemOut])
async def get_daily_report(
    period_start: date = Query(...),
    period_end: date = Query(...),
    user_id: uuid.UUID | None = Query(default=None),
    project_id: uuid.UUID | None = Query(default=None),
    billable: bool | None = Query(default=None),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[DailyReportItemOut]:
    user_ids = await _resolve_scope(db, user, user_id)
    return await report_service.get_daily_report(
        db,
        user_ids=user_ids,
        org_id=user.org_id,
        period_start=period_start,
        period_end=period_end,
        project_id=project_id,
        billable=billable,
    )


@router.get("/attendance", response_model=list[AttendanceComparisonItemOut])
async def get_attendance_comparison(
    period_start: date = Query(...),
    period_end: date = Query(...),
    user_id: uuid.UUID | None = Query(default=None),
    project_id: uuid.UUID | None = Query(default=None),
    billable: bool | None = Query(default=None),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AttendanceComparisonItemOut]:
    user_ids = await _resolve_scope(db, user, user_id)
    return await report_service.get_attendance_comparison(
        db,
        user_ids=user_ids,
        org_id=user.org_id,
        period_start=period_start,
        period_end=period_end,
        project_id=project_id,
        billable=billable,
    )
