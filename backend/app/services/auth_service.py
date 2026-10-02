from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode, urlsplit, urlunsplit

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis

from app.core.config import settings
from app.core.exceptions import (
    Forbidden,
    IntegrationError,
    Unauthenticated,
    ValidationError,
)
from app.core.logging import get_logger
from app.core.oidc import discovery_cache, verify_id_token
from app.core.redis import get_redis
from app.core.security import (
    decode_session_token,
    issue_session_token,
    make_pkce_pair,
    random_urlsafe,
)
from app.models.enums import UserStatus
from app.models.user import AppUser, UserRole
from app.models.user_session import UserSession
from app.services import audit_service, user_service

log = get_logger("app.auth_service")

_PKCE_PREFIX = "pkce:"
_PKCE_TTL_SECONDS = 600
_CONSUME_STATE_SCRIPT = """
local value = redis.call('GET', KEYS[1])
if value then
    redis.call('DEL', KEYS[1])
end
return value
"""


@dataclass
class IssuedSession:
    user: AppUser
    roles: set
    token: str
    expires_at: datetime
    session_id: uuid.UUID


def _redis() -> Redis:
    return get_redis()


def _validated_return_to(return_to: str | None) -> str:
    frontend = urlsplit(settings.FRONTEND_URL)
    if not frontend.scheme or not frontend.netloc:
        raise ValidationError("FRONTEND_URL must be an absolute URL")

    target = (return_to or "/today").strip()
    if not target or "\\" in target or any(ord(char) < 32 for char in target):
        raise ValidationError("Invalid post-login redirect")

    parsed = urlsplit(target)
    if parsed.scheme or parsed.netloc:
        if (
            parsed.scheme != frontend.scheme
            or parsed.netloc != frontend.netloc
            or parsed.username is not None
            or parsed.password is not None
        ):
            raise ValidationError("Post-login redirect must remain on the frontend origin")
        return target

    if not target.startswith("/") or target.startswith("//"):
        raise ValidationError("Post-login redirect must be a frontend-relative path")

    return urlunsplit(
        (frontend.scheme, frontend.netloc, parsed.path, parsed.query, parsed.fragment)
    )


# ---------- OIDC flow ----------

async def start_oidc_login(return_to: str | None, ip: str | None, ua: str | None) -> str:
    if not settings.oidc_enabled or not settings.oidc_issuer or not settings.oidc_client_id:
        raise ValidationError("OIDC is not enabled")

    discovery = await discovery_cache.discovery()
    verifier, challenge = make_pkce_pair()
    state = random_urlsafe(32)
    nonce = random_urlsafe(32)

    payload = {
        "code_verifier": verifier,
        "nonce": nonce,
        "return_to": _validated_return_to(return_to),
        "ip": ip,
        "ua": ua,
    }
    await _redis().setex(_PKCE_PREFIX + state, _PKCE_TTL_SECONDS, json.dumps(payload))

    params = {
        "response_type": "code",
        "client_id": settings.oidc_client_id,
        "redirect_uri": settings.oidc_redirect_uri,
        "scope": settings.oidc_scopes,
        "state": state,
        "nonce": nonce,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    url = discovery["authorization_endpoint"] + "?" + urlencode(params)
    log.info("oidc_login_started", state=state[:8] + "...")
    return url


async def _exchange_code(code: str, verifier: str) -> dict[str, Any]:
    discovery = await discovery_cache.discovery()
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": settings.oidc_redirect_uri,
        "client_id": settings.oidc_client_id,
        "code_verifier": verifier,
    }
    headers = {"Accept": "application/json"}
    auth = None
    if settings.oidc_client_secret:
        auth = (settings.oidc_client_id or "", settings.oidc_client_secret)

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                discovery["token_endpoint"], data=data, headers=headers, auth=auth
            )
    except httpx.HTTPError as exc:
        raise IntegrationError("OIDC token exchange could not reach the identity provider") from exc
    if r.status_code != 200:
        log.warning("oidc_token_exchange_failed", status=r.status_code)
        raise Unauthenticated("Token exchange failed")
    try:
        tokens = r.json()
    except ValueError as exc:
        raise IntegrationError("OIDC token endpoint returned an invalid response") from exc
    if not isinstance(tokens, dict):
        raise IntegrationError("OIDC token endpoint returned an invalid response")
    return tokens


