from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    Conflict,
    NotFound,
    ValidationError,
)
from app.models.enums import (
    TimeEntryStatus,
    TimesheetStatus,
)
from app.models.time_entry import TimeEntry
from app.models.timesheet_period import TimesheetPeriod


# =========================================================
# BASIC WEEK VALIDATION
# =========================================================


def _validate_period(
    period_start: date,
    period_end: date,
) -> None:
    """
    Validate the requested timesheet period.

    For this project we expect:
    Monday -> Sunday
    7 calendar days.
    """

    if period_start > period_end:
        raise ValidationError(
            "period_start cannot be after period_end"
        )

    number_of_days = (
        period_end - period_start
    ).days + 1

    if number_of_days != 7:
        raise ValidationError(
            "Timesheet period must contain exactly 7 days"
        )

    # Monday = 0
    if period_start.weekday() != 0:
        raise ValidationError(
            "Timesheet period must start on Monday"
        )

    # Sunday = 6
    if period_end.weekday() != 6:
        raise ValidationError(
            "Timesheet period must end on Sunday"
        )


# =========================================================
# GET PERIOD
# =========================================================


async def get_period(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    period_start: date,
    period_end: date,
    for_update: bool = False,
) -> TimesheetPeriod | None:
    """
    Get one user's timesheet period.
    """

    stmt = select(
        TimesheetPeriod
    ).where(
        TimesheetPeriod.user_id
        == user_id,
        TimesheetPeriod.period_start
        == period_start,
        TimesheetPeriod.period_end
        == period_end,
    )

    if for_update:
        stmt = stmt.with_for_update()

    result = await db.execute(
        stmt
    )

    return result.scalar_one_or_none()


# =========================================================
# GET PERIOD OR 404
# =========================================================


async def get_period_or_404(
    db: AsyncSession,
    *,
    period_id: uuid.UUID,
    for_update: bool = False,
) -> TimesheetPeriod:
    """
    Get a timesheet period by ID.
    """

    stmt = select(
        TimesheetPeriod
    ).where(
        TimesheetPeriod.id
        == period_id
    )

    if for_update:
        stmt = stmt.with_for_update()

    result = await db.execute(
        stmt
    )

    period = (
        result.scalar_one_or_none()
    )

    if period is None:
        raise NotFound(
            "Timesheet period not found"
        )

    return period


# =========================================================
# GET USER PERIOD BY ID
# =========================================================


async def get_user_period_or_404(
    db: AsyncSession,
    *,
    period_id: uuid.UUID,
    user_id: uuid.UUID,
    for_update: bool = False,
) -> TimesheetPeriod:
    """
    Get a period only when it belongs
    to the current user.
    """

    stmt = select(
        TimesheetPeriod
    ).where(
        TimesheetPeriod.id
        == period_id,
        TimesheetPeriod.user_id
        == user_id,
    )

    if for_update:
        stmt = stmt.with_for_update()

    result = await db.execute(
        stmt
    )

    period = (
        result.scalar_one_or_none()
    )

    if period is None:
        raise NotFound(
            "Timesheet period not found"
        )

    return period


# =========================================================
# WEEK TIME ENTRIES
# =========================================================


async def list_period_entries(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    period_start: date,
    period_end: date,
    for_update: bool = False,
) -> list[TimeEntry]:
    """
    Get every time entry belonging to the user
    for the selected week.
    """

    stmt = (
        select(TimeEntry)
        .where(
            TimeEntry.user_id
            == user_id,

            TimeEntry.work_date
            >= period_start,

            TimeEntry.work_date
            <= period_end,
        )
        .order_by(
            TimeEntry.work_date.asc(),
            TimeEntry.created_at.asc(),
        )
    )

    if for_update:
        stmt = stmt.with_for_update()

    result = await db.execute(
        stmt
    )

    return list(
        result.scalars()
        .unique()
        .all()
    )


# =========================================================
# WEEK TOTAL
# =========================================================


async def get_period_totals(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    period_start: date,
    period_end: date,
) -> tuple[int, int]:
    """
    Return:

    total_minutes
    entry_count
    """

    stmt = select(
        func.coalesce(
            func.sum(
                TimeEntry.duration_minutes
            ),
            0,
        ),
        func.count(
            TimeEntry.id
        ),
    ).where(
        TimeEntry.user_id
        == user_id,

        TimeEntry.work_date
        >= period_start,

        TimeEntry.work_date
        <= period_end,
    )

    result = await db.execute(
        stmt
    )

    total_minutes, entry_count = (
        result.one()
    )

    return (
        int(total_minutes or 0),
        int(entry_count or 0),
    )


