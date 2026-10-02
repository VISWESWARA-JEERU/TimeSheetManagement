from __future__ import annotations

import asyncio
import secrets
from contextlib import suppress

from app.core.exceptions import RateLimited
from redis.exceptions import RedisError
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.core.redis import get_redis
from app.integrations.github import sync_service
from app.models.enums import SyncTrigger
from app.models.github_project_link import GitHubProjectLink
from app.models.project import Project

log = get_logger("app.worker.github_sync")

_LOCK_KEY = "github:scheduled-sync:lock"
_COOLDOWN_KEY = "github:scheduled-sync:cooldown"
_LOCK_TTL_SECONDS = 180
_LOCK_RENEW_SECONDS = 60
_COMPARE_AND_RENEW_SCRIPT = """
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("EXPIRE", KEYS[1], ARGV[2])
end
return 0
"""
_COMPARE_AND_RELEASE_SCRIPT = """
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
"""


async def _tick() -> None:
    if not settings.GITHUB_SCHEDULED_SYNC_ENABLED:
        return

    redis = get_redis()
    lock_value = secrets.token_urlsafe(24)
    acquired = False
    try:
        acquired = bool(await redis.set(
            _LOCK_KEY,
            lock_value,
            nx=True,
            ex=_LOCK_TTL_SECONDS,
        ))
        if not acquired:
            log.info("github_scheduled_sync_tick_skipped_locked")
            return
        cooldown = await redis.set(
            _COOLDOWN_KEY,
            lock_value,
            nx=True,
            ex=settings.GITHUB_SYNC_INTERVAL_SECONDS,
        )
        if not cooldown:
            log.info("github_scheduled_sync_tick_skipped_cooldown")
            await _release_lock(redis, lock_value)
            return
    except RedisError:
        log.error("github_scheduled_sync_lock_unavailable")
        if acquired:
            await _release_lock(redis, lock_value)
        return

    lost_lock = asyncio.Event()
    stop_renewal = asyncio.Event()
    renewal_task = asyncio.create_task(
        _renew_lock(redis, lock_value, stop_renewal, lost_lock)
    )
    try:
        async with AsyncSessionLocal() as db:
            projects = list(
                (
                    await db.execute(
                        select(GitHubProjectLink.project_id, Project.org_id)
                        .join(Project, Project.id == GitHubProjectLink.project_id)
                        .order_by(GitHubProjectLink.project_id)
                    )
                ).all()
            )

        for project_id, org_id in projects:
            if lost_lock.is_set():
                log.warning("github_scheduled_sync_lock_lost")
                break
            try:
                async with AsyncSessionLocal() as db:
                    await sync_service.pull_project(
                        db,
                        project_id,
                        org_id,
                        trigger=SyncTrigger.schedule,
                    )
            except RateLimited:
                log.warning(
                    "github_scheduled_sync_rate_limited",
                    project_id=str(project_id),
                )
                break
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log.error(
                    "github_scheduled_sync_project_failed",
                    project_id=str(project_id),
                    error_type=type(exc).__name__,
                )
    finally:
        stop_renewal.set()
        renewal_task.cancel()
        with suppress(asyncio.CancelledError):
            await renewal_task
        await _release_lock(redis, lock_value)


async def _release_lock(redis, lock_value: str) -> None:
    try:
        await redis.eval(
            _COMPARE_AND_RELEASE_SCRIPT,
            1,
            _LOCK_KEY,
            lock_value,
        )
    except RedisError:
        log.warning("github_scheduled_sync_lock_release_failed")


async def _renew_lock(
    redis,
    lock_value: str,
    stop: asyncio.Event,
    lost_lock: asyncio.Event,
) -> None:
    while not stop.is_set():
        try:
            await asyncio.wait_for(stop.wait(), timeout=_LOCK_RENEW_SECONDS)
            return
        except TimeoutError:
            pass
        try:
            renewed = await redis.eval(
                _COMPARE_AND_RENEW_SCRIPT,
                1,
                _LOCK_KEY,
                lock_value,
                _LOCK_TTL_SECONDS,
            )
        except RedisError:
            log.warning("github_scheduled_sync_lock_renewal_failed")
            lost_lock.set()
            return
        if not renewed:
            lost_lock.set()
            return


async def run_forever() -> None:
    interval = settings.GITHUB_SYNC_INTERVAL_SECONDS
    log.info(
        "github_scheduled_sync_worker_started",
        interval_seconds=interval,
    )
    while True:
        await asyncio.sleep(interval)
        try:
            await _tick()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.error(
                "github_scheduled_sync_tick_failed",
                error_type=type(exc).__name__,
            )
