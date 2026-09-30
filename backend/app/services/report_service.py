from __future__ import annotations

import uuid
from datetime import date, timedelta

from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.exceptions import Forbidden, ValidationError
from app.core.permissions import CurrentUser
from app.models.attendance_day import AttendanceDay
from app.models.enums import Role
from app.models.organization import OrgPolicy
from app.models.project import Project
from app.models.team import Team, TeamMember
from app.models.time_entry import TimeEntry
from app.models.user import AppUser
from app.schemas.report import (
    AttendanceComparisonItemOut,
    DailyReportItemOut,
    MemberReportItemOut,
    ProjectReportItemOut,
    ProjectReportOut,
    ReportSummaryOut,
)


def _validate_date_range(period_start: date, period_end: date) -> None:
    if period_start > period_end:
        raise ValidationError("period_start cannot be after period_end")


def _count_workdays(period_start: date, period_end: date) -> int:
    current_date = period_start
    workdays = 0
    while current_date <= period_end:
        if current_date.weekday() < 5:
            workdays += 1
        current_date += timedelta(days=1)
    return workdays


async def resolve_report_user_ids(
    db: AsyncSession,
    *,
    user: CurrentUser,
    requested_user_id: uuid.UUID | None,
) -> list[uuid.UUID]:
    if user.is_admin:
        scope_stmt = select(AppUser.id).where(AppUser.org_id == user.org_id)
    elif Role.manager in user.roles:
        manager_membership = aliased(TeamMember)
        managed_user_ids = (
            select(TeamMember.user_id)
            .join(Team, Team.id == TeamMember.team_id)
            .join(manager_membership, manager_membership.team_id == Team.id)
            .where(
                Team.org_id == user.org_id,
                manager_membership.user_id == user.id,
                manager_membership.is_manager.is_(True),
            )
        )
        scope_stmt = select(AppUser.id).where(
            AppUser.org_id == user.org_id,
            (AppUser.id == user.id) | AppUser.id.in_(managed_user_ids),
        )
    else:
        scope_stmt = select(AppUser.id).where(
            AppUser.org_id == user.org_id,
            AppUser.id == user.id,
        )

    user_ids = list((await db.execute(scope_stmt.order_by(AppUser.email))).scalars())
    if requested_user_id is not None:
        if requested_user_id not in user_ids:
            raise Forbidden("You do not have access to reports for this user")
        return [requested_user_id]
    return user_ids


async def _validate_project(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    project_id: uuid.UUID | None,
) -> None:
    if project_id is None:
        return
    exists = await db.scalar(
        select(Project.id).where(
            Project.id == project_id,
            Project.org_id == org_id,
        )
    )
    if exists is None:
        raise ValidationError("project_id does not belong to this organization")


def _entry_conditions(
    *,
    user_ids: list[uuid.UUID],
    org_id: uuid.UUID,
    period_start: date,
    period_end: date,
    project_id: uuid.UUID | None,
    billable: bool | None,
) -> list:
    conditions = [
        TimeEntry.user_id.in_(user_ids),
        TimeEntry.work_date >= period_start,
        TimeEntry.work_date <= period_end,
        Project.org_id == org_id,
    ]
    if project_id is not None:
        conditions.append(TimeEntry.project_id == project_id)
    if billable is not None:
        conditions.append(TimeEntry.billable.is_(billable))
    return conditions


async def get_report_summary(
    db: AsyncSession,
    *,
    user_id: uuid.UUID | None = None,
    user_ids: list[uuid.UUID] | None = None,
    org_id: uuid.UUID,
    period_start: date,
    period_end: date,
    project_id: uuid.UUID | None = None,
    billable: bool | None = None,
) -> ReportSummaryOut:
    _validate_date_range(period_start, period_end)
    resolved_user_ids = user_ids or ([user_id] if user_id is not None else [])
    await _validate_project(db, org_id=org_id, project_id=project_id)

    totals = (
        await db.execute(
            select(
                func.coalesce(func.sum(TimeEntry.duration_minutes), 0).label("total"),
                func.coalesce(
                    func.sum(
                        case(
                            (TimeEntry.billable.is_(True), TimeEntry.duration_minutes),
                            else_=0,
                        )
                    ),
                    0,
                ).label("billable"),
                func.count(TimeEntry.id).label("count"),
            )
            .join(Project, Project.id == TimeEntry.project_id)
            .where(
                *_entry_conditions(
                    user_ids=resolved_user_ids,
                    org_id=org_id,
                    period_start=period_start,
                    period_end=period_end,
                    project_id=project_id,
                    billable=billable,
                )
            )
        )
    ).one()

    attendance_seconds = int(
        (
            await db.scalar(
                select(func.coalesce(func.sum(AttendanceDay.total_session_seconds), 0))
                .join(AppUser, AppUser.id == AttendanceDay.user_id)
                .where(
                    AttendanceDay.user_id.in_(resolved_user_ids),
                    AttendanceDay.work_date >= period_start,
                    AttendanceDay.work_date <= period_end,
                    AppUser.org_id == org_id,
                )
            )
        )
        or 0
    )
    policy = await db.scalar(select(OrgPolicy).where(OrgPolicy.org_id == org_id))
    workday_hours = policy.workday_hours if policy is not None else 8
    total_minutes = int(totals.total or 0)
    billable_minutes = int(totals.billable or 0)
    return ReportSummaryOut(
        period_start=period_start,
        period_end=period_end,
        total_minutes=total_minutes,
        billable_minutes=billable_minutes,
        non_billable_minutes=total_minutes - billable_minutes,
        attendance_seconds=attendance_seconds,
        expected_minutes=_count_workdays(period_start, period_end)
        * workday_hours
        * len(resolved_user_ids),
        entry_count=int(totals.count or 0),
        variance_minutes=total_minutes - attendance_seconds // 60,
    )


