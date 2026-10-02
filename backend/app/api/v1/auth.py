from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import AppError, Unauthenticated
from app.core.logging import get_logger
from app.core.permissions import CurrentUser, permissions_for
from app.models.enums import GeoPermission
from app.schemas.auth import (
    AuthConfigResponse,
    DevLoginRequest,
    LogoutResponse,
    MeResponse,
    StartLoginResponse,
)
from app.services import attendance_service, auth_service
from app.services.attendance_service import LocationPayload

log = get_logger("app.api.auth")
router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str | None:
    # Trust X-Forwarded-For only when set by our own reverse proxy in a future phase.
    return request.client.host if request.client else None


def _session_cookie_options() -> dict[str, object]:
    return {
        "httponly": True,
        "secure": settings.SESSION_COOKIE_SECURE,
        "samesite": settings.SESSION_COOKIE_SAMESITE,
        "path": "/",
        "domain": None,
    }


def _set_session_cookie(response: Response, token: str, expires_in: int) -> None:
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=token,
        max_age=expires_in,
        **_session_cookie_options(),
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.SESSION_COOKIE_NAME,
        **_session_cookie_options(),
    )


@router.get("/config", response_model=AuthConfigResponse)
async def auth_config() -> AuthConfigResponse:
    return AuthConfigResponse(
        oidc_enabled=settings.oidc_enabled,
        local_dev_auth=settings.LOCAL_DEV_AUTH and settings.APP_ENV in ("local", "dev"),
        app_name=settings.APP_NAME,
    )


@router.post("/ims/login", response_model=StartLoginResponse)
@router.post("/login", response_model=StartLoginResponse)
async def start_login(
    request: Request,
    return_to: str | None = None,
) -> StartLoginResponse:
    url = await auth_service.start_oidc_login(
        return_to=return_to,
        ip=_client_ip(request),
        ua=request.headers.get("user-agent"),
    )
    # state is embedded in the URL, no need to echo separately here; kept for clients.
    return StartLoginResponse(authorize_url=url, state="")


@router.get("/ims/callback")
@router.get("/callback")
async def oidc_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> Response:
    if error:
        safe_error = "access_denied" if error == "access_denied" else "authentication_failed"
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL.rstrip('/')}/login?error={safe_error}",
            status_code=status.HTTP_302_FOUND,
        )
    if not code or not state:
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL.rstrip('/')}/login?error=missing_params",
            status_code=status.HTTP_302_FOUND,
        )

    try:
        issued, return_to = await auth_service.complete_oidc_login(
            db,
            code=code,
            state=state,
            ip=_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    except AppError as exc:
        log.warning("oidc_callback_failed", code=exc.code, reason=str(exc))
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL.rstrip('/')}/login?error=authentication_failed",
            status_code=status.HTTP_302_FOUND,
        )

    response = RedirectResponse(url=return_to, status_code=status.HTTP_302_FOUND)
    _set_session_cookie(response, issued.token, settings.SESSION_TTL_SECONDS)
    return response


@router.post("/dev-login", response_model=MeResponse)
async def dev_login(
    payload: DevLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Response:
    issued = await auth_service.dev_login(
        db,
        email=str(payload.email),
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    me = await _build_me(db, issued.user.id)
    response = JSONResponse(content=me.model_dump(mode="json"))
    _set_session_cookie(response, issued.token, settings.SESSION_TTL_SECONDS)
    return response


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Response:
    user = None
    try:
        user = await get_current_user(request, db)
    except Unauthenticated:
        pass

    if user is not None:
        try:
            async with db.begin_nested():
                await attendance_service.check_out(
                    db,
                    user_id=user.id,
                    payload=LocationPayload(
                        latitude=None,
                        longitude=None,
                        accuracy_m=None,
                        geo_permission=GeoPermission.unavailable,
                        client_reported_at=None,
                        device_id=None,
                    ),
                    ip=_client_ip(request),
                    user_agent=request.headers.get("user-agent"),
                )
        except Exception:
            log.exception(
                "attendance_checkout_before_logout_failed",
                user_id=str(user.id),
            )

        sid = getattr(request.state, "session_id", None)
        if sid is not None:
            await auth_service.logout(db, user_id=user.id, session_id=sid, ip=_client_ip(request))

    end_url = await auth_service.ims_end_session_url()
    response = JSONResponse(LogoutResponse(ok=True, ims_end_session_url=end_url).model_dump())
    _clear_session_cookie(response)
    return response


@router.get("/me", response_model=MeResponse)
async def me(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MeResponse:
    return await _build_me(db, user.id)


async def _build_me(db: AsyncSession, user_id) -> MeResponse:  # noqa: ANN001
    # Re-read the latest user; the CurrentUser object may be a moment old.
    from sqlalchemy import select  # local import to keep module surface lean

    from app.models.user import AppUser, UserRole

    user = (await db.execute(select(AppUser).where(AppUser.id == user_id))).scalar_one()
    roles = list(
        (await db.execute(select(UserRole.role).where(UserRole.user_id == user.id))).scalars()
    )
    role_names = sorted({r.value for r in roles})
    perms = sorted(permissions_for(frozenset(roles)))
    return MeResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        timezone=user.timezone,
        org_id=user.org_id,
        github_login=user.github_login,
        roles=role_names,
        permissions=perms,
    )