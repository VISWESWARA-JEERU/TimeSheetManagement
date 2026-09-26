from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import TimesheetStatus


# =========================================================
# SUBMIT REQUEST
# =========================================================

class TimesheetSubmitRequest(BaseModel):
    period_start: date
    period_end: date

    @model_validator(mode="after")
    def validate_period(self):
        if self.period_start > self.period_end:
            raise ValueError(
                "period_start cannot be after period_end"
            )

        return self


# =========================================================
# APPROVAL REQUEST
# =========================================================

class TimesheetApprovalRequest(BaseModel):
    version: int = Field(ge=1)

    comment: str | None = Field(
        default=None,
        max_length=2000,
    )


# =========================================================
# REJECTION REQUEST
# =========================================================

class TimesheetRejectRequest(BaseModel):
    version: int = Field(ge=1)

    comment: str = Field(
        min_length=1,
        max_length=2000,
    )


# =========================================================
# TIMESHEET PERIOD OUTPUT
# =========================================================

class TimesheetPeriodOut(BaseModel):
    model_config = ConfigDict(
        from_attributes=True
    )

    id: uuid.UUID

    user_id: uuid.UUID

    period_start: date
    period_end: date

    status: TimesheetStatus

    submitted_at: datetime | None

    approved_by: uuid.UUID | None
    approved_at: datetime | None

    comment: str | None

    version: int

    created_at: datetime
    updated_at: datetime


class ApprovalOut(BaseModel):
    id: uuid.UUID

    user_id: uuid.UUID

    employee_name: str
    employee_email: str

    period_start: date
    period_end: date

    status: TimesheetStatus

    submitted_at: datetime | None

    approved_by: uuid.UUID | None
    approved_at: datetime | None

    comment: str | None

    version: int

    created_at: datetime
    updated_at: datetime

    # =====================================================
    # APPROVAL METRICS
    # =====================================================

    logged_minutes: int = 0

    attendance_minutes: int = 0

    expected_minutes: int = 0

    # Logged Time - Attendance Time
    variance_minutes: int = 0

    # Attendance Time - Expected Time
    attendance_variance_minutes: int = 0

    recording_coverage_percent: float = 0.0

    threshold_satisfied: bool = False
    
# =========================================================
# WEEK SUMMARY
# =========================================================

class TimesheetWeekSummary(BaseModel):
    period: TimesheetPeriodOut | None = None

    period_start: date
    period_end: date

    total_minutes: int = 0
    entry_count: int = 0

    status: TimesheetStatus = TimesheetStatus.draft