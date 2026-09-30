from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import AttendanceStatus, GeoEventType, GeoPermission


class LocationInput(BaseModel):
    latitude: float | None = Field(default=None, ge=-90.0, le=90.0)
    longitude: float | None = Field(default=None, ge=-180.0, le=180.0)
    accuracy_m: float | None = Field(default=None, ge=0.0)
    geo_permission: GeoPermission
    client_reported_at: datetime | None = None
    device_id: str | None = Field(default=None, max_length=200)


class GeoEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    event_type: GeoEventType
    occurred_at: datetime
    client_reported_at: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None
    accuracy_m: float | None = None
    geo_permission: GeoPermission
    place_label: str | None = None
    site_id: uuid.UUID | None = None
    inside_site: bool | None = None


class WorkSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    user_id: uuid.UUID
    login_at: datetime
    logout_at: datetime | None = None
    logout_reason: str | None = None
    session_seconds: int | None = None


class AttendanceDayOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    user_id: uuid.UUID
    work_date: date
    first_login_at: datetime | None = None
    last_logout_at: datetime | None = None
    total_session_seconds: int
    logged_seconds: int
    status: AttendanceStatus


class AttendanceTodayOut(BaseModel):
    attendance_day: AttendanceDayOut | None = None
    active_session: WorkSessionOut | None = None
    first_login_event: GeoEventOut | None = None
    last_logout_event: GeoEventOut | None = None


class CheckInOut(BaseModel):
    attendance_day: AttendanceDayOut
    work_session: WorkSessionOut
    login_event: GeoEventOut
    is_duplicate: bool


class CheckOutOut(BaseModel):
    attendance_day: AttendanceDayOut | None = None
    work_session: WorkSessionOut | None = None
    logout_event: GeoEventOut | None = None
    is_duplicate: bool


class TeamAttendanceRow(BaseModel):
    user_id: uuid.UUID
    email: str
    full_name: str
    attendance_day: AttendanceDayOut | None = None
    active_session: bool = False
    first_login_event: GeoEventOut | None = None
    last_logout_event: GeoEventOut | None = None
    entry_count: int = 0
    flags: list[str] = Field(default_factory=list)