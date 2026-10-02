from __future__ import annotations

import json
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlsplit

from app.core.exceptions import Forbidden, Unauthenticated, ValidationError
from app.core.oidc import _select_jwk
from app.models.enums import Role
from app.services import auth_service
from app.services.auth_service import _validated_return_to
from app.services.user_service import (
    _provisioning_org_id,
    _roles_from_ims_groups,
    provision_from_ims,
)


class _Result:
    def __init__(self, values: list[object]) -> None:
        self.values = values

    def scalars(self) -> _Result:
        return self

    def all(self) -> list[object]:
        return self.values

    def scalar_one_or_none(self) -> object | None:
        return self.values[0] if self.values else None


class _FakeDatabase:
    def __init__(self, values: list[object]) -> None:
        self.values = values

    async def execute(self, statement: object) -> _Result:
        _ = statement
        return _Result(self.values)


class _FakeRedis:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.ttl: dict[str, int] = {}

    async def setex(self, key: str, ttl: int, value: str) -> None:
        self.values[key] = value
        self.ttl[key] = ttl

    async def eval(self, _script: str, _key_count: int, key: str) -> str | None:
        _ = (_script, _key_count)
        return self.values.pop(key, None)


class OIDCRedirectTests(unittest.TestCase):
    def setUp(self) -> None:
        self.frontend_url = patch(
            "app.services.auth_service.settings.FRONTEND_URL",
            "https://timesheet.example.com",
        )
        self.frontend_url.start()
        self.addCleanup(self.frontend_url.stop)

    def test_resolves_frontend_relative_redirect(self) -> None:
        self.assertEqual(
            _validated_return_to("/reports?period=week"),
            "https://timesheet.example.com/reports?period=week",
        )

    def test_accepts_same_origin_absolute_redirect(self) -> None:
        target = "https://timesheet.example.com/tasks"
        self.assertEqual(_validated_return_to(target), target)

    def test_rejects_external_and_protocol_relative_redirects(self) -> None:
        for target in (
            "https://attacker.example/",
            "//attacker.example/",
            r"/\\attacker.example/",
        ):
            with self.subTest(target=target), self.assertRaises(ValidationError):
                _validated_return_to(target)


class OIDCKeySelectionTests(unittest.TestCase):
    def test_requires_exact_key_id_match(self) -> None:
        jwks = {
            "keys": [
                {"kid": "expected", "kty": "RSA", "use": "sig", "alg": "RS256"},
                {"kid": "other", "kty": "RSA", "use": "sig", "alg": "RS256"},
            ]
        }
        self.assertEqual(_select_jwk(jwks, "expected", "RS256")["kid"], "expected")
        with self.assertRaises(Unauthenticated):
            _select_jwk(jwks, "unknown", "RS256")

    def test_maps_configured_ims_groups_to_roles(self) -> None:
        with (
            patch("app.core.config.settings.IMS_OIDC_ADMIN_GROUPS", "timesheet-admins"),
            patch("app.core.config.settings.OIDC_GROUP_TO_ROLE_ADMIN", None),
        ):
            self.assertEqual(
                _roles_from_ims_groups(["other", "timesheet-admins"]),
                {Role.admin},
            )


class ProvisioningOrganizationTests(unittest.IsolatedAsyncioTestCase):
    async def test_jit_requires_verified_email(self) -> None:
        with self.assertRaisesRegex(Forbidden, "verified IMS email"):
            await provision_from_ims(
                _FakeDatabase([]),
                {"sub": "ims-subject", "email": "member@example.com"},
            )

    async def test_uses_the_only_existing_organization(self) -> None:
        organization_id = uuid.uuid4()
        organization = type("OrganizationStub", (), {"id": organization_id})()
        with patch("app.services.user_service.settings.IMS_OIDC_ORG_ID", None):
            result = await _provisioning_org_id(_FakeDatabase([organization]))
        self.assertEqual(result, organization_id)

    async def test_requires_explicit_org_when_multiple_exist(self) -> None:
        organizations = [
            type("OrganizationStub", (), {"id": uuid.uuid4()})(),
            type("OrganizationStub", (), {"id": uuid.uuid4()})(),
        ]
        with (
            patch("app.services.user_service.settings.IMS_OIDC_ORG_ID", None),
            self.assertRaisesRegex(ValidationError, "IMS_OIDC_ORG_ID"),
        ):
            await _provisioning_org_id(_FakeDatabase(organizations))

    async def test_uses_and_validates_configured_organization(self) -> None:
        organization_id = uuid.uuid4()
        organization = type("OrganizationStub", (), {"id": organization_id})()
        with patch(
            "app.services.user_service.settings.IMS_OIDC_ORG_ID", organization_id
        ):
            result = await _provisioning_org_id(_FakeDatabase([organization]))
        self.assertEqual(result, organization_id)

        with (
            patch(
                "app.services.user_service.settings.IMS_OIDC_ORG_ID",
                uuid.uuid4(),
            ),
            self.assertRaisesRegex(ValidationError, "existing organization"),
        ):
            await _provisioning_org_id(_FakeDatabase([]))


