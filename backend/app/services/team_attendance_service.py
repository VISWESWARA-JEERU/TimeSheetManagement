from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFound
from app.models.attendance_day import AttendanceDay
from app.models.enums import GeoEventType, GeoPermission
from app.models.geo_event import GeoEvent
from app.models.organization import OrgPolicy, Organization
from app.models.team import Team, TeamMember
from app.models.time_entry import TimeEntry
from app.models.user import AppUser
from app.models.work_session import WorkSession
from app.schemas.attendance import (
    AttendanceDayOut,
    GeoEventOut,
    TeamAttendanceRow,
)
from app.services.attendance_service import work_date_window_utc


async def get_team_attendance(
    db: AsyncSession,
    *,
    team_id: uuid.UUID,
    org_id: uuid.UUID,
    work_date: date,
) -> list[TeamAttendanceRow]:
    team = (
        await db.execute(
            select(Team).where(Team.id == team_id, Team.org_id == org_id)
        )
    ).scalar_one_or_none()
    if team is None:
        raise NotFound("Team not found")

    members = (
        await db.execute(
            select(TeamMember, AppUser)
            .join(AppUser, AppUser.id == TeamMember.user_id)
            .where(
                TeamMember.team_id == team_id,
                AppUser.org_id == org_id,
            )
            .order_by(AppUser.full_name.asc(), AppUser.email.asc())
        )
    ).all()
    if not members:
        return []

    users = [user for _, user in members]
    user_ids = [user.id for user in users]
    organization = (
        await db.execute(select(Organization).where(Organization.id == org_id))
    ).scalar_one_or_none()
    if organization is None:
        raise NotFound("Organization not found")

    windows = {
        user.id: work_date_window_utc(
            work_date,
            user.timezone or organization.default_timezone,
            organization.workday_cutoff,
        )
        for user in users
    }
    earliest_start = min(start for start, _ in windows.values())
    latest_end = max(end for _, end in windows.values())

    attendance_days = {
        row.user_id: row
        for row in (
            await db.execute(
                select(AttendanceDay).where(
                    AttendanceDay.user_id.in_(user_ids),
                    AttendanceDay.work_date == work_date,
                )
            )
        ).scalars()
    }

    active_sessions: dict[uuid.UUID, WorkSession] = {}
    for session in (
        await db.execute(
            select(WorkSession).where(
                WorkSession.user_id.in_(user_ids),
                WorkSession.logout_at.is_(None),
                WorkSession.login_at >= earliest_start,
                WorkSession.login_at < latest_end,
            )
        )
    ).scalars():
        start, end = windows[session.user_id]
        if start <= session.login_at < end:
            active_sessions[session.user_id] = session

    event_ids = {
        event_id
        for day in attendance_days.values()
        for event_id in (day.first_login_event_id, day.last_logout_event_id)
        if event_id is not None
    }
    relevant_event_window = and_(
        GeoEvent.occurred_at >= earliest_start,
        GeoEvent.occurred_at < latest_end,
    )
    event_window_or_references = (
        or_(relevant_event_window, GeoEvent.id.in_(event_ids))
        if event_ids
        else relevant_event_window
    )
    relevant_events = list(
        (
            await db.execute(
                select(GeoEvent)
                .where(
                    GeoEvent.user_id.in_(user_ids),
                    GeoEvent.event_type.in_(
                        [GeoEventType.login, GeoEventType.logout]
                    ),
                    event_window_or_references,
                )
                .order_by(GeoEvent.occurred_at.asc(), GeoEvent.id.asc())
            )
        ).scalars()
    )
    events_by_id = {event.id: event for event in relevant_events}
    events_by_user: dict[uuid.UUID, list[GeoEvent]] = {user_id: [] for user_id in user_ids}
    for event in relevant_events:
        start, end = windows[event.user_id]
        if start <= event.occurred_at < end:
            events_by_user[event.user_id].append(event)

    entry_counts = dict(
        (
            await db.execute(
                select(TimeEntry.user_id, func.count(TimeEntry.id))
                .where(
                    TimeEntry.user_id.in_(user_ids),
                    TimeEntry.work_date == work_date,
                )
                .group_by(TimeEntry.user_id)
            )
        ).all()
    )
    policy_threshold = (
        await db.execute(
            select(OrgPolicy.variance_threshold_minutes).where(
                OrgPolicy.org_id == org_id
            )
        )
    ).scalar_one_or_none()
    # This matches the existing approval policy default when no policy row exists.
    variance_threshold_minutes = (
        policy_threshold if policy_threshold is not None else 60
    )

    rows: list[TeamAttendanceRow] = []
    for _, user in members:
        day = attendance_days.get(user.id)
        active_session = user.id in active_sessions
        first_login = (
            events_by_id.get(day.first_login_event_id)
            if day is not None and day.first_login_event_id is not None
            else None
        )
        if (
            first_login is not None
            and (
                first_login.user_id != user.id
                or first_login.event_type != GeoEventType.login
            )
        ):
            first_login = None
        last_logout = (
            events_by_id.get(day.last_logout_event_id)
            if day is not None and day.last_logout_event_id is not None
            else None
        )
        if (
            last_logout is not None
            and (
                last_logout.user_id != user.id
                or last_logout.event_type != GeoEventType.logout
            )
        ):
            last_logout = None

        flags: list[str] = []
        for event in events_by_user[user.id]:
            if (
                event.geo_permission == GeoPermission.denied
                and "LOCATION_DENIED" not in flags
            ):
                flags.append("LOCATION_DENIED")
            if (
                event.geo_permission == GeoPermission.unavailable
                and "LOCATION_UNAVAILABLE" not in flags
            ):
                flags.append("LOCATION_UNAVAILABLE")
            if event.inside_site is False and "OUTSIDE_SITE" not in flags:
                flags.append("OUTSIDE_SITE")

        if (
            day is not None
            and day.first_login_at is not None
            and day.last_logout_at is None
            and not active_session
        ):
            flags.append("MISSING_LOGOUT")

        if day is not None and abs(
            day.total_session_seconds // 60 - day.logged_seconds // 60
        ) > variance_threshold_minutes:
            flags.append("RECORDING_VARIANCE")

        rows.append(
            TeamAttendanceRow(
                user_id=user.id,
                email=user.email,
                full_name=user.full_name,
                attendance_day=(
                    AttendanceDayOut.model_validate(day) if day is not None else None
                ),
                active_session=active_session,
                first_login_event=(
                    GeoEventOut.model_validate(first_login)
                    if first_login is not None
                    else None
                ),
                last_logout_event=(
                    GeoEventOut.model_validate(last_logout)
                    if last_logout is not None
                    else None
                ),
                entry_count=int(entry_counts.get(user.id, 0)),
                flags=flags,
            )
        )
    return rows


