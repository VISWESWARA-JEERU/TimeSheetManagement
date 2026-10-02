from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

import httpx
import jwt
from jwt.algorithms import RSAAlgorithm

from app.core.config import settings
from app.core.exceptions import IntegrationError, Unauthenticated
from app.core.logging import get_logger

log = get_logger("app.oidc")

_DISCOVERY_TTL = 3600
_JWKS_TTL = 3600


@dataclass
class _CacheEntry:
    value: Any
    expires_at: float


class OIDCDiscoveryCache:
    """In-process cache for the issuer's discovery document + JWKS.

    Single-process only. A future Phase may back this with Redis for multi-worker.
    """

    def __init__(self) -> None:
        self._discovery: _CacheEntry | None = None
        self._jwks: _CacheEntry | None = None
        self._lock = asyncio.Lock()

    async def discovery(self) -> dict[str, Any]:
        async with self._lock:
            now = time.monotonic()
            if self._discovery and self._discovery.expires_at > now:
                return self._discovery.value

            issuer = settings.oidc_issuer
            if not issuer:
                raise IntegrationError("OIDC issuer is not configured")

            url = issuer.rstrip("/") + "/.well-known/openid-configuration"
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    r = await client.get(url)
            except httpx.HTTPError as exc:
                raise IntegrationError("OIDC discovery could not reach the identity provider") from exc
            if r.status_code != 200:
                raise IntegrationError(f"OIDC discovery failed: HTTP {r.status_code}")
            try:
                doc = r.json()
            except ValueError as exc:
                raise IntegrationError("OIDC discovery returned an invalid response") from exc
            if not isinstance(doc, dict):
                raise IntegrationError("OIDC discovery returned an invalid response")
            for required in ("authorization_endpoint", "token_endpoint", "jwks_uri", "issuer"):
                if not isinstance(doc.get(required), str) or not doc[required]:
                    raise IntegrationError(f"OIDC discovery missing field: {required}")
            if doc["issuer"].rstrip("/") != issuer.rstrip("/"):
                raise IntegrationError("OIDC discovery issuer does not match configured issuer")
            for endpoint in (
                doc["authorization_endpoint"],
                doc["token_endpoint"],
                doc["jwks_uri"],
            ):
                try:
                    parsed_endpoint = urlsplit(endpoint)
                except ValueError as exc:
                    raise IntegrationError(
                        "OIDC discovery contains an invalid endpoint"
                    ) from exc
                if (
                    not parsed_endpoint.hostname
                    or parsed_endpoint.username is not None
                    or parsed_endpoint.password is not None
                    or (
                        settings.APP_ENV not in ("local", "dev")
                        and parsed_endpoint.scheme != "https"
                    )
                    or (
                        settings.APP_ENV in ("local", "dev")
                        and parsed_endpoint.scheme not in ("http", "https")
                    )
                ):
                    raise IntegrationError("OIDC discovery contains an unsafe endpoint")

            self._discovery = _CacheEntry(doc, now + _DISCOVERY_TTL)
            return doc

    async def jwks(self, force_refresh: bool = False) -> dict[str, Any]:
        doc = await self.discovery()
        async with self._lock:
            now = time.monotonic()
            if not force_refresh and self._jwks and self._jwks.expires_at > now:
                return self._jwks.value

            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    r = await client.get(doc["jwks_uri"])
            except httpx.HTTPError as exc:
                raise IntegrationError("OIDC JWKS could not be fetched") from exc
            if r.status_code != 200:
                raise IntegrationError(f"JWKS fetch failed: HTTP {r.status_code}")
            try:
                jwks = r.json()
            except ValueError as exc:
                raise IntegrationError("OIDC JWKS endpoint returned an invalid response") from exc
            if not isinstance(jwks, dict) or not isinstance(jwks.get("keys"), list):
                raise IntegrationError("OIDC JWKS endpoint returned an invalid response")
            self._jwks = _CacheEntry(jwks, now + _JWKS_TTL)
            return jwks


discovery_cache = OIDCDiscoveryCache()


def _select_jwk(jwks: dict[str, Any], kid: str | None, alg: str) -> dict[str, Any]:
    keys = jwks.get("keys") or []
    if kid:
        for k in keys:
            if not isinstance(k, dict):
                continue
            if (
                k.get("kid") == kid
                and k.get("kty") == "RSA"
                and k.get("use", "sig") == "sig"
                and k.get("alg", alg) == alg
            ):
                return k
    for k in keys:
        if not isinstance(k, dict):
            continue
        if (
            not kid
            and k.get("kty") == "RSA"
            and k.get("use", "sig") == "sig"
            and k.get("alg", alg) == alg
        ):
            return k
    raise Unauthenticated("No suitable signing key found in JWKS")


async def verify_id_token(id_token: str, expected_nonce: str) -> dict[str, Any]:
    issuer = settings.oidc_issuer
    client_id = settings.oidc_client_id
    if not issuer or not client_id:
        raise IntegrationError("OIDC is not configured")

    try:
        header = jwt.get_unverified_header(id_token)
    except jwt.InvalidTokenError as e:
        raise Unauthenticated("Malformed ID token") from e

    kid = header.get("kid")
    alg = header.get("alg")
    if not isinstance(alg, str) or alg not in {"RS256", "RS384", "RS512"}:
        raise Unauthenticated("Unsupported ID token algorithm")
    if kid is not None and not isinstance(kid, str):
        raise Unauthenticated("ID token key identifier is invalid")

    jwks = await discovery_cache.jwks()
    try:
        jwk = _select_jwk(jwks, kid, alg)
    except Unauthenticated:
        # Key rotation: refresh once and retry.
        jwks = await discovery_cache.jwks(force_refresh=True)
        jwk = _select_jwk(jwks, kid, alg)

    try:
        public_key = RSAAlgorithm.from_jwk(jwk)
    except Exception as e:  # noqa: BLE001
        raise IntegrationError("Failed to load signing key") from e

    try:
        claims = jwt.decode(
            id_token,
            public_key,
            algorithms=[alg],
            audience=client_id,
            issuer=issuer.rstrip("/"),
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
        )
    except jwt.ExpiredSignatureError as e:
        raise Unauthenticated("ID token expired") from e
    except jwt.InvalidTokenError as e:
        raise Unauthenticated("ID token validation failed") from e

    if not expected_nonce or claims.get("nonce") != expected_nonce:
        raise Unauthenticated("ID token nonce mismatch")

    audience = claims.get("aud")
    if isinstance(audience, list) and len(audience) > 1 and claims.get("azp") != client_id:
        raise Unauthenticated("ID token authorized party mismatch")

    return claims