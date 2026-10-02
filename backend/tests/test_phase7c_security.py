from __future__ import annotations

import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlsplit

from fastapi.responses import Response
from httpx import ASGITransport, AsyncClient
from starlette.requests import Request

from app.api.v1 import auth as auth_api
from app.core.config import Settings
from app.core.exceptions import IntegrationError
from app.models.enums import GeoPermission
from app.services import auth_service


def make_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "DATABASE_URL": "postgresql+asyncpg://user:pass@localhost/timesheet",
        "DATABASE_URL_SYNC": "postgresql+psycopg://user:pass@localhost/timesheet",
        "SESSION_SECRET": "s" * 40,
        "_env_file": None,
    }
    values.update(overrides)
    return Settings(**values)


class EmbedConfigurationTests(unittest.TestCase):
    def test_accepts_multiple_explicit_embed_origins(self) -> None:
        config = make_settings(
            IMS_ALLOWED_EMBED_ORIGINS=(
                "https://ims.example.com,https://portal.example.org"
            )
        )
        self.assertEqual(
            config.allowed_embed_origins,
            ["https://ims.example.com", "https://portal.example.org"],
        )

    def test_rejects_wildcards_and_origins_with_paths(self) -> None:
        for origins in (
            "https://*.example.com",
            "https://ims.example.com/app",
            "https://ims.example.com?tenant=one",
            "https://user:password@ims.example.com",
        ):
            with self.subTest(origins=origins), self.assertRaises(ValueError):
                make_settings(IMS_ALLOWED_EMBED_ORIGINS=origins)

    def test_rejects_http_embed_origin_outside_local_development(self) -> None:
        with self.assertRaisesRegex(ValueError, "must use HTTPS"):
            make_settings(
                APP_ENV="production",
                SESSION_COOKIE_SECURE=True,
                IMS_OIDC_ENABLED=True,
                IMS_OIDC_ISSUER="https://ims.example.com",
                IMS_OIDC_CLIENT_ID="timesheet",
                IMS_OIDC_REDIRECT_URI="https://timesheet.example.com/api/v1/auth/ims/callback",
                IMS_ALLOWED_EMBED_ORIGINS="http://ims.example.com",
            )

    def test_rejects_unapproved_post_logout_redirect(self) -> None:
        with self.assertRaisesRegex(ValueError, "approved IMS origin"):
            make_settings(
                IMS_ALLOWED_EMBED_ORIGINS="https://ims.example.com",
                IMS_OIDC_POST_LOGOUT_REDIRECT="https://attacker.example/logout",
            )

    def test_production_cookie_configuration_requires_secure(self) -> None:
        with self.assertRaisesRegex(ValueError, "must be true in staging"):
            make_settings(
                APP_ENV="production",
                IMS_OIDC_ENABLED=True,
                IMS_OIDC_ISSUER="https://ims.example.com",
                IMS_OIDC_CLIENT_ID="timesheet",
                IMS_OIDC_REDIRECT_URI="https://timesheet.example.com/api/v1/auth/ims/callback",
            )

    def test_samesite_none_requires_secure(self) -> None:
        with self.assertRaisesRegex(ValueError, "when SameSite=None"):
            make_settings(
                SESSION_COOKIE_SECURE=False,
                SESSION_COOKIE_SAMESITE="none",
            )

    def test_local_cookie_configuration_remains_valid(self) -> None:
        config = make_settings(
            APP_ENV="local",
            SESSION_COOKIE_SECURE=False,
            SESSION_COOKIE_SAMESITE="lax",
            LOCAL_DEV_AUTH=True,
        )
        self.assertFalse(config.SESSION_COOKIE_SECURE)
        self.assertEqual(config.SESSION_COOKIE_SAMESITE, "lax")