async def get_member_attendance_events(
    db: AsyncSession,
    *,
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    work_date: date,
) -> list[GeoEventOut]:
    team_and_member = (
        await db.execute(
            select(Team, AppUser)
            .join(TeamMember, TeamMember.team_id == Team.id)
            .join(AppUser, AppUser.id == TeamMember.user_id)
            .where(
                Team.id == team_id,
                Team.org_id == org_id,
                TeamMember.user_id == user_id,
                AppUser.org_id == org_id,
            )
        )
    ).one_or_none()
    if team_and_member is None:
        raise NotFound("Team member not found")
    team, user = team_and_member

    organization = (
        await db.execute(select(Organization).where(Organization.id == team.org_id))
    ).scalar_one_or_none()
    if organization is None:
        raise NotFound("Organization not found")

    start_utc, end_utc = work_date_window_utc(
        work_date,
        user.timezone or organization.default_timezone,
        organization.workday_cutoff,
    )
    events = (
        await db.execute(
            select(GeoEvent)
            .where(
                GeoEvent.user_id == user.id,
                GeoEvent.event_type.in_([GeoEventType.login, GeoEventType.logout]),
                GeoEvent.occurred_at >= start_utc,
                GeoEvent.occurred_at < end_utc,
            )
            .order_by(GeoEvent.occurred_at.asc(), GeoEvent.id.asc())
        )
    ).scalars()
    return [GeoEventOut.model_validate(event) for event in events]