async def get_project_report(
    db: AsyncSession,
    *,
    user_id: uuid.UUID | None = None,
    user_ids: list[uuid.UUID] | None = None,
    org_id: uuid.UUID,
    period_start: date,
    period_end: date,
    project_id: uuid.UUID | None = None,
    billable: bool | None = None,
) -> ProjectReportOut:
    _validate_date_range(period_start, period_end)
    resolved_user_ids = user_ids or ([user_id] if user_id is not None else [])
    await _validate_project(db, org_id=org_id, project_id=project_id)
    rows = (
        await db.execute(
            select(
                Project.id.label("project_id"),
                Project.name.label("project_name"),
                Project.code.label("project_code"),
                func.sum(TimeEntry.duration_minutes).label("total_minutes"),
                func.sum(
                    case(
                        (TimeEntry.billable.is_(True), TimeEntry.duration_minutes),
                        else_=0,
                    )
                ).label("billable_minutes"),
                func.count(TimeEntry.id).label("entry_count"),
            )
            .join(Project, Project.id == TimeEntry.project_id)
            .where(
                *_entry_conditions(
                    user_ids=resolved_user_ids,
                    org_id=org_id,
                    period_start=period_start,
                    period_end=period_end,
                    project_id=project_id,
                    billable=billable,
                )
            )
            .group_by(Project.id, Project.name, Project.code)
            .order_by(func.sum(TimeEntry.duration_minutes).desc())
        )
    ).all()
    overall_total = sum(int(row.total_minutes or 0) for row in rows)
    projects = []
    for row in rows:
        total = int(row.total_minutes or 0)
        billable_total = int(row.billable_minutes or 0)
        projects.append(
            ProjectReportItemOut(
                project_id=row.project_id,
                project_name=row.project_name,
                project_code=row.project_code,
                total_minutes=total,
                billable_minutes=billable_total,
                non_billable_minutes=total - billable_total,
                entry_count=int(row.entry_count or 0),
                percentage=round(total / overall_total * 100, 2) if overall_total else 0,
            )
        )
    return ProjectReportOut(
        period_start=period_start,
        period_end=period_end,
        total_minutes=overall_total,
        projects=projects,
    )


async def get_member_report(
    db: AsyncSession,
    *,
    user_ids: list[uuid.UUID],
    org_id: uuid.UUID,
    period_start: date,
    period_end: date,
    project_id: uuid.UUID | None = None,
    billable: bool | None = None,
) -> list[MemberReportItemOut]:
    _validate_date_range(period_start, period_end)
    await _validate_project(db, org_id=org_id, project_id=project_id)
    entry_conditions = [
        TimeEntry.user_id == AppUser.id,
        TimeEntry.work_date >= period_start,
        TimeEntry.work_date <= period_end,
    ]
    if project_id is not None:
        entry_conditions.append(TimeEntry.project_id == project_id)
    if billable is not None:
        entry_conditions.append(TimeEntry.billable.is_(billable))
    rows = (
        await db.execute(
            select(
                AppUser.id.label("user_id"),
                AppUser.full_name,
                AppUser.email,
                func.coalesce(
                    func.sum(
                        case(
                            (Project.org_id == org_id, TimeEntry.duration_minutes),
                            else_=0,
                        )
                    ),
                    0,
                ).label("logged"),
                func.count(
                    case((Project.org_id == org_id, TimeEntry.id), else_=None)
                ).label("count"),
            )
            .select_from(AppUser)
            .outerjoin(TimeEntry, and_(*entry_conditions))
            .outerjoin(Project, Project.id == TimeEntry.project_id)
            .where(
                AppUser.id.in_(user_ids),
                AppUser.org_id == org_id,
            )
            .group_by(AppUser.id, AppUser.full_name, AppUser.email)
            .order_by(AppUser.full_name, AppUser.email)
        )
    ).all()
    return [
        MemberReportItemOut(
            user_id=row.user_id,
            full_name=row.full_name,
            email=row.email,
            logged_minutes=int(row.logged or 0),
            entry_count=int(row.count or 0),
        )
        for row in rows
    ]


