from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import ProjectSource


class ProjectOut(BaseModel):
    """
    Project data returned to the frontend.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID

    name: str
    code: str | None

    source: ProjectSource
    is_active: bool

    created_at: datetime
    updated_at: datetime