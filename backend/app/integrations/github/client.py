from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import jwt

from app.core.config import settings
from app.core.exceptions import IntegrationError, RateLimited


class GitHubClient:
    _installation_token: str | None = None
    _installation_token_expires_at: datetime | None = None

    def __init__(self) -> None:
        self._api_base = settings.GITHUB_API_BASE.rstrip("/")
        self._timeout = httpx.Timeout(20.0, connect=5.0)

    async def graphql(
        self,
        query: str,
        variables: dict[str, Any],
    ) -> dict[str, Any]:
        response = await self._request(
            "POST",
            f"{self._api_base}/graphql",
            json={"query": query, "variables": variables},
        )
        try:
            payload = response.json()
        except ValueError as exc:
            raise IntegrationError("GitHub returned an invalid response") from exc
        errors = payload.get("errors") or []
        if any(
            error.get("type") == "RATE_LIMITED"
            or "rate limit" in str(error.get("message", "")).casefold()
            for error in errors
            if isinstance(error, dict)
        ):
            raise RateLimited("GitHub API rate limit exhausted")
        if errors:
            raise IntegrationError("GitHub GraphQL request failed")
        data = payload.get("data")
        if not isinstance(data, dict):
            raise IntegrationError("GitHub returned an incomplete GraphQL response")
        return data

    async def rest(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        response = await self._request(
            method,
            f"{self._api_base}/{path.lstrip('/')}",
            json=json,
        )
        if not response.content:
            return {}
        try:
            payload = response.json()
        except ValueError as exc:
            raise IntegrationError("GitHub returned an invalid response") from exc
        return payload if isinstance(payload, dict) else {}

    async def _request(
        self,
        method: str,
        url: str,
        *,
        json: dict[str, Any] | None = None,
        token: str | None = None,
    ) -> httpx.Response:
        access_token = token or await self._get_access_token()
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.request(
                    method,
                    url,
                    json=json,
                    headers={
                        "Accept": "application/vnd.github+json",
                        "Authorization": f"Bearer {access_token}",
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                )
        except httpx.TimeoutException as exc:
            raise IntegrationError("GitHub request timed out") from exc
        except httpx.HTTPError as exc:
            raise IntegrationError("GitHub could not be reached") from exc

        if response.status_code == 429 or (
            response.status_code == 403
            and response.headers.get("x-ratelimit-remaining") == "0"
        ):
            raise RateLimited("GitHub API rate limit exhausted")
        if response.is_error:
            raise IntegrationError(
                f"GitHub request failed with HTTP {response.status_code}"
            )
        return response

    async def _get_access_token(self) -> str:
        if settings.GITHUB_AUTH_MODE == "pat":
            if not settings.GITHUB_PAT:
                raise IntegrationError("GitHub PAT is not configured")
            return settings.GITHUB_PAT

        if settings.GITHUB_AUTH_MODE != "app":
            raise IntegrationError("GitHub authentication mode is invalid")

        now = datetime.now(UTC)
        cached_token = self.__class__._installation_token
        expires_at = self.__class__._installation_token_expires_at
        if cached_token and expires_at and now < expires_at - timedelta(minutes=2):
            return cached_token

        if not (
            settings.GITHUB_APP_ID
            and settings.GITHUB_PRIVATE_KEY
            and settings.GITHUB_INSTALLATION_ID
        ):
            raise IntegrationError("GitHub App credentials are not configured")

        private_key = settings.GITHUB_PRIVATE_KEY.replace("\\n", "\n")
        try:
            app_jwt = jwt.encode(
                {
                    "iat": int(now.timestamp()) - 60,
                    "exp": int((now + timedelta(minutes=9)).timestamp()),
                    "iss": settings.GITHUB_APP_ID,
                },
                private_key,
                algorithm="RS256",
            )
        except (jwt.PyJWTError, TypeError, ValueError) as exc:
            raise IntegrationError("GitHub App private key is invalid") from exc
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    f"{self._api_base}/app/installations/"
                    f"{settings.GITHUB_INSTALLATION_ID}/access_tokens",
                    headers={
                        "Accept": "application/vnd.github+json",
                        "Authorization": f"Bearer {app_jwt}",
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                )
        except httpx.HTTPError as exc:
            raise IntegrationError("GitHub installation token request failed") from exc

        if response.status_code == 429 or (
            response.status_code == 403
            and response.headers.get("x-ratelimit-remaining") == "0"
        ):
            raise RateLimited("GitHub API rate limit exhausted")
        if response.is_error:
            raise IntegrationError("GitHub installation token request failed")
        try:
            payload = response.json()
            access_token = payload["token"]
            token_expiry = datetime.fromisoformat(
                payload["expires_at"].replace("Z", "+00:00")
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise IntegrationError(
                "GitHub returned an invalid installation token response"
            ) from exc

        self.__class__._installation_token = access_token
        self.__class__._installation_token_expires_at = token_expiry
        return access_token
