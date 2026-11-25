"""Chat & citation Pydantic schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class Citation(BaseModel):
    index: int
    source_id: str
    filename: str
    page_start: int | None = None
    page_end: int | None = None
    section: str | None = None
    snippet: str
    score: float


class ChatRequest(BaseModel):
    notebook_id: str
    message: str = Field(..., min_length=1, max_length=4000)
    source_ids: list[str] | None = None
    conversation_id: str | None = None


class ChatResponse(BaseModel):
    message_id: str
    notebook_id: str
    answer: str
    citations: list[Citation]
    suggested_questions: list[str] = []
    usage: dict[str, int] | None = None


class ChatMessageRead(BaseModel):
    id: str
    notebook_id: str
    role: Literal["user", "assistant"]
    content: str
    citations: list[Citation] = []
    suggested_questions: list[str] = []
    created_at: datetime
