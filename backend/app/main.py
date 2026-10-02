from __future__ import annotations

import asyncio
import contextlib
import uuid
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from app.api.v1.router import api_v1_router
from app.core.config import normalize_http_origin, settings
from app.core.exceptions import AppError
from app.core.logging import configure_logging, get_logger, request_id_var
from app.core.redis import close_redis
from app.workers import github_sync_worker, session_timeout_worker

configure_logging(settings.LOG_LEVEL)
log = get_logger("app.main")

_CSRF_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def _request_origin(value: str, *, is_referer: bool) -> str | None:
    try:
        parsed = urlsplit(value)
        if is_referer:
            if not parsed.scheme or not parsed.netloc:
                return None
            value = f"{parsed.scheme}://{parsed.netloc}"
        return normalize_http_origin(value)
    except ValueError:
        return None


def _frame_ancestors_policy(existing_policy: str, directive: str) -> str:
    preserved: list[str] = []
    for item in existing_policy.split(";"):
        item = item.strip()
        if item and item.split(None, 1)[0].lower() != "frame-ancestors":
            preserved.append(item)
    preserved.append(directive)
    return "; ".join(preserved)


def _with_frame_ancestors(response: Response) -> None:
    directive = "frame-ancestors 'self'"
    if settings.allowed_embed_origins:
        directive += " " + " ".join(settings.allowed_embed_origins)

    current_policies = response.headers.getlist("content-security-policy")
    if not current_policies:
        response.headers["Content-Security-Policy"] = directive
        return

    updated_policies = [
        _frame_ancestors_policy(policy, directive)
        for header in current_policies
        for policy in header.split(",")
    ]
    del response.headers["content-security-policy"]
    for policy in updated_policies:
        response.headers.append("Content-Security-Policy", policy)


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ANN001, ARG001
    log.info("startup", env=settings.APP_ENV, local_dev_auth=settings.LOCAL_DEV_AUTH)
    worker_tasks = [
        asyncio.create_task(session_timeout_worker.run_forever()),
    ]
    if settings.GITHUB_SCHEDULED_SYNC_ENABLED:
        worker_tasks.append(
            asyncio.create_task(github_sync_worker.run_forever())
        )
    try:
        yield
    finally:
        for worker_task in worker_tasks:
            worker_task.cancel()
        for worker_task in worker_tasks:
            with contextlib.suppress(asyncio.CancelledError):
                await worker_task
        await close_redis()
        log.info("shutdown")


app = FastAPI(
    title=settings.APP_NAME,
    version="0.4.0",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["x-request-id"],
)


@app.middleware("http")
async def request_context(request: Request, call_next):  # noqa: ANN001
    rid = request.headers.get("x-request-id") or str(uuid.uuid4())
    token = request_id_var.set(rid)
    try:
        response = await call_next(request)
    finally:
        request_id_var.reset(token)
    response.headers["x-request-id"] = rid
    return response


@app.middleware("http")
async def csrf_origin_guard(request: Request, call_next):  # noqa: ANN001
    if request.method not in _CSRF_SAFE_METHODS:
        origin_header = request.headers.get("origin")
        referer_header = request.headers.get("referer")
        request_origin = None
        if origin_header:
            request_origin = _request_origin(origin_header, is_referer=False)
        elif referer_header:
            request_origin = _request_origin(referer_header, is_referer=True)

        allowed_origins: set[str] = set()
        for allowed in settings.cors_origins:
            try:
                allowed_origins.add(normalize_http_origin(allowed))
            except ValueError:
                continue

        has_session_cookie = bool(request.cookies.get(settings.SESSION_COOKIE_NAME))
        if (
            ((origin_header or referer_header) and request_origin not in allowed_origins)
            or (has_session_cookie and request_origin not in allowed_origins)
        ):
            return ORJSONResponse(
                status_code=403,
                content={
                    "error": {
                        "code": "CSRF_ORIGIN_REJECTED",
                        "message": "Request origin is not allowed",
                        "details": {},
                    }
                },
            )
    return await call_next(request)


@app.middleware("http")
async def frame_ancestors_guard(request: Request, call_next):  # noqa: ANN001
    response = await call_next(request)
    _with_frame_ancestors(response)
    return response


@app.exception_handler(AppError)
async def app_error_handler(_: Request, exc: AppError):  # noqa: ANN001
    return ORJSONResponse(status_code=exc.http_status, content=exc.to_dict())


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):  # noqa: ANN001
    return ORJSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Request payload failed validation",
                "details": {"errors": exc.errors()},
            }
        },
    )


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(api_v1_router, prefix="/api/v1")