class FrameAncestorsResponseTests(unittest.IsolatedAsyncioTestCase):
    async def _policy(self, origins: str) -> str:
        from app.main import app

        with patch(
            "app.core.config.settings.IMS_ALLOWED_EMBED_ORIGINS", origins
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://testserver",
            ) as client:
                response = await client.get("/healthz")
        return response.headers["content-security-policy"]

    async def test_response_allows_exact_configured_frame_origin(self) -> None:
        policy = await self._policy("https://ims.example.com")
        self.assertEqual(
            policy,
            "frame-ancestors 'self' https://ims.example.com",
        )
        self.assertNotIn("*", policy)
        self.assertNotIn("https://untrusted.example", policy)

    async def test_multiple_frame_origins_are_limited_to_configuration(self) -> None:
        policy = await self._policy(
            "https://ims.example.com,https://portal.example.org"
        )
        self.assertEqual(
            policy,
            "frame-ancestors 'self' https://ims.example.com https://portal.example.org",
        )
        self.assertNotIn("*", policy)

    def test_preserves_other_csp_directives_when_adding_frame_policy(self) -> None:
        from app.main import _with_frame_ancestors

        response = Response(
            headers={
                "Content-Security-Policy": (
                    "default-src 'self'; frame-ancestors 'none'; object-src 'none'"
                )
            }
        )
        with patch(
            "app.core.config.settings.IMS_ALLOWED_EMBED_ORIGINS",
            "https://ims.example.com",
        ):
            _with_frame_ancestors(response)
        self.assertEqual(
            response.headers["content-security-policy"],
            (
                "default-src 'self'; object-src 'none'; frame-ancestors "
                "'self' https://ims.example.com"
            ),
        )


class CsrfOriginGuardTests(unittest.IsolatedAsyncioTestCase):
    async def _post(self, headers: dict[str, str], cookies: dict[str, str]) -> int:
        from app.main import app

        with patch(
            "app.core.config.settings.CORS_ALLOWED_ORIGINS",
            "http://localhost:5173",
        ), patch("app.core.config.settings.SESSION_COOKIE_NAME", "tsid"):
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://testserver",
            ) as client:
                for name, value in cookies.items():
                    client.cookies.set(name, value)
                response = await client.post(
                    "/not-a-route",
                    headers=headers,
                )
        return response.status_code

    async def test_rejects_lookalike_untrusted_origin(self) -> None:
        self.assertEqual(
            await self._post(
                {"Origin": "http://localhost:5173.attacker.example"},
                {},
            ),
            403,
        )

    async def test_rejects_cookie_mutation_without_origin_or_referer(self) -> None:
        self.assertEqual(
            await self._post({}, {"tsid": "session-cookie"}),
            403,
        )

    async def test_allows_exact_configured_origin(self) -> None:
        self.assertEqual(
            await self._post(
                {"Origin": "http://localhost:5173"},
                {"tsid": "session-cookie"},
            ),
            404,
        )


class SessionCookieTests(unittest.TestCase):
    def test_set_and_delete_share_secure_cookie_attributes(self) -> None:
        with (
            patch("app.api.v1.auth.settings.SESSION_COOKIE_NAME", "tsid"),
            patch("app.api.v1.auth.settings.SESSION_COOKIE_SECURE", True),
            patch("app.api.v1.auth.settings.SESSION_COOKIE_SAMESITE", "none"),
        ):
            created = Response()
            auth_api._set_session_cookie(created, "secret-session-token", 3600)
            cleared = Response()
            auth_api._clear_session_cookie(cleared)

        self.assertIn("HttpOnly", created.headers["set-cookie"])
        self.assertIn("Secure", created.headers["set-cookie"])
        self.assertIn("SameSite=none", created.headers["set-cookie"])
        self.assertIn("Path=/", created.headers["set-cookie"])
        self.assertIn("HttpOnly", cleared.headers["set-cookie"])
        self.assertIn("Secure", cleared.headers["set-cookie"])
        self.assertIn("SameSite=none", cleared.headers["set-cookie"])
        self.assertIn("Path=/", cleared.headers["set-cookie"])
        self.assertIn("Max-Age=0", cleared.headers["set-cookie"])

    def test_local_cookie_remains_http_compatible(self) -> None:
        with (
            patch("app.api.v1.auth.settings.SESSION_COOKIE_NAME", "tsid"),
            patch("app.api.v1.auth.settings.SESSION_COOKIE_SECURE", False),
            patch("app.api.v1.auth.settings.SESSION_COOKIE_SAMESITE", "lax"),
        ):
            response = Response()
            auth_api._set_session_cookie(response, "local-session-token", 3600)
        cookie = response.headers["set-cookie"]
        self.assertIn("HttpOnly", cookie)
        self.assertIn("SameSite=lax", cookie)
        self.assertNotIn("Secure", cookie)


class _NestedTransaction:
    async def __aenter__(self) -> None:
        return None

    async def __aexit__(self, *args: object) -> bool:
        _ = args
        return False


class _FakeDatabase:
    def begin_nested(self) -> _NestedTransaction:
        return _NestedTransaction()


