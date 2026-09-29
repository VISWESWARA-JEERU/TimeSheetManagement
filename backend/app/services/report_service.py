from __future__ import annotations

import uuid
from datetime import date, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.models.attendance_day import AttendanceDay
from app.models.organization import OrgPolicy
from app.models.project import Project
from app.models.time_entry import TimeEntry

from app.schemas.report import (
    ProjectReportItemOut,
    ProjectReportOut,
    ReportSummaryOut,
)


# =========================================================
# HELPERS
# =========================================================

def _validate_date_range(
    period_start: date,
    period_end: date,
) -> None:
    """
    Validate the selected report date range.
    """

    if period_start > period_end:
        raise ValidationError(
            "period_start cannot be after period_end"
        )


def _count_workdays(
    period_start: date,
    period_end: date,
) -> int:
    """
    Count Monday-Friday working days
    inside the selected period.
    """

    current_date = period_start

    workdays = 0

    while current_date <= period_end:

        if current_date.weekday() < 5:
            workdays += 1

        current_date += timedelta(
            days=1
        )

    return workdays


# =========================================================
# PHASE 5.1
# REPORT SUMMARY
# =========================================================

async def get_report_summary(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    period_start: date,
    period_end: date,
) -> ReportSummaryOut:
    """
    Return summary report for the
    currently logged-in user.
    """

    # -----------------------------------------------------
    # VALIDATE DATE RANGE
    # -----------------------------------------------------

    _validate_date_range(
        period_start,
        period_end,
    )

    # =====================================================
    # TIME ENTRY TOTALS
    # =====================================================

    time_entry_stmt = (
        select(
            func.coalesce(
                func.sum(
                    TimeEntry.duration_minutes
                ),
                0,
            ).label(
                "total_minutes"
            ),

            func.coalesce(
                func.sum(
                    case(
                        (
                            TimeEntry.billable.is_(True),
                            TimeEntry.duration_minutes,
                        ),
                        else_=0,
                    )
                ),
                0,
            ).label(
                "billable_minutes"
            ),

            func.count(
                TimeEntry.id
            ).label(
                "entry_count"
            ),
        )
        .where(
            TimeEntry.user_id
            == user_id,

            TimeEntry.work_date
            >= period_start,

            TimeEntry.work_date
            <= period_end,
        )
    )

    time_entry_result = await db.execute(
        time_entry_stmt
    )

    time_entry_row = (
        time_entry_result.one()
    )

    total_minutes = int(
        time_entry_row.total_minutes
        or 0
    )

    billable_minutes = int(
        time_entry_row.billable_minutes
        or 0
    )

    non_billable_minutes = (
        total_minutes
        - billable_minutes
    )

    entry_count = int(
        time_entry_row.entry_count
        or 0
    )

    # =====================================================
    # ATTENDANCE TOTAL
    # =====================================================

    attendance_stmt = (
        select(
            func.coalesce(
                func.sum(
                    AttendanceDay
                    .total_session_seconds
                ),
                0,
            )
        )
        .where(
            AttendanceDay.user_id
            == user_id,

            AttendanceDay.work_date
            >= period_start,

            AttendanceDay.work_date
            <= period_end,
        )
    )

    attendance_result = await db.execute(
        attendance_stmt
    )

    attendance_seconds = int(
        attendance_result.scalar_one()
        or 0
    )

    # =====================================================
    # ORGANIZATION POLICY
    # =====================================================

    policy_stmt = (
        select(
            OrgPolicy
        )
        .where(
            OrgPolicy.org_id
            == org_id
        )
    )

    policy_result = await db.execute(
        policy_stmt
    )

    policy = (
        policy_result.scalar_one_or_none()
    )

    workday_hours = (
        policy.workday_hours
        if policy is not None
        else 8
    )

    # =====================================================
    # EXPECTED WORKING TIME
    # =====================================================

    workday_count = (
        _count_workdays(
            period_start,
            period_end,
        )
    )

    expected_minutes = int(
        workday_count
        * workday_hours
        * 60
    )

    # =====================================================
    # RESPONSE
    # =====================================================

    return ReportSummaryOut(
        period_start=period_start,
        period_end=period_end,
        total_minutes=total_minutes,
        billable_minutes=billable_minutes,
        non_billable_minutes=(
            non_billable_minutes
        ),
        attendance_seconds=(
            attendance_seconds
        ),
        expected_minutes=(
            expected_minutes
        ),
        entry_count=entry_count,
    )


