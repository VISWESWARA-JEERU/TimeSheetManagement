"""Local-development seeding.

Usage:
    cd backend
    python -m app.scripts.seed_dev

Creates (idempotent):
  - One organization "Demo Org" with a default policy
  - One work site
  - Demo projects
  - Demo users: admin@example.com / manager@example.com / member@example.com
    (only when LOCAL_DEV_AUTH=true)
  - Demo teams

Does NOT create real credentials.
Do not run in production.
"""

from __future__ import annotations

import asyncio
from datetime import time

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal

from app.models.enums import (
    ProjectSource,
    Role,
    SyncState,
    TaskSource,
    UserStatus,
)
from app.models.organization import Organization, OrgPolicy
from app.models.project import Project
from app.models.task import Task
from app.models.user import AppUser, UserRole
from app.models.work_site import WorkSite

# =========================================================
# ORGANIZATION
# =========================================================

async def _ensure_org(session) -> Organization:  # noqa: ANN001
    org = (
        await session.execute(
            select(Organization).limit(1)
        )
    ).scalar_one_or_none()

    if org is None:
        org = Organization(
            name="Demo Org",
            default_timezone="UTC",
            workday_cutoff=time(6, 0),
        )

        session.add(org)
        await session.flush()

        print(
            f"[seed] created organization "
            f"id={org.id}"
        )
    else:
        print(
            f"[seed] organization exists "
            f"id={org.id}"
        )

    policy = (
        await session.execute(
            select(OrgPolicy).where(
                OrgPolicy.org_id == org.id
            )
        )
    ).scalar_one_or_none()

    if policy is None:
        session.add(
            OrgPolicy(
                org_id=org.id,
                workday_hours=settings.DEFAULT_WORKDAY_HOURS,
                variance_threshold_minutes=(
                    settings.VARIANCE_THRESHOLD_MINUTES
                ),
                auto_logout_minutes=(
                    settings.AUTO_LOGOUT_MINUTES
                ),
                allow_login_without_location=True,
                location_retention_days=(
                    settings.LOCATION_RETENTION_DAYS
                ),
            )
        )

        print("[seed] created org policy")

    return org


# =========================================================
# WORK SITE
# =========================================================

async def _ensure_site(
    session,
    org: Organization,
) -> None:  # noqa: ANN001

    exists = (
        await session.execute(
            select(WorkSite).where(
                WorkSite.org_id == org.id,
                WorkSite.name == "Downtown Office",
            )
        )
    ).scalar_one_or_none()

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

        print(
            "[seed] created work site "
            "'Downtown Office'"
        )
    else:
        print(
            "[seed] work site "
            "'Downtown Office' exists"
        )


# =========================================================
# PROJECTS
# =========================================================

async def _ensure_project(
    session,
    org: Organization,
    *,
    name: str,
    code: str,
) -> Project:  # noqa: ANN001

    project = (
        await session.execute(
            select(Project).where(
                Project.org_id == org.id,
                Project.name == name,
            )
        )
    ).scalar_one_or_none()

    if project is None:
        project = Project(
            org_id=org.id,
            name=name,
            code=code,
            source=ProjectSource.manual,
            is_active=True,
        )

        session.add(project)
        await session.flush()

        print(
            f"[seed] created project "
            f"'{name}' id={project.id}"
        )
    else:
        print(
            f"[seed] project "
            f"'{name}' exists"
        )

    return project


async def _ensure_projects(
    session,
    org: Organization,
) -> None:  # noqa: ANN001

    await _ensure_project(
        session,
        org,
        name="TimeSheet Management",
        code="TSM",
    )

    await _ensure_project(
        session,
        org,
        name="Internal Tools",
        code="INT",
    )

    await _ensure_project(
        session,
        org,
        name="Client Support",
        code="SUP",
    )
# =========================================================
# TASKS
# =========================================================

async def _ensure_task(
    session,
    *,
    project: Project,
    title: str,
    description: str,
    status: str = "Todo",
    assignee_email: str | None = None,
) -> Task:  # noqa: ANN001

    task = (
        await session.execute(
            select(Task).where(
                Task.project_id == project.id,
                Task.title == title,
            )
        )
    ).scalar_one_or_none()

    if task is not None:
        print(
            f"[seed] task '{title}' exists "
            f"in project '{project.name}'"
        )
        return task

    assignee_user_id = None

    if assignee_email:
        user = (
            await session.execute(
                select(AppUser).where(
                    AppUser.email == assignee_email
                )
            )
        ).scalar_one_or_none()

        if user is not None:
            assignee_user_id = user.id

    task = Task(
        project_id=project.id,
        title=title,
        description=description,
        status=status,
        assignee_user_id=assignee_user_id,
        source=TaskSource.manual,
        sync_state=SyncState.synced,
        is_active=True,
    )

    session.add(task)
    await session.flush()

    print(
        f"[seed] created task '{title}' "
        f"in project '{project.name}'"
    )

    return task


