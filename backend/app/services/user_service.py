from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from pydantic import EmailStr, TypeAdapter, ValidationError as PydanticValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import Conflict, Forbidden, Unauthenticated, ValidationError
from app.core.logging import get_logger
from app.core.permissions import CurrentUser
from app.models.enums import Role, UserStatus
from app.models.organization import Organization
from app.models.user import AppUser, ImsIdentity, UserRole

log = get_logger("app.user_service")
_EMAIL_TYPE = TypeAdapter(EmailStr)


@dataclass
class ProvisionedUser:
    user: AppUser
    is_new: bool
    roles_added: set[Role]


def _roles_from_ims_groups(groups: list[str]) -> set[Role]:
    result: set[Role] = set()
    gset = {g.strip() for g in groups if g and isinstance(g, str)}
    if settings.oidc_groups_for_role("admin") & gset:
        result.add(Role.admin)
    if settings.oidc_groups_for_role("manager") & gset:
        result.add(Role.manager)
    if settings.oidc_groups_for_role("member") & gset:
        result.add(Role.member)
    if not result:
        result.add(Role.member)
    return result


async def _provisioning_org_id(db: AsyncSession) -> uuid.UUID:
    if settings.IMS_OIDC_ORG_ID:
        org = (
            await db.execute(
                select(Organization).where(Organization.id == settings.IMS_OIDC_ORG_ID)
            )
        ).scalar_one_or_none()
        if org is None:
            raise ValidationError(
                "IMS_OIDC_ORG_ID does not identify an existing organization"
            )
        return org.id

    organizations = (await db.execute(select(Organization).limit(2))).scalars().all()
    if len(organizations) == 1:
        return organizations[0].id
    if not organizations:
        raise ValidationError(
            "No organization exists for IMS user provisioning; create an organization first"
        )
    raise ValidationError(
        "Multiple organizations exist; set IMS_OIDC_ORG_ID to select the provisioning organization"
    )


async def ensure_user_roles(db: AsyncSession, user: AppUser, roles: set[Role]) -> set[Role]:
    existing = {
        r.role
        for r in (await db.execute(select(UserRole).where(UserRole.user_id == user.id))).scalars()
    }
    added: set[Role] = set()
    for role in roles - existing:
        db.add(UserRole(user_id=user.id, role=role))
        added.add(role)
    return added


async def provision_from_ims(db: AsyncSession, claims: dict[str, Any]) -> ProvisionedUser:
    """JIT user creation/update from a validated ID token claim set."""
    subject = claims.get("sub")
    if not subject or not isinstance(subject, str):
        raise Unauthenticated("IMS identity token is missing a valid subject")
    email = claims.get("email")
    if not email or not isinstance(email, str):
        raise Unauthenticated("IMS identity token is missing an email")
    try:
        email = str(_EMAIL_TYPE.validate_python(email.strip())).lower()
    except PydanticValidationError as exc:
        raise Unauthenticated("IMS identity token contains an invalid email") from exc
    full_name_claim = claims.get("name") or claims.get("preferred_username")
    full_name = full_name_claim.strip() if isinstance(full_name_claim, str) else ""
    full_name = full_name or email

    groups_claim = settings.oidc_groups_claim
    raw_groups = claims.get(groups_claim, [])
    if isinstance(raw_groups, str):
        groups = [g.strip() for g in raw_groups.split(",") if g.strip()]
    elif isinstance(raw_groups, list):
        if any(not isinstance(group, str) for group in raw_groups):
            raise Unauthenticated("IMS identity token contains invalid group claims")
        groups = [g.strip() for g in raw_groups if g.strip()]
    elif raw_groups is None:
        groups = []
    else:
        raise Unauthenticated("IMS identity token contains invalid group claims")
    target_roles = _roles_from_ims_groups(groups)

    is_new = False
    email_verified = claims.get("email_verified") is True

    identity = (
        await db.execute(
            select(ImsIdentity).where(
                ImsIdentity.provider == "ims",
                ImsIdentity.provider_subject == subject,
            )
        )
    ).scalar_one_or_none()
    subject_user = (
        await db.execute(select(AppUser).where(AppUser.ims_user_id == subject))
    ).scalar_one_or_none()
    identity_user = None
    if identity is not None:
        identity_user = (
            await db.execute(select(AppUser).where(AppUser.id == identity.user_id))
        ).scalar_one()
    if (
        subject_user is not None
        and identity_user is not None
        and subject_user.id != identity_user.id
    ):
        raise Conflict("IMS subject is linked to conflicting application accounts")

    user = subject_user or identity_user
    if user is None:
        if not email_verified:
            raise Forbidden("A verified IMS email is required for account provisioning")
        user = (
            await db.execute(
                select(AppUser).where(func.lower(AppUser.email) == email)
            )
        ).scalar_one_or_none()
        if user is not None and user.ims_user_id not in (None, subject):
            raise Conflict("IMS email belongs to an account linked to another IMS subject")

    if user is None:
        org_id = await _provisioning_org_id(db)
        user = AppUser(
            org_id=org_id,
            ims_user_id=subject,
            email=email,
            full_name=full_name,
            timezone=None,
            status=UserStatus.active,
        )
        db.add(user)
        await db.flush()
        is_new = True

    if user.status != UserStatus.active:
        raise Forbidden("Account is disabled")
    if user.ims_user_id not in (None, subject):
        raise Conflict("Application account is linked to another IMS subject")

    if email_verified and user.email.lower() != email:
        other_user = (
            await db.execute(
                select(AppUser).where(
                    func.lower(AppUser.email) == email,
                    AppUser.id != user.id,
                )
            )
        ).scalar_one_or_none()
        if other_user is not None:
            raise Conflict("Verified IMS email belongs to another application account")
        user.email = email
    if full_name_claim:
        user.full_name = full_name
    if user.ims_user_id is None:
        user.ims_user_id = subject

    if identity is None:
        db.add(
            ImsIdentity(user_id=user.id, provider="ims", provider_subject=subject)
        )

    roles_added = await ensure_user_roles(db, user, target_roles)

    log.info(
        "ims_provisioned",
        user_id=str(user.id),
        is_new=is_new,
        roles_added=[r.value for r in roles_added],
    )
    return ProvisionedUser(user=user, is_new=is_new, roles_added=roles_added)


async def load_current_user(db: AsyncSession, user_id: uuid.UUID) -> CurrentUser | None:
    from app.models.team import TeamMember  # local import to avoid cycles

    user = (
        await db.execute(select(AppUser).where(AppUser.id == user_id))
    ).scalar_one_or_none()
    if user is None or user.status != UserStatus.active:
        return None

    role_rows = (
        await db.execute(select(UserRole.role).where(UserRole.user_id == user.id))
    ).scalars().all()

    team_rows = (
        await db.execute(
            select(TeamMember.team_id, TeamMember.is_manager).where(
                TeamMember.user_id == user.id
            )
        )
    ).all()

    managed = frozenset(tid for tid, is_mgr in team_rows if is_mgr)
    all_teams = frozenset(tid for tid, _ in team_rows)

    return CurrentUser(
        id=user.id,
        org_id=user.org_id,
        email=user.email,
        full_name=user.full_name,
        roles=frozenset(role_rows),
        timezone=user.timezone,
        github_login=user.github_login,
        managed_team_ids=managed,
        member_team_ids=all_teams,
    )