from __future__ import annotations

from datetime import date, datetime, time, timezone,timedelta
from zoneinfo import ZoneInfo


def ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        raise ValueError("Naive datetimes are not allowed for business timestamps")
    return dt.astimezone(timezone.utc)


def to_user_local(dt: datetime, tz_name: str) -> datetime:
    return ensure_utc(dt).astimezone(ZoneInfo(tz_name))


def work_date_for(
    occurred_at: datetime,
    tz_name: str,
    workday_cutoff: time | None = None,
) -> date:
    """Return the user-local work_date for a UTC instant, honoring an optional cutoff.

    Night-shift convention: any instant strictly *before* the cutoff belongs to the
    previous calendar day. Example: cutoff=06:00, login at 03:00 → yesterday.
    """
    local = to_user_local(occurred_at, tz_name)
    if workday_cutoff is not None and local.timetz().replace(tzinfo=None) < workday_cutoff:
        return local.date() - timedelta(days=1)
    return local.date()