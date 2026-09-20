from __future__ import annotations
import uuid

from app.core.exceptions import ValidationError

from collections.abc import Awaitable, Callable #new line added

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import Forbidden, Unauthenticated
from app.core.permissions import CurrentUser, has_permission
from app.models.enums import Role
from app.services import auth_service, user_service


def _cookie_token(request: Request) -> str | None:
    return request.cookies.get(settings.SESSION_COOKIE_NAME)


async def get_optional_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> CurrentUser | None:
    token = _cookie_token(request)
    if not token:
        return None
    resolved = await auth_service.load_session(db, token)
    if resolved is None:
        return None
    session, user = resolved
    request.state.session_id = session.id
    request.state.session_user_id = user.id
    return await user_service.load_current_user(db, user.id)


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    user = await get_optional_user(request, db)
    if user is None:
        raise Unauthenticated()
    return user


def require_role(*roles: Role) -> Callable[[CurrentUser], CurrentUser]:
    allowed = frozenset(roles)

    async def _dep(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if not (user.roles & allowed):
            raise Forbidden("Insufficient role")
        return user

    return _dep  # type: ignore[return-value]


async def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not user.is_admin:
        raise Forbidden("Admin role required")
    return user


async def require_manager(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not user.is_manager:
        raise Forbidden("Manager role required")
    return user


def require_permission(permission: str) -> Callable[[CurrentUser], CurrentUser]:
    async def _dep(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if not has_permission(user, permission):
            raise Forbidden(f"Missing permission: {permission}")
        return user

    return _dep  # type: ignore[return-value]



async def require_authenticated_user(
    user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """Named alias that makes the intent explicit at the endpoint level."""
    return user


def require_team_access(
    param: str = "team_id",
) -> Callable[..., Awaitable[CurrentUser]]:
    """Member of the team OR manager of the team OR admin."""

    async def _dep(
        request: Request,
        user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        raw = request.path_params.get(param)
        if raw is None:
            raise Forbidden(f"Missing path parameter: {param}")
        try:
            team_id = uuid.UUID(str(raw))
        except (ValueError, TypeError) as e:
            raise ValidationError(f"Invalid team id in path: {param}") from e
        if user.is_admin or user.belongs_to_team(team_id):
            return user
        raise Forbidden("You do not have access to this team")

    return _dep


def require_team_management(
    param: str = "team_id",
) -> Callable[..., Awaitable[CurrentUser]]:
    """Manager of the team OR admin."""

    async def _dep(
        request: Request,
        user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        raw = request.path_params.get(param)
        if raw is None:
            raise Forbidden(f"Missing path parameter: {param}")
        try:
            team_id = uuid.UUID(str(raw))
        except (ValueError, TypeError) as e:
            raise ValidationError(f"Invalid team id in path: {param}") from e
        if user.manages_team(team_id):
            return user
        raise Forbidden("You do not manage this team")

    return _dep