async def _create_session(
    db: AsyncSession,
    user: AppUser,
    *,
    auth_method: str,
    ip: str | None,
    user_agent: str | None,
) -> IssuedSession:
    if user.status != UserStatus.active:
        raise Forbidden("Account is disabled")

    now = datetime.now(timezone.utc)
    session = UserSession(
        user_id=user.id,
        issued_at=now,
        expires_at=now + timedelta(seconds=settings.SESSION_TTL_SECONDS),
        last_seen_at=now,
        ip=ip,
        user_agent=(user_agent or "")[:500] or None,
        auth_method=auth_method,
    )
    db.add(session)
    await db.flush()

    token, expires_at = issue_session_token(user.id, session.id)

    roles = set(
        (await db.execute(select(UserRole.role).where(UserRole.user_id == user.id))).scalars()
    )

    await audit_service.record(
        db,
        actor_user_id=user.id,
        action="auth.login",
        entity="user_session",
        entity_id=session.id,
        after={"auth_method": auth_method, "ip": ip},
        ip=ip,
    )
    return IssuedSession(
        user=user,
        roles=roles,
        token=token,
        expires_at=expires_at,
        session_id=session.id,
    )


async def complete_oidc_login(
    db: AsyncSession,
    *,
    code: str,
    state: str,
    ip: str | None,
    user_agent: str | None,
) -> tuple[IssuedSession, str]:
    """Returns (issued_session, return_to_url)."""
    if not state or len(state) > 512:
        raise Unauthenticated("Login state is invalid")
    raw = await _redis().eval(_CONSUME_STATE_SCRIPT, 1, _PKCE_PREFIX + state)
    if not raw:
        raise Unauthenticated("Login state has expired or is invalid")
    try:
        pkce = json.loads(raw)
        if not isinstance(pkce, dict):
            raise ValueError("Invalid login state payload")
        verifier: str = pkce["code_verifier"]
        nonce: str = pkce["nonce"]
        if not isinstance(verifier, str) or not isinstance(nonce, str):
            raise ValueError("Invalid login state values")
        return_to = _validated_return_to(pkce.get("return_to"))
    except (TypeError, ValueError, KeyError) as exc:
        raise Unauthenticated("Login state is invalid") from exc

    tokens = await _exchange_code(code, verifier)
    id_token = tokens.get("id_token")
    if not isinstance(id_token, str) or not id_token:
        raise Unauthenticated("Token response missing id_token")

    claims = await verify_id_token(id_token, expected_nonce=nonce)
    provisioned = await user_service.provision_from_ims(db, claims)

    issued = await _create_session(
        db,
        provisioned.user,
        auth_method="oidc",
        ip=ip,
        user_agent=user_agent,
    )
    return issued, return_to


# ---------- Local dev flow ----------

async def dev_login(
    db: AsyncSession,
    *,
    email: str,
    ip: str | None,
    user_agent: str | None,
) -> IssuedSession:
    if not settings.LOCAL_DEV_AUTH:
        raise Forbidden("Local development auth is disabled")
    if settings.APP_ENV not in ("local", "dev"):
        raise Forbidden("Local development auth is only available in local/dev")

    user = (
        await db.execute(select(AppUser).where(AppUser.email == email))
    ).scalar_one_or_none()
    if user is None:
        raise Unauthenticated("No demo user with that email")
    return await _create_session(
        db, user, auth_method="local_dev", ip=ip, user_agent=user_agent
    )


# ---------- Session validation ----------

async def load_session(
    db: AsyncSession, token: str
) -> tuple[UserSession, AppUser] | None:
    try:
        claims = decode_session_token(token)
    except Unauthenticated:
        return None

    session = (
        await db.execute(select(UserSession).where(UserSession.id == claims.session_id))
    ).scalar_one_or_none()
    if session is None:
        return None
    now = datetime.now(timezone.utc)
    if session.revoked_at is not None or session.expires_at <= now:
        return None

    user = (
        await db.execute(select(AppUser).where(AppUser.id == session.user_id))
    ).scalar_one_or_none()
    if user is None or user.status != UserStatus.active:
        return None

    # Throttled last_seen_at update.
    if session.last_seen_at is None or (now - session.last_seen_at) > timedelta(minutes=5):
        session.last_seen_at = now

    return session, user


async def logout(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    ip: str | None,
) -> None:
    session = (
        await db.execute(select(UserSession).where(UserSession.id == session_id))
    ).scalar_one_or_none()
    if session is None or session.revoked_at is not None:
        return
    session.revoked_at = datetime.now(timezone.utc)
    await audit_service.record(
        db,
        actor_user_id=user_id,
        action="auth.logout",
        entity="user_session",
        entity_id=session.id,
        ip=ip,
    )


async def ims_end_session_url() -> str | None:
    if not settings.oidc_enabled:
        return None
    try:
        discovery = await discovery_cache.discovery()
    except IntegrationError as exc:
        log.warning("oidc_end_session_discovery_failed", reason=str(exc))
        return None
    end_session_endpoint = discovery.get("end_session_endpoint")
    client_id = settings.oidc_client_id
    if not end_session_endpoint or not client_id:
        return None

    params = urlencode(
        {
            "client_id": client_id,
            "post_logout_redirect_uri": settings.oidc_post_logout_redirect,
        }
    )
    separator = "&" if "?" in end_session_endpoint else "?"
    return end_session_endpoint + separator + params