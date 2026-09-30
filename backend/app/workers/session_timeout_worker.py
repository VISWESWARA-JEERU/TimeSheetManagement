from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.models.user_session import UserSession
from app.models.work_session import WorkSession
from app.services import attendance_service

log = get_logger("app.worker.session_timeout")

_TICK_SECONDS = 60
_BATCH = 50


async def _tick() -> None:
    async with AsyncSessionLocal() as db:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(minutes=settings.AUTO_LOGOUT_MINUTES)

        stale_sessions = list(
            (
                await db.execute(
                    select(WorkSession.id, WorkSession.user_id, WorkSession.login_at)
                    .where(WorkSession.logout_at.is_(None), WorkSession.login_at < cutoff)
                    .order_by(WorkSession.user_id, WorkSession.id)
                    .limit(_BATCH)
                )
            ).all()
        )
        if not stale_sessions:
            return

        for work_session_id, user_id, login_at in stale_sessions:
            last_seen = (
                await db.execute(
                    select(UserSession.last_seen_at)
                    .where(UserSession.user_id == user_id)
                    .order_by(UserSession.last_seen_at.desc().nullslast())
                    .limit(1)
                )
            ).scalar_one_or_none()

            activity = last_seen or login_at
            if activity > cutoff:
                continue  # user is still active; leave the session open

            closed = await attendance_service.close_work_session_for_timeout(
                db,
                work_session_id=work_session_id,
                logout_at=activity,
            )
            if not closed:
                continue

            log.info(
                "session_timed_out",
                work_session_id=str(work_session_id),
                user_id=str(user_id),
                closed_at=activity.isoformat(),
            )

        await db.commit()


async def run_forever() -> None:
    log.info("session_timeout_worker_started", tick_seconds=_TICK_SECONDS)
    while True:
        try:
            await _tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("session_timeout_worker_tick_failed")
        await asyncio.sleep(_TICK_SECONDS)