# =========================================================
# PHASE 5.2
# PROJECT-WISE REPORT
# =========================================================

async def get_project_report(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    period_start: date,
    period_end: date,
) -> ProjectReportOut:
    """
    Return the logged-in user's time grouped
    by project for the selected period.

    For each project this calculates:

    - total minutes
    - billable minutes
    - non-billable minutes
    - entry count
    - percentage of total logged time
    """

    # -----------------------------------------------------
    # VALIDATE DATE RANGE
    # -----------------------------------------------------

    _validate_date_range(
        period_start,
        period_end,
    )

    # =====================================================
    # PROJECT AGGREGATION QUERY
    # =====================================================

    project_stmt = (
        select(
            Project.id.label(
                "project_id"
            ),

            Project.name.label(
                "project_name"
            ),

            Project.code.label(
                "project_code"
            ),

            func.coalesce(
                func.sum(
                    TimeEntry.duration_minutes
                ),
                0,
            ).label(
                "total_minutes"
            ),

            func.coalesce(
                func.sum(
                    case(
                        (
                            TimeEntry.billable.is_(True),
                            TimeEntry.duration_minutes,
                        ),
                        else_=0,
                    )
                ),
                0,
            ).label(
                "billable_minutes"
            ),

            func.count(
                TimeEntry.id
            ).label(
                "entry_count"
            ),
        )

        .join(
            Project,
            Project.id
            == TimeEntry.project_id,
        )

        .where(
            TimeEntry.user_id
            == user_id,

            Project.org_id
            == org_id,

            TimeEntry.work_date
            >= period_start,

            TimeEntry.work_date
            <= period_end,
        )

        .group_by(
            Project.id,
            Project.name,
            Project.code,
        )

        .order_by(
            func.sum(
                TimeEntry.duration_minutes
            ).desc()
        )
    )

    result = await db.execute(
        project_stmt
    )

    rows = result.all()

    # =====================================================
    # OVERALL TOTAL
    # =====================================================

    overall_total_minutes = sum(
        int(
            row.total_minutes
            or 0
        )
        for row in rows
    )

    # =====================================================
    # BUILD PROJECT RESULTS
    # =====================================================

    projects: list[
        ProjectReportItemOut
    ] = []

    for row in rows:

        total_minutes = int(
            row.total_minutes
            or 0
        )

        billable_minutes = int(
            row.billable_minutes
            or 0
        )

        non_billable_minutes = (
            total_minutes
            - billable_minutes
        )

        entry_count = int(
            row.entry_count
            or 0
        )

        # ---------------------------------------------
        # PROJECT PERCENTAGE
        # ---------------------------------------------

        if overall_total_minutes > 0:

            percentage = round(
                (
                    total_minutes
                    / overall_total_minutes
                )
                * 100,
                2,
            )

        else:
            percentage = 0.0

        # ---------------------------------------------
        # ADD PROJECT
        # ---------------------------------------------

        projects.append(
            ProjectReportItemOut(
                project_id=(
                    row.project_id
                ),
                project_name=(
                    row.project_name
                ),
                project_code=(
                    row.project_code
                ),
                total_minutes=(
                    total_minutes
                ),
                billable_minutes=(
                    billable_minutes
                ),
                non_billable_minutes=(
                    non_billable_minutes
                ),
                entry_count=(
                    entry_count
                ),
                percentage=(
                    percentage
                ),
            )
        )

    # =====================================================
    # RESPONSE
    # =====================================================

    return ProjectReportOut(
        period_start=period_start,
        period_end=period_end,
        total_minutes=(
            overall_total_minutes
        ),
        projects=projects,
    )