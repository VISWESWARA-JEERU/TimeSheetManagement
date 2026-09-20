"""Local-development seeding.

Usage:
    cd backend
    python -m app.scripts.seed_dev

Creates (idempotent):
  - One organization "Demo Org" with a default policy
  - One work site (optional; safe to skip)
  - Demo users: admin@example.com / manager@example.com / member@example.com
    (only when LOCAL_DEV_AUTH=true)

Does NOT create real credentials. Do not run in production.
"""
from __future__ import annotations

import asyncio
from datetime import time

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.enums import Role, UserStatus
from app.models.organization import Organization, OrgPolicy
from app.models.user import AppUser, UserRole
from app.models.work_site import WorkSite


async def _ensure_org(session) -> Organization:  # noqa: ANN001
    org = (await session.execute(select(Organization).limit(1))).scalar_one_or_none()
    if org is None:
        org = Organization(
            name="Demo Org",
            default_timezone="UTC",
            workday_cutoff=time(6, 0),
        )
        session.add(org)
        await session.flush()
        print(f"[seed] created organization id={org.id}")
    else:
        print(f"[seed] organization exists id={org.id}")

    policy = (
        await session.execute(select(OrgPolicy).where(OrgPolicy.org_id == org.id))
    ).scalar_one_or_none()
    if policy is None:
        session.add(
            OrgPolicy(
                org_id=org.id,
                workday_hours=settings.DEFAULT_WORKDAY_HOURS,
                variance_threshold_minutes=settings.VARIANCE_THRESHOLD_MINUTES,
                auto_logout_minutes=settings.AUTO_LOGOUT_MINUTES,
                allow_login_without_location=True,
                location_retention_days=settings.LOCATION_RETENTION_DAYS,
            )
        )
        print("[seed] created org policy")
    return org


async def _ensure_site(session, org: Organization) -> None:  # noqa: ANN001
    exists = (await session.execute(select(WorkSite).limit(1))).scalar_one_or_none()
    if exists is None:
        session.add(
            WorkSite(
                org_id=org.id,
                name="Downtown Office",
                latitude=41.878113,
                longitude=-87.629799,
                radius_m=200.0,
                is_active=True,
            )
        )
        print("[seed] created work site 'Downtown Office'")


async def _ensure_user(
    session,  # noqa: ANN001
    org: Organization,
    *,
    email: str,
    full_name: str,
    roles: list[Role],
) -> None:
    user = (await session.execute(select(AppUser).where(AppUser.email == email))).scalar_one_or_none()
    if user is None:
        user = AppUser(
            org_id=org.id,
            ims_user_id=f"dev:{email}",
            email=email,
            full_name=full_name,
            timezone="UTC",
            status=UserStatus.active,
        )
        session.add(user)
        await session.flush()
        print(f"[seed] created user {email} id={user.id}")
    existing = {
        r.role for r in (await session.execute(select(UserRole).where(UserRole.user_id == user.id))).scalars()
    }
    for role in roles:
        if role not in existing:
            session.add(UserRole(user_id=user.id, role=role))
            print(f"[seed] + role {role.value} for {email}")


async def _ensure_team(session, org, name, *, manager_email, member_emails):  # noqa: ANN001
    from app.models.team import Team, TeamMember

    team = (
        await session.execute(select(Team).where(Team.org_id == org.id, Team.name == name))
    ).scalar_one_or_none()
    if team is None:
        team = Team(org_id=org.id, name=name)
        session.add(team)
        await session.flush()
        print(f"[seed] created team '{name}' id={team.id}")

    async def _add(email: str, is_manager: bool) -> None:
        u = (
            await session.execute(select(AppUser).where(AppUser.email == email))
        ).scalar_one_or_none()
        if u is None:
            return
        existing = (
            await session.execute(
                select(TeamMember).where(
                    TeamMember.team_id == team.id, TeamMember.user_id == u.id
                )
            )
        ).scalar_one_or_none()
        if existing is None:
            session.add(TeamMember(team_id=team.id, user_id=u.id, is_manager=is_manager))

    if manager_email:
        await _add(manager_email, True)
    for e in member_emails:
        await _add(e, False)


async def main() -> None:
    if not settings.LOCAL_DEV_AUTH:
        print("[seed] LOCAL_DEV_AUTH is false — creating org only, no demo users.")
    async with AsyncSessionLocal() as session:
        org = await _ensure_org(session)
        await _ensure_site(session, org)
              
        if settings.LOCAL_DEV_AUTH:
            await _ensure_user(
                session, org, email="admin@example.com", full_name="Ada Admin", roles=[Role.admin]
            )
            await _ensure_user(
                session, org, email="manager@example.com", full_name="Mira Manager", roles=[Role.manager]
            )
            await _ensure_user(
                session, org, email="member@example.com", full_name="Milo Member", roles=[Role.member]
            )
            await _ensure_team(session, org, "Engineering", manager_email="manager@example.com",
                               member_emails=["member@example.com"])
            await _ensure_team(session, org, "Operations", manager_email="admin@example.com",
                               member_emails=[])
        await session.commit()
    print("[seed] done")


if __name__ == "__main__":
    asyncio.run(main())