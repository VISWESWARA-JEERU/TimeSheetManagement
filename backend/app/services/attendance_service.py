from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import Conflict, NotFound
from app.core.logging import get_logger
from app.models.attendance_day import AttendanceDay
from app.models.enums import AttendanceStatus, GeoEventType, GeoPermission, LogoutReason
from app.models.geo_event import GeoEvent
from app.models.organization import Organization, OrgPolicy
from app.models.time_entry import TimeEntry
from app.models.user import AppUser
from app.models.work_session import WorkSession
from app.services import audit_service, location_service, session_service
from app.utils.timezone import ensure_utc, work_date_for

log = get_logger("app.attendance_service")


# --------------------------------------------------------------------------- #
# Time-window helpers
# --------------------------------------------------------------------------- #

def _user_tz(user: AppUser, org: Organization) -> str:
    return user.timezone or org.default_timezone


def work_date_window_utc(
    work_date: date, tz_name: str, workday_cutoff: time | None
) -> tuple[datetime, datetime]:
    """Return the [start_utc, end_utc) window that maps to `work_date` in the user's tz.

    With cutoff=06:00, work_date=2025-01-15 covers:
      2025-01-15 06:00 local → 2025-01-16 06:00 local (converted to UTC).
    DST transitions are handled by zoneinfo.
    """
    tz = ZoneInfo(tz_name)
    start_local = datetime.combine(
        work_date, workday_cutoff if workday_cutoff is not None else time(0, 0), tzinfo=tz
    )
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


# --------------------------------------------------------------------------- #
# Locking — serializes attendance mutations per user
# --------------------------------------------------------------------------- #

