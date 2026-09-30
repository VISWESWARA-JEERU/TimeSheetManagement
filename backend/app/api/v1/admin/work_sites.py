from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import require_admin
from app.core.database import get_db
from app.core.exceptions import NotFound
from app.core.permissions import CurrentUser
from app.models.work_site import WorkSite
from app.schemas.admin import WorkSiteCreate, WorkSiteOut, WorkSitePatch
from app.schemas.common import OkResponse
from app.services import audit_service

router = APIRouter(prefix="/work-sites", tags=["admin:work-sites"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _snapshot(site: WorkSite) -> dict[str, str | float | bool]:
    return {
        "name": site.name,
        "latitude": float(site.latitude),
        "longitude": float(site.longitude),
        "radius_m": float(site.radius_m),
        "is_active": site.is_active,
    }


async def _get_site(
    db: AsyncSession, *, site_id: uuid.UUID, org_id: uuid.UUID
) -> WorkSite:
    site = await db.scalar(
        select(WorkSite).where(
            WorkSite.id == site_id,
            WorkSite.org_id == org_id,
        )
    )
    if site is None:
        raise NotFound("Work site not found")
    return site


@router.get("", response_model=list[WorkSiteOut])
async def list_work_sites(
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[WorkSiteOut]:
    sites = list(
        (
            await db.execute(
                select(WorkSite)
                .where(WorkSite.org_id == actor.org_id)
                .order_by(WorkSite.is_active.desc(), WorkSite.name.asc())
            )
        ).scalars()
    )
    return [WorkSiteOut.model_validate(site) for site in sites]


@router.post("", response_model=WorkSiteOut)
async def create_work_site(
    payload: WorkSiteCreate,
    request: Request,
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> WorkSiteOut:
    site = WorkSite(
        org_id=actor.org_id,
        name=payload.name,
        latitude=payload.latitude,
        longitude=payload.longitude,
        radius_m=payload.radius_m,
        is_active=payload.is_active,
    )
    db.add(site)
    await db.flush()
    await audit_service.record(
        db,
        actor_user_id=actor.id,
        action="work_site.create",
        entity="work_site",
        entity_id=site.id,
        after=_snapshot(site),
        ip=_ip(request),
    )
    return WorkSiteOut.model_validate(site)


@router.patch("/{site_id}", response_model=WorkSiteOut)
async def update_work_site(
    site_id: uuid.UUID,
    payload: WorkSitePatch,
    request: Request,
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> WorkSiteOut:
    site = await _get_site(db, site_id=site_id, org_id=actor.org_id)
    before = _snapshot(site)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(site, field, value)
    await db.flush()
    after = _snapshot(site)
    if before != after:
        await audit_service.record(
            db,
            actor_user_id=actor.id,
            action="work_site.update",
            entity="work_site",
            entity_id=site.id,
            before=before,
            after=after,
            ip=_ip(request),
        )
    return WorkSiteOut.model_validate(site)


@router.delete("/{site_id}", response_model=OkResponse)
async def delete_work_site(
    site_id: uuid.UUID,
    request: Request,
    actor: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OkResponse:
    site = await _get_site(db, site_id=site_id, org_id=actor.org_id)
    before = _snapshot(site)
    await db.delete(site)
    await db.flush()
    await audit_service.record(
        db,
        actor_user_id=actor.id,
        action="work_site.delete",
        entity="work_site",
        entity_id=site_id,
        before=before,
        after={},
        ip=_ip(request),
    )
    return OkResponse(ok=True)