async def get_daily_report(
    db: AsyncSession,
    *,
    user_ids: list[uuid.UUID],
    org_id: uuid.UUID,
    period_start: date,
    period_end: date,
    project_id: uuid.UUID | None = None,
    billable: bool | None = None,
) -> list[DailyReportItemOut]:
    _validate_date_range(period_start, period_end)
    await _validate_project(db, org_id=org_id, project_id=project_id)
    entry_rows = (
        await db.execute(
            select(TimeEntry.work_date, func.sum(TimeEntry.duration_minutes).label("logged"))
            .join(Project, Project.id == TimeEntry.project_id)
            .where(
                *_entry_conditions(
                    user_ids=user_ids,
                    org_id=org_id,
                    period_start=period_start,
                    period_end=period_end,
                    project_id=project_id,
                    billable=billable,
                )
            )
            .group_by(TimeEntry.work_date)
        )
    ).all()
    attendance_rows = (
        await db.execute(
            select(
                AttendanceDay.work_date,
                func.sum(AttendanceDay.total_session_seconds).label("seconds"),
            )
            .join(AppUser, AppUser.id == AttendanceDay.user_id)
            .where(
                AttendanceDay.user_id.in_(user_ids),
                AttendanceDay.work_date >= period_start,
                AttendanceDay.work_date <= period_end,
                AppUser.org_id == org_id,
            )
            .group_by(AttendanceDay.work_date)
        )
    ).all()
    entries = {row.work_date: int(row.logged or 0) for row in entry_rows}
    attendance = {row.work_date: int(row.seconds or 0) for row in attendance_rows}
    days = []
    current = period_start
    while current <= period_end:
        logged = entries.get(current, 0)
        seconds = attendance.get(current, 0)
        days.append(
            DailyReportItemOut(
                work_date=current,
                logged_minutes=logged,
                attendance_seconds=seconds,
                variance_minutes=logged - seconds // 60,
            )
        )
        current += timedelta(days=1)
    return days


async def get_attendance_comparison(
    db: AsyncSession,
    *,
    user_ids: list[uuid.UUID],
    org_id: uuid.UUID,
    period_start: date,
    period_end: date,
    project_id: uuid.UUID | None = None,
    billable: bool | None = None,
) -> list[AttendanceComparisonItemOut]:
    _validate_date_range(period_start, period_end)
    await _validate_project(db, org_id=org_id, project_id=project_id)
    users = list(
        (
            await db.execute(
                select(AppUser.id, AppUser.full_name, AppUser.email)
                .where(AppUser.id.in_(user_ids), AppUser.org_id == org_id)
                .order_by(AppUser.full_name, AppUser.email)
            )
        ).all()
    )
    entry_rows = (
        await db.execute(
            select(
                TimeEntry.user_id,
                func.sum(TimeEntry.duration_minutes).label("logged"),
                func.count(TimeEntry.id).label("count"),
            )
            .join(Project, Project.id == TimeEntry.project_id)
            .where(
                *_entry_conditions(
                    user_ids=user_ids,
                    org_id=org_id,
                    period_start=period_start,
                    period_end=period_end,
                    project_id=project_id,
                    billable=billable,
                )
            )
            .group_by(TimeEntry.user_id)
        )
    ).all()
    attendance_rows = (
        await db.execute(
            select(
                AttendanceDay.user_id,
                func.sum(AttendanceDay.total_session_seconds).label("seconds"),
            )
            .join(AppUser, AppUser.id == AttendanceDay.user_id)
            .where(
                AttendanceDay.user_id.in_(user_ids),
                AttendanceDay.work_date >= period_start,
                AttendanceDay.work_date <= period_end,
                AppUser.org_id == org_id,
            )
            .group_by(AttendanceDay.user_id)
        )
    ).all()
    entry_totals = {row.user_id: (int(row.logged or 0), int(row.count or 0)) for row in entry_rows}
    attendance_totals = {row.user_id: int(row.seconds or 0) for row in attendance_rows}
    result = []
    for user_id, full_name, email in users:
        logged, count = entry_totals.get(user_id, (0, 0))
        seconds = attendance_totals.get(user_id, 0)
        result.append(
            AttendanceComparisonItemOut(
                user_id=user_id,
                full_name=full_name,
                email=email,
                logged_minutes=logged,
                attendance_seconds=seconds,
                variance_minutes=logged - seconds // 60,
                entry_count=count,
            )
        )
    return result
