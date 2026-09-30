from fastapi import APIRouter

from app.api.v1.admin import audit, settings, teams, users, work_sites

router = APIRouter(prefix="/admin", tags=["admin"])
router.include_router(users.router)
router.include_router(teams.router)
router.include_router(settings.router)
router.include_router(work_sites.router)
router.include_router(audit.router)