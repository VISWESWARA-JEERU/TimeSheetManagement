from __future__ import annotations

import hashlib
import hmac
from typing import Any


def verify_signature(
    body: bytes,
    signature_header: str | None,
    secret: str,
) -> bool:
    if not secret or not signature_header:
        return False
    algorithm, separator, supplied_digest = signature_header.partition("=")
    if (
        not separator
        or algorithm != "sha256"
        or len(supplied_digest) != 64
    ):
        return False
    try:
        bytes.fromhex(supplied_digest)
    except ValueError:
        return False
    expected_digest = hmac.new(
        secret.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected_digest, supplied_digest.lower())


def project_node_id(event: str, payload: dict[str, Any]) -> str | None:
    if event == "projects_v2":
        project = payload.get("projects_v2_project")
        node_id = project.get("node_id") if isinstance(project, dict) else None
    elif event == "projects_v2_item":
        item = payload.get("projects_v2_item")
        node_id = item.get("project_node_id") if isinstance(item, dict) else None
    else:
        return None
    return node_id if isinstance(node_id, str) and node_id else None