class ImsLogoutTests(unittest.IsolatedAsyncioTestCase):
    async def test_discovered_end_session_url_has_configured_safe_redirect(self) -> None:
        discovery = {
            "end_session_endpoint": "https://ims.example.com/logout"
        }
        with (
            patch("app.services.auth_service.settings.IMS_OIDC_ENABLED", True),
            patch(
                "app.services.auth_service.settings.IMS_OIDC_CLIENT_ID",
                "timesheet-client",
            ),
            patch(
                "app.services.auth_service.settings.IMS_OIDC_POST_LOGOUT_REDIRECT",
                "https://timesheet.example.com/login",
            ),
            patch(
                "app.services.auth_service.discovery_cache.discovery",
                new=AsyncMock(return_value=discovery),
            ),
        ):
            url = await auth_service.ims_end_session_url()

        self.assertIsNotNone(url)
        params = parse_qs(urlsplit(url).query)
        self.assertEqual(params["client_id"], ["timesheet-client"])
        self.assertEqual(
            params["post_logout_redirect_uri"],
            ["https://timesheet.example.com/login"],
        )
        self.assertNotIn("id_token_hint", params)

    async def test_missing_end_session_endpoint_does_not_fail_local_logout(self) -> None:
        with (
            patch("app.services.auth_service.settings.IMS_OIDC_ENABLED", True),
            patch(
                "app.services.auth_service.discovery_cache.discovery",
                new=AsyncMock(return_value={"issuer": "https://ims.example.com"}),
            ),
        ):
            self.assertIsNone(await auth_service.ims_end_session_url())

    async def test_discovery_failure_does_not_fail_local_logout(self) -> None:
        with (
            patch("app.services.auth_service.settings.IMS_OIDC_ENABLED", True),
            patch(
                "app.services.auth_service.discovery_cache.discovery",
                new=AsyncMock(side_effect=IntegrationError("provider unavailable")),
            ),
        ):
            self.assertIsNone(await auth_service.ims_end_session_url())

    async def _logout(self, end_session_url: str | None) -> tuple[Response, AsyncMock]:
        user = SimpleNamespace(id=uuid.uuid4())
        request = Request(
            {
                "type": "http",
                "asgi": {"version": "3.0"},
                "http_version": "1.1",
                "method": "POST",
                "scheme": "https",
                "path": "/api/v1/auth/logout",
                "raw_path": b"/api/v1/auth/logout",
                "query_string": b"",
                "headers": [(b"user-agent", b"test-agent")],
                "client": ("127.0.0.1", 12345),
                "server": ("testserver", 443),
                "state": {"session_id": uuid.uuid4()},
            }
        )
        attendance_checkout = AsyncMock()
        with (
            patch(
                "app.api.v1.auth.get_current_user",
                new=AsyncMock(return_value=user),
            ),
            patch(
                "app.api.v1.auth.attendance_service.check_out",
                new=attendance_checkout,
            ),
            patch(
                "app.api.v1.auth.auth_service.logout",
                new=AsyncMock(),
            ),
            patch(
                "app.api.v1.auth.auth_service.ims_end_session_url",
                new=AsyncMock(return_value=end_session_url),
            ),
            patch("app.api.v1.auth.settings.SESSION_COOKIE_NAME", "tsid"),
            patch("app.api.v1.auth.settings.SESSION_COOKIE_SECURE", True),
            patch("app.api.v1.auth.settings.SESSION_COOKIE_SAMESITE", "none"),
        ):
            response = await auth_api.logout(request, _FakeDatabase())
        return response, attendance_checkout

    async def test_logout_checks_out_with_unavailable_location_and_clears_cookie(self) -> None:
        response, attendance_checkout = await self._logout(None)
        kwargs = attendance_checkout.await_args.kwargs
        self.assertIsNone(kwargs["payload"].latitude)
        self.assertIsNone(kwargs["payload"].longitude)
        self.assertEqual(kwargs["payload"].geo_permission, GeoPermission.unavailable)
        self.assertIn("Max-Age=0", response.headers["set-cookie"])
        self.assertNotIn(b"https://ims.example.com/logout", response.body)

    async def test_logout_returns_optional_provider_end_session_url(self) -> None:
        response, _ = await self._logout("https://ims.example.com/logout")
        self.assertIn(b"ims_end_session_url", response.body)
        self.assertIn(b"https://ims.example.com/logout", response.body)


if __name__ == "__main__":
    unittest.main()