# =========================================================
# GET WEEK SUMMARY
# =========================================================


async def get_week_summary(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    period_start: date,
    period_end: date,
) -> dict:
    """
    Get weekly status + total logged time.

    A TimesheetPeriod row may not exist yet.
    In that case the week is treated as draft.
    """

    _validate_period(
        period_start,
        period_end,
    )

    period = await get_period(
        db,
        user_id=user_id,
        period_start=period_start,
        period_end=period_end,
    )

    (
        total_minutes,
        entry_count,
    ) = await get_period_totals(
        db,
        user_id=user_id,
        period_start=period_start,
        period_end=period_end,
    )

    status = (
        period.status
        if period is not None
        else TimesheetStatus.draft
    )

    return {
        "period": period,
        "period_start":
            period_start,
        "period_end":
            period_end,
        "total_minutes":
            total_minutes,
        "entry_count":
            entry_count,
        "status":
            status,
    }


# =========================================================
# CREATE DRAFT PERIOD
# =========================================================


async def get_or_create_draft_period(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    period_start: date,
    period_end: date,
) -> TimesheetPeriod:
    """
    Get an existing timesheet period.

    If none exists, create a draft period.
    """

    _validate_period(
        period_start,
        period_end,
    )

    period = await get_period(
        db,
        user_id=user_id,
        period_start=period_start,
        period_end=period_end,
        for_update=True,
    )

    if period is not None:
        return period

    period = TimesheetPeriod(
        user_id=user_id,
        period_start=period_start,
        period_end=period_end,
        status=TimesheetStatus.draft,
        submitted_at=None,
        approved_by=None,
        approved_at=None,
        comment=None,
        version=1,
    )

    db.add(
        period
    )

    await db.flush()

    return period


# =========================================================
# SUBMIT WEEK
# =========================================================


async def submit_timesheet(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    period_start: date,
    period_end: date,
) -> TimesheetPeriod:
    """
    Submit one week.

    Rules:
    1. Week must be Monday -> Sunday.
    2. At least one time entry must exist.
    3. Only draft/rejected periods may be submitted.
    4. Every entry is changed to submitted.
    5. Period status becomes submitted.
    """

    _validate_period(
        period_start,
        period_end,
    )

    # -----------------------------------------------------
    # Prevent submitting a week that has not finished
    # -----------------------------------------------------

    today = date.today()

    if period_end > today:
        raise ValidationError(
            "You cannot submit a timesheet before the week has ended"
        )

    # -----------------------------------------------------
    # Lock weekly entries
    # -----------------------------------------------------

    entries = await list_period_entries(
        db,
        user_id=user_id,
        period_start=period_start,
        period_end=period_end,
        for_update=True,
    )

    if not entries:
        raise ValidationError(
            "Cannot submit an empty timesheet"
        )

    # -----------------------------------------------------
    # Get/create period
    # -----------------------------------------------------

    period = (
        await get_or_create_draft_period(
            db,
            user_id=user_id,
            period_start=period_start,
            period_end=period_end,
        )
    )

    # -----------------------------------------------------
    # Status validation
    # -----------------------------------------------------

    if (
        period.status
        == TimesheetStatus.submitted
    ):
        raise Conflict(
            "Timesheet has already been submitted"
        )

    if (
        period.status
        == TimesheetStatus.approved
    ):
        raise Conflict(
            "Approved timesheets cannot be submitted again"
        )

    if period.status not in {
        TimesheetStatus.draft,
        TimesheetStatus.rejected,
    }:
        raise Conflict(
            "Timesheet cannot be submitted in its current state"
        )

    # -----------------------------------------------------
    # Validate entry states
    # -----------------------------------------------------

    for entry in entries:
        if (
            entry.status
            == TimeEntryStatus.approved
        ):
            raise Conflict(
                "An approved entry cannot be submitted again"
            )

        if (
            entry.status
            == TimeEntryStatus.submitted
        ):
            raise Conflict(
                "One or more entries are already submitted"
            )

    # -----------------------------------------------------
    # Submit entries
    # -----------------------------------------------------

    for entry in entries:
        entry.status = (
            TimeEntryStatus.submitted
        )

        entry.version += 1

    # -----------------------------------------------------
    # Submit period
    # -----------------------------------------------------

    period.status = (
        TimesheetStatus.submitted
    )

    period.submitted_at = (
        datetime.now(
            timezone.utc
        )
    )

    # Old rejection/approval data must not
    # remain on a new submission.
    period.approved_by = None
    period.approved_at = None
    period.comment = None

    period.version += 1

    await db.flush()

    return period


