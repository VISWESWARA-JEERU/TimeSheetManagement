from __future__ import annotations

import json
import secrets
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status
from redis.exceptions import RedisError

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.exceptions import RateLimited
from app.core.logging import get_logger
from app.core.redis import get_redis
from app.integrations.github import sync_service
from app.integrations.github.webhook import project_node_id, verify_signature
from app.models.enums import SyncTrigger

router = APIRouter(
    prefix="/github-sync",
    tags=["github-webhook"],
)
log = get_logger("app.github_webhook")

_DELIVERY_PREFIX = "github:webhook:delivery:"
_DELIVERY_TTL_SECONDS = 24 * 60 * 60
_RELEASE_DELIVERY_SCRIPT = """
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
"""


@router.post(
    "/webhook",
    status_code=status.HTTP_202_ACCEPTED,
)
async def receive_github_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
) -> dict[str, bool]:
    if not settings.GITHUB_WEBHOOK_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="GitHub webhooks are disabled",
        )
    body = await request.body()
    if not verify_signature(
        body,
        request.headers.get("x-hub-signature-256"),
        settings.GITHUB_WEBHOOK_SECRET or "",
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid GitHub webhook signature",
        )

    event = request.headers.get("x-github-event")
    delivery_id = request.headers.get("x-github-delivery")
    if not event or not delivery_id or len(delivery_id) > 200:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub event and delivery headers are required",
        )

    key = f"{_DELIVERY_PREFIX}{delivery_id}"
    claim = secrets.token_urlsafe(24)
    redis = get_redis()
    try:
        claimed = await redis.set(
            key,
            claim,
            nx=True,
            ex=_DELIVERY_TTL_SECONDS,
        )
    except RedisError as exc:
        log.error("github_webhook_deduplication_unavailable")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub webhook deduplication is temporarily unavailable",
        ) from exc
    if not claimed:
        return {"accepted": True, "duplicate": True}

    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        await _release_delivery(redis, key, claim)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub webhook body must be valid JSON",
        ) from None
    if not isinstance(payload, dict):
        await _release_delivery(redis, key, claim)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub webhook body must be a JSON object",
        )

    action = payload.get("action")
    if event == "ping":
        log.info(
            "github_webhook_ping_accepted",
            delivery_id=delivery_id,
        )
        return {"accepted": True, "duplicate": False}
    if event not in {"projects_v2", "projects_v2_item"}:
        log.info(
            "github_webhook_event_ignored",
            delivery_id=delivery_id,
            webhook_event=event,
        )
        return {"accepted": True, "ignored": True}

    gh_project_node_id = project_node_id(event, payload)
    if gh_project_node_id is None:
        log.info(
            "github_webhook_project_unresolved",
            delivery_id=delivery_id,
            webhook_event=event,
            action=action if isinstance(action, str) else None,
        )
        return {"accepted": True, "ignored": True}

    log.info(
        "github_webhook_accepted",
        delivery_id=delivery_id,
        webhook_event=event,
        action=action if isinstance(action, str) else None,
        gh_project_node_id=gh_project_node_id,
    )
    background_tasks.add_task(
        _process_delivery,
        delivery_id,
        key,
        claim,
        event,
        action if isinstance(action, str) else None,
        gh_project_node_id,
    )
    return {"accepted": True, "duplicate": False}


async def _process_delivery(
    delivery_id: str,
    redis_key: str,
    claim: str,
    event: str,
    action: str | None,
    gh_project_node_id: str,
) -> None:
    try:
        async with AsyncSessionLocal() as db:
            linked_project = await sync_service.get_project_link_by_gh_node_id(
                db,
                gh_project_node_id,
            )
            if linked_project is None:
                log.info(
                    "github_webhook_unlinked_project_ignored",
                    delivery_id=delivery_id,
                    webhook_event=event,
                    action=action,
                    gh_project_node_id=gh_project_node_id,
                )
                return
            project_id, org_id = linked_project
            await sync_service.pull_project(
                db,
                project_id,
                org_id,
                trigger=SyncTrigger.webhook,
            )
            log.info(
                "github_webhook_project_synced",
                delivery_id=delivery_id,
                webhook_event=event,
                action=action,
                project_id=str(project_id),
            )
    except RateLimited:
        log.warning(
            "github_webhook_sync_rate_limited",
            delivery_id=delivery_id,
            webhook_event=event,
            gh_project_node_id=gh_project_node_id,
        )
        await _release_delivery(get_redis(), redis_key, claim)
    except Exception as exc:
        log.error(
            "github_webhook_sync_failed",
            delivery_id=delivery_id,
            webhook_event=event,
            gh_project_node_id=gh_project_node_id,
            error_type=type(exc).__name__,
        )
        await _release_delivery(get_redis(), redis_key, claim)


async def _release_delivery(redis: Any, key: str, claim: str) -> None:
    try:
        await redis.eval(_RELEASE_DELIVERY_SCRIPT, 1, key, claim)
    except RedisError:
        log.error("github_webhook_deduplication_release_failed")