async def _ensure_tasks(
    session,
    org: Organization,
) -> None:  # noqa: ANN001

    timesheet_project = (
        await session.execute(
            select(Project).where(
                Project.org_id == org.id,
                Project.name == "TimeSheet Management",
            )
        )
    ).scalar_one_or_none()

    internal_project = (
        await session.execute(
            select(Project).where(
                Project.org_id == org.id,
                Project.name == "Internal Tools",
            )
        )
    ).scalar_one_or_none()

    support_project = (
        await session.execute(
            select(Project).where(
                Project.org_id == org.id,
                Project.name == "Client Support",
            )
        )
    ).scalar_one_or_none()

    if timesheet_project is not None:
        await _ensure_task(
            session,
            project=timesheet_project,
            title="Build Attendance Frontend",
            description=(
                "Implement check-in, check-out and today's "
                "attendance summary."
            ),
            status="Done",
            assignee_email="member@example.com",
        )

        await _ensure_task(
            session,
            project=timesheet_project,
            title="Build Weekly Timesheet",
            description=(
                "Create the weekly timesheet interface "
                "and connect time-entry APIs."
            ),
            status="In Progress",
            assignee_email="member@example.com",
        )

        await _ensure_task(
            session,
            project=timesheet_project,
            title="Implement Time Entry API",
            description=(
                "Create backend CRUD APIs for employee "
                "time entries."
            ),
            status="Todo",
            assignee_email="manager@example.com",
        )

    if internal_project is not None:
        await _ensure_task(
            session,
            project=internal_project,
            title="Improve Admin Dashboard",
            description=(
                "Improve user, role, team and audit-log "
                "management screens."
            ),
            status="In Progress",
            assignee_email="admin@example.com",
        )

        await _ensure_task(
            session,
            project=internal_project,
            title="Review Role Permissions",
            description=(
                "Verify member, manager and admin "
                "permissions across the application."
            ),
            status="Todo",
            assignee_email="manager@example.com",
        )

    if support_project is not None:
        await _ensure_task(
            session,
            project=support_project,
            title="Resolve Client Issue",
            description=(
                "Investigate and document a client "
                "support request."
            ),
            status="Todo",
            assignee_email="member@example.com",
        )

# =========================================================
# USERS
# =========================================================

async def _ensure_user(
    session,  # noqa: ANN001
    org: Organization,
    *,
    email: str,
    full_name: str,
    roles: list[Role],
) -> None:

    user = (
        await session.execute(
            select(AppUser).where(
                AppUser.email == email
            )
        )
    ).scalar_one_or_none()

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

        print(
            f"[seed] created user "
            f"{email} id={user.id}"
        )

    existing = {
        role.role
        for role in (
            await session.execute(
                select(UserRole).where(
                    UserRole.user_id == user.id
                )
            )
        ).scalars()
    }

    for role in roles:
        if role not in existing:
            session.add(
                UserRole(
                    user_id=user.id,
                    role=role,
                )
            )

            print(
                f"[seed] + role "
                f"{role.value} for {email}"
            )


# =========================================================
# TEAMS
# =========================================================

async def _ensure_team(
    session,
    org,
    name,
    *,
    manager_email,
    member_emails,
):  # noqa: ANN001

    from app.models.team import Team, TeamMember

    team = (
        await session.execute(
            select(Team).where(
                Team.org_id == org.id,
                Team.name == name,
            )
        )
    ).scalar_one_or_none()

    if team is None:
        team = Team(
            org_id=org.id,
            name=name,
        )

        session.add(team)
        await session.flush()

        print(
            f"[seed] created team "
            f"'{name}' id={team.id}"
        )

    async def _add(
        email: str,
        is_manager: bool,
    ) -> None:

        user = (
            await session.execute(
                select(AppUser).where(
                    AppUser.email == email
                )
            )
        ).scalar_one_or_none()

        if user is None:
            return

        existing = (
            await session.execute(
                select(TeamMember).where(
                    TeamMember.team_id == team.id,
                    TeamMember.user_id == user.id,
                )
            )
        ).scalar_one_or_none()

        if existing is None:
            session.add(
                TeamMember(
                    team_id=team.id,
                    user_id=user.id,
                    is_manager=is_manager,
                )
            )

    if manager_email:
        await _add(
            manager_email,
            True,
        )

    for email in member_emails:
        await _add(
            email,
            False,
        )


# =========================================================
# MAIN
# =========================================================
async def main() -> None:

    if not settings.LOCAL_DEV_AUTH:
        print(
            "[seed] LOCAL_DEV_AUTH is false — "
            "creating organization/project data only, "
            "no demo users."
        )

    async with AsyncSessionLocal() as session:

        # Organization
        org = await _ensure_org(session)

        # Work site
        await _ensure_site(
            session,
            org,
        )

        # Projects
        await _ensure_projects(
            session,
            org,
        )

        if settings.LOCAL_DEV_AUTH:

            await _ensure_user(
                session,
                org,
                email="admin@example.com",
                full_name="Ada Admin",
                roles=[Role.admin],
            )

            await _ensure_user(
                session,
                org,
                email="manager@example.com",
                full_name="Mira Manager",
                roles=[Role.manager],
            )

            await _ensure_user(
                session,
                org,
                email="member@example.com",
                full_name="Milo Member",
                roles=[Role.member],
            )

            # Demo tasks
            await _ensure_tasks(
                session,
                org,
            )

            # Engineering team
            await _ensure_team(
                session,
                org,
                "Engineering",
                manager_email="manager@example.com",
                member_emails=[
                    "member@example.com",
                ],
            )

            # Operations team
            await _ensure_team(
                session,
                org,
                "Operations",
                manager_email="admin@example.com",
                member_emails=[],
            )

        await session.commit()

    print("[seed] done")