from __future__ import annotations

import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.core.database import get_db
from app.core.exceptions import Forbidden
from app.core.permissions import CurrentUser
from app.models.enums import TimesheetStatus
from app.models.team import TeamMember
from app.models.timesheet_period import TimesheetPeriod
from app.models.user import AppUser
from app.schemas.timesheet import (
    ApprovalOut,
    TimesheetApprovalRequest,
    TimesheetPeriodOut,
    TimesheetRejectRequest,
)
from app.services import timesheet_service

from sqlalchemy import func, select

from app.models.attendance_day import AttendanceDay
from app.models.organization import OrgPolicy
from app.models.time_entry import TimeEntry

router = APIRouter(
    prefix="/approvals",
    tags=["approvals"],
)


# =========================================================
# MANAGER CHECK
# =========================================================


def _require_manager_or_admin(
    user: CurrentUser,
) -> None:
    """
    Only managers and admins may use
    approval endpoints.
    """

    if not (
        user.is_manager
        or user.is_admin
    ):
        raise Forbidden(
            "Manager or admin access required"
        )


# =========================================================
# MANAGED USER IDS
# =========================================================


async def _get_managed_user_ids(
    db: AsyncSession,
    *,
    user: CurrentUser,
) -> set[uuid.UUID]:
    """
    Return the user IDs the current manager
    is allowed to review.

    Admins may review all users.
    Managers may review members of teams
    they manage.
    """

    if user.is_admin:
       stmt = select(
        AppUser.id
       ).where(
        AppUser.org_id == user.org_id
    )

       result = await db.execute(
        stmt
    )

       return set(
        result.scalars().all()
    )

    if not user.managed_team_ids:
        return set()

    stmt = select(
        TeamMember.user_id
    ).where(
        TeamMember.team_id.in_(
            user.managed_team_ids
        )
    )

    result = await db.execute(
        stmt
    )

    managed_user_ids = set(
        result.scalars().all()
    )

    # Do not include the manager's own
    # timesheet in their approval queue.
    managed_user_ids.discard(
        user.id
    )

    return managed_user_ids


# =========================================================
# CHECK PERIOD ACCESS
# =========================================================


async def _require_period_access(
    db: AsyncSession,
    *,
    user: CurrentUser,
    period: TimesheetPeriod,
) -> None:
    """
    Ensure that the manager is allowed
    to approve/reject this employee.
    """

    if user.is_admin:
        return

    managed_user_ids = (
        await _get_managed_user_ids(
            db,
            user=user,
        )
    )

    if (
        period.user_id
        not in managed_user_ids
    ):
        raise Forbidden(
            "You are not allowed to review this timesheet"
        )


# =========================================================
# LIST PENDING APPROVALS
# =========================================================
@router.get(
    "",
    response_model=list[ApprovalOut],
)
async def list_approvals(
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(
        get_current_user
    ),
) -> list[ApprovalOut]:
    """
    Return submitted timesheets awaiting review.

    Managers see only members of teams
    they manage.

    Admins see all submitted timesheets.
    """

    _require_manager_or_admin(
        user
    )

    managed_user_ids = (
        await _get_managed_user_ids(
            db,
            user=user,
        )
    )

    if (
        not user.is_admin
        and not managed_user_ids
    ):
        return []

    # =====================================================
    # JOIN TIMESHEET + USER
    # =====================================================

    stmt = (
        select(
            TimesheetPeriod,
            AppUser,
        )
        .join(
            AppUser,
            AppUser.id
            == TimesheetPeriod.user_id,
        )
        .where(
            TimesheetPeriod.status
            == TimesheetStatus.submitted
        )
    )

    # =====================================================
    # MANAGER SCOPE
    # =====================================================

    if not user.is_admin:
        stmt = stmt.where(
            TimesheetPeriod.user_id.in_(
                managed_user_ids
            )
        )

    stmt = stmt.order_by(
        TimesheetPeriod.submitted_at.asc()
    )

    result = await db.execute(
        stmt
    )

    rows = result.all()

    # =====================================================
    # BUILD RESPONSE
    # =====================================================

    return [
        ApprovalOut(
            id=period.id,

            user_id=period.user_id,

            employee_name=
                employee.full_name,

            employee_email=
                employee.email,

            period_start=
                period.period_start,

            period_end=
                period.period_end,

            status=
                period.status,

            submitted_at=
                period.submitted_at,

            approved_by=
                period.approved_by,

            approved_at=
                period.approved_at,

            comment=
                period.comment,

            version=
                period.version,

            created_at=
                period.created_at,

            updated_at=
                period.updated_at,
        )

        for period, employee in rows
    ]


