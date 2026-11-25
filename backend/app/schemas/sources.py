"""Source upload & status Pydantic schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class SourceRead(BaseModel):
    id: str
    notebook_id: str
    filename: str
    file_type: str
    size_bytes: int
    sha256: str
    status: Literal["processing", "ready", "failed"]
    error_message: str | None = None
    warning_message: str | None = None
    page_count: int | None = None
    chunk_count: int = 0
    created_at: datetime


class SourceUploadResponse(BaseModel):
    uploaded: list[SourceRead]
