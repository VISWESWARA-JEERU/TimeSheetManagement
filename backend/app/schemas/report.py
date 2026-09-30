from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel, Field


# =========================================================
# PHASE 5.1
# REPORT SUMMARY
# =========================================================

class ReportSummaryOut(BaseModel):
    """
    Summary of authorized users' work for a selected date range.
    """

    period_start: date

    period_end: date

    total_minutes: int = Field(
        default=0,
        ge=0,
    )

    billable_minutes: int = Field(
        default=0,
        ge=0,
    )

    non_billable_minutes: int = Field(
        default=0,
        ge=0,
    )

    attendance_seconds: int = Field(
        default=0,
        ge=0,
    )

    expected_minutes: int = Field(
        default=0,
        ge=0,
    )

    entry_count: int = Field(
        default=0,
        ge=0,
    )

    variance_minutes: int = 0


# =========================================================
# PHASE 5.2
# PROJECT REPORT ITEM
# =========================================================

class ProjectReportItemOut(BaseModel):
    """
    Report information for one project.
    """

    project_id: uuid.UUID

    project_name: str

    project_code: str | None = None

    total_minutes: int = Field(
        default=0,
        ge=0,
    )

    billable_minutes: int = Field(
        default=0,
        ge=0,
    )

    non_billable_minutes: int = Field(
        default=0,
        ge=0,
    )

    entry_count: int = Field(
        default=0,
        ge=0,
    )

    percentage: float = Field(
        default=0,
        ge=0,
        le=100,
    )


class MemberReportItemOut(BaseModel):
    user_id: uuid.UUID
    full_name: str
    email: str
    logged_minutes: int = Field(default=0, ge=0)
    entry_count: int = Field(default=0, ge=0)


class DailyReportItemOut(BaseModel):
    work_date: date
    logged_minutes: int = Field(default=0, ge=0)
    attendance_seconds: int = Field(default=0, ge=0)
    variance_minutes: int = 0


class AttendanceComparisonItemOut(BaseModel):
    user_id: uuid.UUID
    full_name: str
    email: str
    logged_minutes: int = Field(default=0, ge=0)
    attendance_seconds: int = Field(default=0, ge=0)
    variance_minutes: int = 0
    entry_count: int = Field(default=0, ge=0)


# =========================================================
# PHASE 5.2
# PROJECT-WISE REPORT
# =========================================================

class ProjectReportOut(BaseModel):
    """
    Project-wise report for
    a selected date range.
    """

    period_start: date

    period_end: date

    total_minutes: int = Field(
        default=0,
        ge=0,
    )

    projects: list[
        ProjectReportItemOut
    ] = Field(
        default_factory=list
    )