# =========================================================
# APPROVE
# =========================================================


@router.get(
    "",
    response_model=list[ApprovalOut],
)
async def list_approvals(
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(
        get_current_user
    ),
) -> list[ApprovalOut]:
    """
    Return submitted timesheets awaiting review.

    Managers see only members of teams
    they manage.

    Admins see all submitted timesheets.

    Also returns:
    - attendance time
    - logged time
    - expected time
    - variance
    - recording coverage
    - threshold status
    """

    _require_manager_or_admin(
        user
    )

    managed_user_ids = (
        await _get_managed_user_ids(
            db,
            user=user,
        )
    )

    if (
        not user.is_admin
        and not managed_user_ids
    ):
        return []


    # =====================================================
    # ORGANIZATION POLICY
    # =====================================================

    policy_stmt = select(
        OrgPolicy
    ).where(
        OrgPolicy.org_id
        == user.org_id
    )

    policy_result = await db.execute(
        policy_stmt
    )

    policy = (
        policy_result
        .scalar_one_or_none()
    )

    workday_hours = (
        policy.workday_hours
        if policy
        else 8
    )

    variance_threshold_minutes = (
        policy.variance_threshold_minutes
        if policy
        else 60
    )


    # =====================================================
    # TIMESHEET + EMPLOYEE
    # =====================================================

    stmt = (
        select(
            TimesheetPeriod,
            AppUser,
        )
        .join(
            AppUser,
            AppUser.id
            == TimesheetPeriod.user_id,
        )
        .where(
            TimesheetPeriod.status
            == TimesheetStatus.submitted
        )
    )


    # =====================================================
    # MANAGER SCOPE
    # =====================================================

    if not user.is_admin:
        stmt = stmt.where(
            TimesheetPeriod.user_id.in_(
                managed_user_ids
            )
        )

    stmt = stmt.order_by(
        TimesheetPeriod.submitted_at.asc()
    )

    result = await db.execute(
        stmt
    )

    rows = result.all()


    approvals: list[ApprovalOut] = []


    # =====================================================
    # BUILD EACH APPROVAL
    # =====================================================

    for period, employee in rows:

        # -------------------------------------------------
        # LOGGED TIME
        # -------------------------------------------------

        logged_stmt = select(
            func.coalesce(
                func.sum(
                    TimeEntry.duration_minutes
                ),
                0,
            )
        ).where(
            TimeEntry.user_id
            == period.user_id,

            TimeEntry.work_date
            >= period.period_start,

            TimeEntry.work_date
            <= period.period_end,
        )

        logged_result = await db.execute(
            logged_stmt
        )

        logged_minutes = int(
            logged_result.scalar_one()
            or 0
        )


        # -------------------------------------------------
        # ATTENDANCE TIME
        # -------------------------------------------------

        attendance_stmt = select(
            func.coalesce(
                func.sum(
                    AttendanceDay.total_session_seconds
                ),
                0,
            )
        ).where(
            AttendanceDay.user_id
            == period.user_id,

            AttendanceDay.work_date
            >= period.period_start,

            AttendanceDay.work_date
            <= period.period_end,
        )

        attendance_result = await db.execute(
            attendance_stmt
        )

        attendance_seconds = int(
            attendance_result.scalar_one()
            or 0
        )

        attendance_minutes = (
            attendance_seconds // 60
        )


        # -------------------------------------------------
        # WORKING DAYS
        # Monday-Friday only
        # -------------------------------------------------

        working_days = 0

        current_date = (
            period.period_start
        )

        while (
            current_date
            <= period.period_end
        ):
            if current_date.weekday() < 5:
                working_days += 1

            current_date = (
                current_date
                + timedelta(days=1)
            )


        # -------------------------------------------------
        # EXPECTED TIME
        # -------------------------------------------------

        expected_minutes = (
            working_days
            * workday_hours
            * 60
        )


        # -------------------------------------------------
        # VARIANCE
        # logged - attendance
        # -------------------------------------------------

        variance_minutes = (
            logged_minutes
            - attendance_minutes
        )


        # -------------------------------------------------
        # ATTENDANCE VARIANCE
        # attendance - expected
        # -------------------------------------------------

        attendance_variance_minutes = (
            attendance_minutes
            - expected_minutes
        )


        # -------------------------------------------------
        # RECORDING COVERAGE
        # -------------------------------------------------

        if attendance_minutes > 0:
            recording_coverage_percent = round(
                (
                    logged_minutes
                    / attendance_minutes
                )
                * 100,
                1,
            )
        else:
            recording_coverage_percent = (
                0.0
            )


        # -------------------------------------------------
        # 8-HOUR / POLICY THRESHOLD
        # -------------------------------------------------

        threshold_satisfied = (
            attendance_minutes
            >= expected_minutes
        )


        # -------------------------------------------------
        # OPTIONAL VARIANCE FLAG
        # -------------------------------------------------

        variance_within_policy = (
            abs(
                variance_minutes
            )
            <= variance_threshold_minutes
        )


        approvals.append(
            ApprovalOut(
                id=period.id,

                user_id=
                    period.user_id,

                employee_name=
                    employee.full_name,

                employee_email=
                    employee.email,

                period_start=
                    period.period_start,

                period_end=
                    period.period_end,

                status=
                    period.status,

                submitted_at=
                    period.submitted_at,

                approved_by=
                    period.approved_by,

                approved_at=
                    period.approved_at,

                comment=
                    period.comment,

                version=
                    period.version,

                created_at=
                    period.created_at,

                updated_at=
                    period.updated_at,

                logged_minutes=
                    logged_minutes,

                attendance_minutes=
                    attendance_minutes,

                expected_minutes=
                    expected_minutes,

                variance_minutes=
                    variance_minutes,

                attendance_variance_minutes=
                    attendance_variance_minutes,

                recording_coverage_percent=
                    recording_coverage_percent,

                threshold_satisfied=
                    threshold_satisfied,
            )
        )


    return approvals


# =========================================================
# REJECT / REQUEST CHANGES
# =========================================================


@router.post(
    "/{period_id}/reject",
    response_model=TimesheetPeriodOut,
)
async def reject(
    period_id: uuid.UUID,
    payload: TimesheetRejectRequest,
    db: AsyncSession = Depends(
        get_db
    ),
    user: CurrentUser = Depends(
        get_current_user
    ),
) -> TimesheetPeriodOut:
    """
    Reject a submitted timesheet and
    reopen its entries for editing.
    """

    _require_manager_or_admin(
        user
    )

    period = (
        await timesheet_service
        .get_period_or_404(
            db,
            period_id=period_id,
        )
    )

    await _require_period_access(
        db,
        user=user,
        period=period,
    )

    rejected_period = (
        await timesheet_service
        .reject_timesheet(
            db,
            period_id=period_id,
            approver_user_id=user.id,
            version=payload.version,
            comment=payload.comment,
        )
    )

    return TimesheetPeriodOut.model_validate(
        rejected_period
    )