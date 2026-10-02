from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import attendance, auth, github_sync, github_webhook, projects, teams,tasks,time_entries,timesheets,approvals,reports
from app.api.v1.admin.router import router as admin_router


api_v1_router = APIRouter()

api_v1_router.include_router(auth.router)
api_v1_router.include_router(teams.router)
api_v1_router.include_router(attendance.router)
api_v1_router.include_router(projects.router)
api_v1_router.include_router(admin_router)
api_v1_router.include_router(tasks.router)
api_v1_router.include_router(time_entries.router)
api_v1_router.include_router(timesheets.router)
api_v1_router.include_router(approvals.router)
api_v1_router.include_router(reports.router)
api_v1_router.include_router(github_sync.router)
api_v1_router.include_router(github_webhook.router)