async def _acquire_user_lock(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Transaction-scoped PostgreSQL advisory lock keyed by user id.

    Prevents concurrent check-in/check-out/recompute from racing on the same
    attendance_day row. Released automatically at COMMIT/ROLLBACK.
    """
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:k)::bigint)"),
        {"k": f"attendance:{user_id}"},
    )


# --------------------------------------------------------------------------- #
# Loaders
# --------------------------------------------------------------------------- #

async def _load_user(db: AsyncSession, user_id: uuid.UUID) -> AppUser:
    user = (
        await db.execute(select(AppUser).where(AppUser.id == user_id))
    ).scalar_one_or_none()
    if user is None:
        raise NotFound("User not found")
    return user


async def _load_org(db: AsyncSession, org_id: uuid.UUID) -> Organization:
    org = (
        await db.execute(select(Organization).where(Organization.id == org_id))
    ).scalar_one_or_none()
    if org is None:
        raise NotFound("Organization not found")
    return org


async def _load_policy(db: AsyncSession, org_id: uuid.UUID) -> OrgPolicy | None:
    return (
        await db.execute(select(OrgPolicy).where(OrgPolicy.org_id == org_id))
    ).scalar_one_or_none()


async def _get_attendance_day(
    db: AsyncSession,
    user_id: uuid.UUID,
    work_date: date,
    *,
    for_update: bool = False,
) -> AttendanceDay | None:
    stmt = select(AttendanceDay).where(
        AttendanceDay.user_id == user_id, AttendanceDay.work_date == work_date
    )
    if for_update:
        stmt = stmt.with_for_update()
    return (await db.execute(stmt)).scalar_one_or_none()


# --------------------------------------------------------------------------- #
# Location payload
# --------------------------------------------------------------------------- #

@dataclass
class LocationPayload:
    latitude: float | None
    longitude: float | None
    accuracy_m: float | None
    geo_permission: GeoPermission
    client_reported_at: datetime | None
    device_id: str | None = None


def _location_usable(payload: LocationPayload) -> bool:
    return (
        payload.geo_permission == GeoPermission.granted
        and payload.latitude is not None
        and payload.longitude is not None
    )


async def _create_geo_event(
    db: AsyncSession,
    *,
    user: AppUser,
    event_type: GeoEventType,
    payload: LocationPayload,
    ip: str | None,
    user_agent: str | None,
    occurred_at: datetime,
) -> GeoEvent:
    location_service.validate_coordinates(
        payload.latitude, payload.longitude, payload.accuracy_m
    )
    site, inside = await location_service.match_work_site(
        db,
        org_id=user.org_id,
        latitude=payload.latitude,
        longitude=payload.longitude,
    )
    place_label = await location_service.resolve_place_label(
        payload.latitude, payload.longitude
    )

    event = GeoEvent(
        user_id=user.id,
        event_type=event_type,
        occurred_at=occurred_at,
        client_reported_at=payload.client_reported_at,
        latitude=payload.latitude,
        longitude=payload.longitude,
        accuracy_m=payload.accuracy_m,
        geo_permission=payload.geo_permission,
        place_label=place_label,
        site_id=site.id if site is not None else None,
        inside_site=inside,
        ip_address=ip,
        user_agent=(user_agent or "")[:500] or None,
        device_id=payload.device_id,
    )
    db.add(event)
    await db.flush()
    return event


async def _create_attendance_day(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    work_date: date,
    first_login_at: datetime,
    first_login_event_id: uuid.UUID | None,
) -> AttendanceDay:
    row = AttendanceDay(
        user_id=user_id,
        work_date=work_date,
        first_login_at=first_login_at,
        first_login_event_id=first_login_event_id,
        total_session_seconds=0,
        logged_seconds=0,
        status=AttendanceStatus.open,
    )
    db.add(row)
    await db.flush()
    return row


# --------------------------------------------------------------------------- #
# Check-in
# --------------------------------------------------------------------------- #

@dataclass
class CheckInResult:
    attendance_day: AttendanceDay
    work_session: WorkSession
    login_event: GeoEvent
    is_duplicate: bool


async def check_in(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    payload: LocationPayload,
    ip: str | None,
    user_agent: str | None,
) -> CheckInResult:
    now = datetime.now(timezone.utc)
    user = await _load_user(db, user_id)
    org = await _load_org(db, user.org_id)

    # Location policy check happens BEFORE we mutate state.
    if not _location_usable(payload):
        policy = await _load_policy(db, user.org_id)
        allow_missing = policy.allow_login_without_location if policy else True
        if not allow_missing:
            raise Conflict(
                "Location is required by organization policy. Enable location and retry.",
                details={"code": "LOCATION_REQUIRED"},
            )

    await _acquire_user_lock(db, user.id)

    tz_name = _user_tz(user, org)
    work_date = work_date_for(now, tz_name, org.workday_cutoff)

    existing = await session_service.get_active_session(db, user.id, for_update=True)

    if existing is not None:
        existing_work_date = work_date_for(
            existing.login_at, tz_name, org.workday_cutoff
        )
        if existing_work_date == work_date:
            # Idempotent: the caller is already checked in for this work_date.
            attendance = await _get_attendance_day(db, user.id, work_date, for_update=True)
            if attendance is None:
                attendance = await _create_attendance_day(
                    db,
                    user_id=user.id,
                    work_date=work_date,
                    first_login_at=existing.login_at,
                    first_login_event_id=existing.login_event_id,
                )
            login_event = (
                await db.execute(
                    select(GeoEvent).where(GeoEvent.id == existing.login_event_id)
                )
            ).scalar_one_or_none()
            if login_event is None:
                # Self-heal: recreate the missing event row using the original payload.
                login_event = await _create_geo_event(
                    db,
                    user=user,
                    event_type=GeoEventType.login,
                    payload=payload,
                    ip=ip,
                    user_agent=user_agent,
                    occurred_at=existing.login_at,
                )
                existing.login_event_id = login_event.id
                await db.flush()
            return CheckInResult(
                attendance_day=attendance,
                work_session=existing,
                login_event=login_event,
                is_duplicate=True,
            )

        # Stale session from a previous work_date: close it as `forced`.
        # Use the last user activity (user_session.last_seen_at) when available;
        # otherwise cap at login + AUTO_LOGOUT_MINUTES.
        last_seen = await session_service.last_seen_at_for_user(db, user.id)
        cap = existing.login_at + timedelta(minutes=settings.AUTO_LOGOUT_MINUTES)
        close_at = min(last_seen or cap, now)
        if close_at < existing.login_at:
            close_at = existing.login_at
        await _close_work_session(
            db,
            user=user,
            org=org,
            work_session=existing,
            logout_at=close_at,
            reason=LogoutReason.forced,
            payload=LocationPayload(
                latitude=None,
                longitude=None,
                accuracy_m=None,
                geo_permission=GeoPermission.unavailable,
                client_reported_at=None,
                device_id=None,
            ),
            ip=ip,
            user_agent=user_agent,
            audit_action="attendance.forced_logout",
        )

    # Fresh login for this work_date.
    login_event = await _create_geo_event(
        db,
        user=user,
        event_type=GeoEventType.login,
        payload=payload,
        ip=ip,
        user_agent=user_agent,
        occurred_at=now,
    )
    session = WorkSession(
        user_id=user.id,
        login_at=now,
        login_event_id=login_event.id,
    )
    db.add(session)
    await db.flush()

    attendance = await _get_attendance_day(db, user.id, work_date, for_update=True)
    if attendance is None:
        attendance = await _create_attendance_day(
            db,
            user_id=user.id,
            work_date=work_date,
            first_login_at=now,
            first_login_event_id=login_event.id,
        )
    else:
        if attendance.status == AttendanceStatus.approved:
            raise Conflict("This workday is already approved and cannot be reopened")
        # RULE: first_login_at is set-once. Never overwritten by later logins.
        if attendance.first_login_at is None:
            attendance.first_login_at = now
            attendance.first_login_event_id = login_event.id
        # A closed day reopens when work resumes; a submitted day stays submitted
        # until the approval workflow says otherwise.
        if attendance.status == AttendanceStatus.closed:
            attendance.status = AttendanceStatus.open
        await db.flush()

    await _recompute_totals(db, user=user, org=org, attendance=attendance)

    await audit_service.record(
        db,
        actor_user_id=user.id,
        action="attendance.check_in",
        entity="work_session",
        entity_id=session.id,
        after={
            "occurred_at": now.isoformat(),
            "work_date": work_date.isoformat(),
            "geo_permission": payload.geo_permission.value,
            "inside_site": login_event.inside_site,
        },
        ip=ip,
    )

    return CheckInResult(
        attendance_day=attendance,
        work_session=session,
        login_event=login_event,
        is_duplicate=False,
    )


# --------------------------------------------------------------------------- #
# Check-out
# --------------------------------------------------------------------------- #

@dataclass
class CheckOutResult:
    attendance_day: AttendanceDay | None
    work_session: WorkSession | None
    logout_event: GeoEvent | None
    is_duplicate: bool


async def check_out(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    payload: LocationPayload,
    ip: str | None,
    user_agent: str | None,
) -> CheckOutResult:
    now = datetime.now(timezone.utc)
    user = await _load_user(db, user_id)
    org = await _load_org(db, user.org_id)

    await _acquire_user_lock(db, user.id)

    active = await session_service.get_active_session(db, user.id, for_update=True)

    if active is None:
        # Idempotent no-op: two simultaneous check-outs cannot double-count.
        tz_name = _user_tz(user, org)
        work_date = work_date_for(now, tz_name, org.workday_cutoff)
        attendance = await _get_attendance_day(db, user.id, work_date)
        return CheckOutResult(
            attendance_day=attendance,
            work_session=None,
            logout_event=None,
            is_duplicate=True,
        )

    return await _close_work_session(
        db,
        user=user,
        org=org,
        work_session=active,
        logout_at=now,
        reason=LogoutReason.user,
        payload=payload,
        ip=ip,
        user_agent=user_agent,
        audit_action="attendance.check_out",
    )


async def close_work_session_for_timeout(
    db: AsyncSession,
    *,
    work_session_id: uuid.UUID,
    logout_at: datetime,
    ip: str | None = None,
    user_agent: str | None = None,
) -> bool:
    """Close a stale work session and update its attendance day exactly once."""
    session = (
        await db.execute(
            select(WorkSession).where(WorkSession.id == work_session_id)
        )
    ).scalar_one_or_none()
    if session is None or session.logout_at is not None:
        return False

    user = await _load_user(db, session.user_id)
    org = await _load_org(db, user.org_id)
    await _acquire_user_lock(db, user.id)

    session = (
        await db.execute(
            select(WorkSession)
            .where(WorkSession.id == work_session_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if session is None or session.logout_at is not None:
        return False

    await _close_work_session(
        db,
        user=user,
        org=org,
        work_session=session,
        logout_at=logout_at,
        reason=LogoutReason.timeout,
        payload=LocationPayload(
            latitude=None,
            longitude=None,
            accuracy_m=None,
            geo_permission=GeoPermission.unavailable,
            client_reported_at=None,
            device_id=None,
        ),
        ip=ip,
        user_agent=user_agent,
        audit_action="attendance.timeout",
    )
    return True


async def _close_work_session(
    db: AsyncSession,
    *,
    user: AppUser,
    org: Organization,
    work_session: WorkSession,
    logout_at: datetime,
    reason: LogoutReason,
    payload: LocationPayload,
    ip: str | None,
    user_agent: str | None,
    audit_action: str,
) -> CheckOutResult:
    occurred_at = max(
        ensure_utc(work_session.login_at),
        ensure_utc(logout_at),
    )
    logout_event = await _create_geo_event(
        db,
        user=user,
        event_type=GeoEventType.logout,
        payload=payload,
        ip=ip,
        user_agent=user_agent,
        occurred_at=occurred_at,
    )

    await session_service.close_session(
        db,
        work_session,
        logout_at=occurred_at,
        reason=reason,
        logout_event_id=logout_event.id,
    )

    tz_name = _user_tz(user, org)
    work_date = work_date_for(work_session.login_at, tz_name, org.workday_cutoff)
    attendance = await _get_attendance_day(db, user.id, work_date, for_update=True)
    if attendance is None:
        attendance = await _create_attendance_day(
            db,
            user_id=user.id,
            work_date=work_date,
            first_login_at=work_session.login_at,
            first_login_event_id=work_session.login_event_id,
        )

    if attendance.last_logout_at is None or attendance.last_logout_at < occurred_at:
        attendance.last_logout_at = occurred_at
        attendance.last_logout_event_id = logout_event.id

    await _recompute_totals(db, user=user, org=org, attendance=attendance)

    if (
        reason in (LogoutReason.timeout, LogoutReason.forced)
        and attendance.status == AttendanceStatus.open
    ):
        attendance.status = AttendanceStatus.closed

    await audit_service.record(
        db,
        actor_user_id=user.id,
        action=audit_action,
        entity="work_session",
        entity_id=work_session.id,
        after={
            "occurred_at": occurred_at.isoformat(),
            "work_date": work_date.isoformat(),
            "session_seconds": work_session.session_seconds,
            "reason": reason.value,
            "geo_permission": payload.geo_permission.value,
        },
        ip=ip,
    )

    return CheckOutResult(
        attendance_day=attendance,
        work_session=work_session,
        logout_event=logout_event,
        is_duplicate=False,
    )


# --------------------------------------------------------------------------- #
# Recompute — derived totals, never trusted to run incrementally forever
# --------------------------------------------------------------------------- #

async def _recompute_totals(
    db: AsyncSession,
    *,
    user: AppUser,
    org: Organization,
    attendance: AttendanceDay,
) -> None:
    tz_name = _user_tz(user, org)
    start_utc, end_utc = work_date_window_utc(
        attendance.work_date, tz_name, org.workday_cutoff
    )

    total_session_seconds = (
        await db.execute(
            select(
                func.coalesce(func.sum(WorkSession.session_seconds), 0)
            ).where(
                WorkSession.user_id == user.id,
                WorkSession.login_at >= start_utc,
                WorkSession.login_at < end_utc,
                WorkSession.logout_at.is_not(None),
            )
        )
    ).scalar_one() or 0

    logged_seconds = (
        await db.execute(
            select(func.coalesce(func.sum(TimeEntry.duration_minutes), 0) * 60).where(
                TimeEntry.user_id == user.id,
                TimeEntry.work_date == attendance.work_date,
            )
        )
    ).scalar_one() or 0

    attendance.total_session_seconds = int(total_session_seconds)
    attendance.logged_seconds = int(logged_seconds)
    await db.flush()


async def recompute_day(
    db: AsyncSession, user_id: uuid.UUID, work_date: date
) -> AttendanceDay | None:
    """Rebuild derived values for one day from source data."""
    user = await _load_user(db, user_id)
    org = await _load_org(db, user.org_id)
    await _acquire_user_lock(db, user.id)
    attendance = await _get_attendance_day(db, user.id, work_date, for_update=True)
    if attendance is None:
        return None
    await _recompute_totals(db, user=user, org=org, attendance=attendance)
    return attendance


async def recompute_range(
    db: AsyncSession, user_id: uuid.UUID, start_date: date, end_date: date
) -> int:
    """Used by nightly reconciliation and admin actions."""
    count = 0
    d = start_date
    while d <= end_date:
        if await recompute_day(db, user_id, d) is not None:
            count += 1
        d = d + timedelta(days=1)
    return count