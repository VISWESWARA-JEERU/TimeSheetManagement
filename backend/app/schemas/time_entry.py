from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import (
    CodeLinkType,
    TimeEntryStatus,
)


class CodeLinkInput(BaseModel):
    url: str = Field(
        min_length=1,
        max_length=2000,
    )

    link_type: CodeLinkType = CodeLinkType.other

    repo: str | None = None
    ref: str | None = None
    number: str | None = None
    note: str | None = None


class CodeLinkOut(BaseModel):
    model_config = ConfigDict(
        from_attributes=True
    )

    id: uuid.UUID
    time_entry_id: uuid.UUID

    url: str
    link_type: CodeLinkType

    repo: str | None
    ref: str | None
    number: str | None
    note: str | None

    created_at: datetime
    updated_at: datetime


class TimeEntryCreate(BaseModel):
    work_date: date

    project_id: uuid.UUID
    task_id: uuid.UUID | None = None

    description: str = Field(
        default="",
        max_length=5000,
    )

    started_at: datetime | None = None
    ended_at: datetime | None = None

    duration_minutes: int = Field(
        ge=1,
        le=1440,
    )

    billable: bool = False

    client_idempotency_key: str | None = Field(
        default=None,
        max_length=200,
    )

    code_links: list[CodeLinkInput] = Field(
        default_factory=list
    )

    @model_validator(mode="after")
    def validate_time_range(self):
        if (
            self.started_at is not None
            and self.ended_at is not None
            and self.ended_at < self.started_at
        ):
            raise ValueError(
                "ended_at must be after started_at"
            )

        return self


class TimeEntryUpdate(BaseModel):
    """
    version is required for optimistic concurrency control.
    """

    version: int = Field(
        ge=1
    )

    work_date: date | None = None

    project_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None

    description: str | None = Field(
        default=None,
        max_length=5000,
    )

    started_at: datetime | None = None
    ended_at: datetime | None = None

    duration_minutes: int | None = Field(
        default=None,
        ge=1,
        le=1440,
    )

    billable: bool | None = None

    code_links: list[CodeLinkInput] | None = None

    @model_validator(mode="after")
    def validate_time_range(self):
        if (
            self.started_at is not None
            and self.ended_at is not None
            and self.ended_at < self.started_at
        ):
            raise ValueError(
                "ended_at must be after started_at"
            )

        return self


class TimeEntryOut(BaseModel):
    model_config = ConfigDict(
        from_attributes=True
    )

    id: uuid.UUID
    user_id: uuid.UUID

    work_date: date

    project_id: uuid.UUID
    task_id: uuid.UUID | None
    task_title_snapshot: str | None

    description: str

    started_at: datetime | None
    ended_at: datetime | None

    duration_minutes: int
    billable: bool

    status: TimeEntryStatus

    version: int

    client_idempotency_key: str | None

    code_links: list[CodeLinkOut] = Field(
        default_factory=list
    )

    created_at: datetime
    updated_at: datetime