from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import require_admin
from app.core.database import get_db
from app.core.exceptions import NotFound
from app.core.permissions import CurrentUser
from app.models.organization import OrgPolicy, Organization
from app.schemas.admin import (
    OrganizationPolicyOut,
    OrganizationPolicyPatch,
    OrganizationSettingsOut,
    OrganizationSettingsPatch,
)
from app.services import audit_service

router = APIRouter(tags=["admin:settings"])

_POLICY_FIELDS = (
    "workday_hours",
    "variance_threshold_minutes",
    "auto_logout_minutes",
    "allow_login_without_location",
    "location_retention_days",
)


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _policy_defaults() -> dict[str, Any]:
    return {
        field: getattr(OrgPolicy.__table__.c[field].default, "arg")
        for field in _POLICY_FIELDS
    }


def _policy_output(policy: OrgPolicy | None) -> OrganizationPolicyOut:
    values = _policy_defaults() if policy is None else {
        field: getattr(policy, field) for field in _POLICY_FIELDS
    }
    return OrganizationPolicyOut(
        id=policy.id if policy is not None else None,
        created_at=policy.created_at if policy is not None else None,
        updated_at=policy.updated_at if policy is not None else None,
        **values,
    )


@router.get("/organization", response_model=OrganizationSettingsOut)
async def get_organization(
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OrganizationSettingsOut:
    organization = await db.scalar(
        select(Organization).where(Organization.id == actor.org_id)
    )
    if organization is None:
        raise NotFound("Organization not found")
    return OrganizationSettingsOut.model_validate(organization)


@router.patch("/organization", response_model=OrganizationSettingsOut)
async def update_organization(
    payload: OrganizationSettingsPatch,
    request: Request,
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OrganizationSettingsOut:
    organization = await db.scalar(
        select(Organization).where(Organization.id == actor.org_id)
    )
    if organization is None:
        raise NotFound("Organization not found")

    changes = payload.model_dump(exclude_unset=True)
    before = {
        field: (
            getattr(organization, field).isoformat()
            if getattr(organization, field) is not None
            and field == "workday_cutoff"
            else getattr(organization, field)
        )
        for field in changes
    }
    for field, value in changes.items():
        setattr(organization, field, value)
    await db.flush()
    after = {
        field: (
            getattr(organization, field).isoformat()
            if getattr(organization, field) is not None
            and field == "workday_cutoff"
            else getattr(organization, field)
        )
        for field in changes
    }
    if before != after:
        await audit_service.record(
            db,
            actor_user_id=actor.id,
            action="admin.organization.update",
            entity="organization",
            entity_id=actor.org_id,
            before=before,
            after=after,
            ip=_ip(request),
        )
    return OrganizationSettingsOut.model_validate(organization)


@router.get("/policy", response_model=OrganizationPolicyOut)
async def get_policy(
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OrganizationPolicyOut:
    policy = await db.scalar(
        select(OrgPolicy).where(OrgPolicy.org_id == actor.org_id)
    )
    return _policy_output(policy)


@router.patch("/policy", response_model=OrganizationPolicyOut)
async def update_policy(
    payload: OrganizationPolicyPatch,
    request: Request,
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OrganizationPolicyOut:
    policy = await db.scalar(
        select(OrgPolicy).where(OrgPolicy.org_id == actor.org_id)
    )
    if policy is None:
        policy = OrgPolicy(org_id=actor.org_id)
        db.add(policy)
        await db.flush()

    before = {field: getattr(policy, field) for field in _POLICY_FIELDS}
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(policy, field, value)
    await db.flush()
    after = {field: getattr(policy, field) for field in _POLICY_FIELDS}
    if before != after:
        await audit_service.record(
            db,
            actor_user_id=actor.id,
            action="admin.policy.update",
            entity="org_policy",
            entity_id=policy.id,
            before=before,
            after=after,
            ip=_ip(request),
        )
    return _policy_output(policy)