class OIDCLoginFlowTests(unittest.IsolatedAsyncioTestCase):
    async def test_login_creates_short_lived_pkce_state(self) -> None:
        redis = _FakeRedis()
        with (
            patch("app.services.auth_service._redis", return_value=redis),
            patch(
                "app.services.auth_service.discovery_cache.discovery",
                new=AsyncMock(
                    return_value={
                        "authorization_endpoint": "https://ims.example.com/authorize"
                    }
                ),
            ),
            patch(
                "app.services.auth_service.make_pkce_pair",
                return_value=("secret-verifier", "pkce-challenge"),
            ),
            patch(
                "app.services.auth_service.random_urlsafe",
                side_effect=("one-time-state", "one-time-nonce"),
            ),
            patch("app.services.auth_service.settings.IMS_OIDC_ENABLED", True),
            patch(
                "app.services.auth_service.settings.IMS_OIDC_ISSUER",
                "https://ims.example.com",
            ),
            patch(
                "app.services.auth_service.settings.IMS_OIDC_CLIENT_ID",
                "timesheet-client",
            ),
            patch(
                "app.services.auth_service.settings.IMS_OIDC_REDIRECT_URI",
                "https://api.example.com/api/v1/auth/ims/callback",
            ),
            patch(
                "app.services.auth_service.settings.IMS_OIDC_SCOPES",
                "openid profile email groups",
            ),
            patch(
                "app.services.auth_service.settings.FRONTEND_URL",
                "https://timesheet.example.com",
            ),
        ):
            authorize_url = await auth_service.start_oidc_login(
                "/tasks", ip="127.0.0.1", ua="test-agent"
            )

        params = parse_qs(urlsplit(authorize_url).query)
        state_payload = json.loads(redis.values["pkce:one-time-state"])
        self.assertEqual(redis.ttl["pkce:one-time-state"], 600)
        self.assertEqual(state_payload["code_verifier"], "secret-verifier")
        self.assertEqual(state_payload["nonce"], "one-time-nonce")
        self.assertEqual(
            state_payload["return_to"], "https://timesheet.example.com/tasks"
        )
        self.assertEqual(params["code_challenge"], ["pkce-challenge"])
        self.assertEqual(params["code_challenge_method"], ["S256"])
        self.assertEqual(params["state"], ["one-time-state"])
        self.assertEqual(params["nonce"], ["one-time-nonce"])

    async def test_callback_consumes_state_and_reuses_session_creator(self) -> None:
        redis = _FakeRedis()
        redis.values["pkce:one-time-state"] = json.dumps(
            {
                "code_verifier": "secret-verifier",
                "nonce": "one-time-nonce",
                "return_to": "https://timesheet.example.com/reports",
            }
        )
        session = object()
        provisioned = SimpleNamespace(user=object())
        db = object()
        with (
            patch("app.services.auth_service._redis", return_value=redis),
            patch(
                "app.services.auth_service._exchange_code",
                new=AsyncMock(return_value={"id_token": "signed-id-token"}),
            ) as exchange,
            patch(
                "app.services.auth_service.verify_id_token",
                new=AsyncMock(return_value={"sub": "ims-subject"}),
            ) as verify,
            patch(
                "app.services.auth_service.user_service.provision_from_ims",
                new=AsyncMock(return_value=provisioned),
            ) as provision,
            patch(
                "app.services.auth_service._create_session",
                new=AsyncMock(return_value=session),
            ) as create_session,
            patch(
                "app.services.auth_service.settings.FRONTEND_URL",
                "https://timesheet.example.com",
            ),
        ):
            result = await auth_service.complete_oidc_login(
                db,
                code="authorization-code",
                state="one-time-state",
                ip="127.0.0.1",
                user_agent="test-agent",
            )
            with self.assertRaises(Unauthenticated):
                await auth_service.complete_oidc_login(
                    db,
                    code="authorization-code",
                    state="one-time-state",
                    ip="127.0.0.1",
                    user_agent="test-agent",
                )

        self.assertEqual(
            result,
            (session, "https://timesheet.example.com/reports"),
        )
        exchange.assert_awaited_once_with("authorization-code", "secret-verifier")
        verify.assert_awaited_once_with(
            "signed-id-token", expected_nonce="one-time-nonce"
        )
        provision.assert_awaited_once_with(db, {"sub": "ims-subject"})
        create_session.assert_awaited_once_with(
            db,
            provisioned.user,
            auth_method="oidc",
            ip="127.0.0.1",
            user_agent="test-agent",
        )


class LocalDevelopmentAuthTests(unittest.IsolatedAsyncioTestCase):
    async def test_local_dev_login_remains_available_when_enabled(self) -> None:
        user = object()
        issued_session = object()
        db = _FakeDatabase([user])
        with (
            patch("app.services.auth_service.settings.LOCAL_DEV_AUTH", True),
            patch("app.services.auth_service.settings.APP_ENV", "local"),
            patch(
                "app.services.auth_service._create_session",
                new=AsyncMock(return_value=issued_session),
            ) as create_session,
        ):
            result = await auth_service.dev_login(
                db,
                email="member@example.com",
                ip=None,
                user_agent=None,
            )
        self.assertIs(result, issued_session)
        create_session.assert_awaited_once_with(
            db,
            user,
            auth_method="local_dev",
            ip=None,
            user_agent=None,
        )

    async def test_local_dev_login_stays_disabled_outside_local_mode(self) -> None:
        with (
            patch("app.services.auth_service.settings.LOCAL_DEV_AUTH", True),
            patch("app.services.auth_service.settings.APP_ENV", "production"),
        ):
            with self.assertRaises(Forbidden):
                await auth_service.dev_login(
                    _FakeDatabase([]),
                    email="member@example.com",
                    ip=None,
                    user_agent=None,
                )


if __name__ == "__main__":
    unittest.main()
