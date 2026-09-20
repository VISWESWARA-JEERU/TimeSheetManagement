from __future__ import annotations
from fastapi import APIRouter

from app.api.v1 import auth, teams
# from app.api.v1.admin import router as admin_router
from app.api.v1.admin.router import router as admin_router
from app.api.v1 import attendance

api_v1_router = APIRouter()
api_v1_router.include_router(auth.router)
api_v1_router.include_router(teams.router)
api_v1_router.include_router(attendance.router)
api_v1_router.include_router(admin_router)