# =========================================================
# LIST SUBMITTED TIMESHEETS
# =========================================================


async def list_submitted_timesheets(
    db: AsyncSession,
) -> list[TimesheetPeriod]:
    """
    Used later by the manager Approvals page.

    Authorization/team filtering should be applied
    by the API/service layer that knows which users
    the manager is allowed to review.
    """

    stmt = (
        select(TimesheetPeriod)
        .where(
            TimesheetPeriod.status
            == TimesheetStatus.submitted
        )
        .order_by(
            TimesheetPeriod.submitted_at.asc()
        )
    )

    result = await db.execute(
        stmt
    )

    return list(
        result.scalars().all()
    )


# =========================================================
# APPROVE TIMESHEET
# =========================================================


async def approve_timesheet(
    db: AsyncSession,
    *,
    period_id: uuid.UUID,
    approver_user_id: uuid.UUID,
    version: int,
    comment: str | None = None,
) -> TimesheetPeriod:
    """
    Approve a submitted timesheet.

    Manager authorization will be checked before
    this service is called from the API.
    """

    period = (
        await get_period_or_404(
            db,
            period_id=period_id,
            for_update=True,
        )
    )

    # -----------------------------------------------------
    # Optimistic concurrency
    # -----------------------------------------------------

    if period.version != version:
        raise Conflict(
            "Timesheet was modified by another session"
        )

    # -----------------------------------------------------
    # Status check
    # -----------------------------------------------------

    if (
        period.status
        != TimesheetStatus.submitted
    ):
        raise Conflict(
            "Only submitted timesheets can be approved"
        )

    # -----------------------------------------------------
    # Lock entries
    # -----------------------------------------------------

    entries = await list_period_entries(
        db,
        user_id=period.user_id,
        period_start=period.period_start,
        period_end=period.period_end,
        for_update=True,
    )

    if not entries:
        raise ValidationError(
            "Timesheet has no time entries"
        )

    # -----------------------------------------------------
    # Approve entries
    # -----------------------------------------------------

    for entry in entries:
        if (
            entry.status
            != TimeEntryStatus.submitted
        ):
            raise Conflict(
                "All time entries must be submitted before approval"
            )

        entry.status = (
            TimeEntryStatus.approved
        )

        entry.version += 1

    # -----------------------------------------------------
    # Approve period
    # -----------------------------------------------------

    period.status = (
        TimesheetStatus.approved
    )

    period.approved_by = (
        approver_user_id
    )

    period.approved_at = (
        datetime.now(
            timezone.utc
        )
    )

    period.comment = (
        comment.strip()
        if comment
        else None
    )

    period.version += 1

    await db.flush()

    return period


# =========================================================
# REJECT TIMESHEET
# =========================================================


async def reject_timesheet(
    db: AsyncSession,
    *,
    period_id: uuid.UUID,
    approver_user_id: uuid.UUID,
    version: int,
    comment: str,
) -> TimesheetPeriod:
    """
    Reject a submitted timesheet.

    Rejected entries become editable again by
    changing them back to draft.
    """

    clean_comment = (
        comment.strip()
    )

    if not clean_comment:
        raise ValidationError(
            "A rejection comment is required"
        )

    period = (
        await get_period_or_404(
            db,
            period_id=period_id,
            for_update=True,
        )
    )

    # -----------------------------------------------------
    # Optimistic concurrency
    # -----------------------------------------------------

    if period.version != version:
        raise Conflict(
            "Timesheet was modified by another session"
        )

    # -----------------------------------------------------
    # Status
    # -----------------------------------------------------

    if (
        period.status
        != TimesheetStatus.submitted
    ):
        raise Conflict(
            "Only submitted timesheets can be rejected"
        )

    # -----------------------------------------------------
    # Lock entries
    # -----------------------------------------------------

    entries = await list_period_entries(
        db,
        user_id=period.user_id,
        period_start=period.period_start,
        period_end=period.period_end,
        for_update=True,
    )

    # -----------------------------------------------------
    # Re-open entries
    # -----------------------------------------------------

    for entry in entries:
        if (
            entry.status
            == TimeEntryStatus.submitted
        ):
            entry.status = (
                TimeEntryStatus.draft
            )

            entry.version += 1

    # -----------------------------------------------------
    # Reject period
    # -----------------------------------------------------

    period.status = (
        TimesheetStatus.rejected
    )

    period.approved_by = (
        approver_user_id
    )

    period.approved_at = (
        datetime.now(
            timezone.utc
        )
    )

    period.comment = (
        clean_comment
    )

    period.version += 1

    await db.flush()

    return period