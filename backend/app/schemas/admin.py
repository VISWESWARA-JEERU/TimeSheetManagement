from __future__ import annotations

import uuid
from datetime import datetime, time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models.enums import Role, UserStatus


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: EmailStr
    full_name: str
    status: UserStatus
    timezone: str | None
    github_login: str | None
    roles: list[Role]
    created_at: datetime
    updated_at: datetime


class AdminUserPatch(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    status: UserStatus | None = None
    timezone: str | None = None
    github_login: str | None = None


class RoleChangeRequest(BaseModel):
    role: Role


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    actor_user_id: uuid.UUID | None
    action: str
    entity: str
    entity_id: uuid.UUID | None
    before: dict | None
    after: dict | None
    ip: str | None
    created_at: datetime


class OrganizationSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    default_timezone: str
    workday_cutoff: time | None
    created_at: datetime
    updated_at: datetime


class OrganizationSettingsPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    default_timezone: str | None = Field(default=None, min_length=1, max_length=100)
    workday_cutoff: time | None = None

    @field_validator("name", "default_timezone")
    @classmethod
    def trim_nonempty_text(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("This field cannot be null")
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank")
        return value

    @field_validator("default_timezone")
    @classmethod
    def validate_timezone(cls, value: str | None) -> str | None:
        if value is not None:
            try:
                ZoneInfo(value)
            except (ZoneInfoNotFoundError, ValueError) as exc:
                raise ValueError("default_timezone must be a valid IANA timezone") from exc
        return value

    @field_validator("workday_cutoff")
    @classmethod
    def validate_local_cutoff(cls, value: time | None) -> time | None:
        if value is not None and value.tzinfo is not None:
            raise ValueError("workday_cutoff must be a local time without a timezone")
        return value


class WorkSiteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    radius_m: float = Field(gt=0, le=100_000, allow_inf_nan=False)
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name cannot be blank")
        return value


class WorkSitePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    latitude: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    longitude: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    radius_m: float | None = Field(default=None, gt=0, le=100_000, allow_inf_nan=False)
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str | None) -> str | None:
        if value is not None:
            value = value.strip()
            if not value:
                raise ValueError("name cannot be blank")
        return value

    @model_validator(mode="after")
    def reject_null_updates(self) -> "WorkSitePatch":
        for field_name in self.model_fields_set:
            if getattr(self, field_name) is None:
                raise ValueError(f"{field_name} cannot be null")
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        return self


class WorkSiteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    latitude: float
    longitude: float
    radius_m: float
    is_active: bool
    created_at: datetime
    updated_at: datetime


class OrganizationPolicyOut(BaseModel):
    id: uuid.UUID | None = None
    workday_hours: int
    variance_threshold_minutes: int
    auto_logout_minutes: int
    allow_login_without_location: bool
    location_retention_days: int
    created_at: datetime | None = None
    updated_at: datetime | None = None


class OrganizationPolicyPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workday_hours: int | None = Field(default=None, ge=1, le=24)
    variance_threshold_minutes: int | None = Field(default=None, ge=0, le=1440)
    auto_logout_minutes: int | None = Field(default=None, gt=0)
    allow_login_without_location: bool | None = None
    location_retention_days: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_patch(self) -> "OrganizationPolicyPatch":
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        for field_name in self.model_fields_set:
            if getattr(self, field_name) is None:
                raise ValueError(f"{field_name} cannot be null")
        return self