from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import (
    GhContentType,
    SyncState,
    TaskSource,
)


class TaskOut(BaseModel):
    """
    Task data returned to the frontend.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID

    title: str
    description: str
    status: str

    assignee_user_id: uuid.UUID | None

    source: TaskSource

    gh_item_node_id: str | None
    gh_content_type: GhContentType | None
    gh_issue_number: int | None
    gh_repo: str | None
    gh_url: str | None
    gh_updated_at: datetime | None

    local_updated_at: datetime
    sync_state: SyncState

    is_active: bool

    created_at: datetime
    updated_at: datetime


class TaskPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str | None = Field(default=None, max_length=50000)
    status: str | None = Field(default=None, max_length=200)

    @field_validator("status")
    @classmethod
    def strip_status(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return value.strip()

    @model_validator(mode="after")
    def validate_patch(self) -> "TaskPatch":
        if not self.model_fields_set:
            raise ValueError("At least one supported task field must be provided")
        if "description" in self.model_fields_set and self.description is None:
            raise ValueError("Description cannot be null")
        if "status" in self.model_fields_set and not self.status:
            raise ValueError("Status cannot be empty")
        return self