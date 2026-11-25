"""Notebook Pydantic schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class NotebookCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)


class NotebookUpdate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)


class NotebookRead(BaseModel):
    id: str
    title: str
    source_count: int = 0
    created_at: datetime
    updated_at: datetime
