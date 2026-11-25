"""Health check response schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class OllamaHealthStatus(BaseModel):
    base_url: str
    model: str
    reachable: bool
    model_available: bool
    available_models: list[str] = []
    hint: str | None = None


class EmbeddingsHealthStatus(BaseModel):
    model: str
    loaded: bool


class TtsHealthStatus(BaseModel):
    available: bool
    engine: str | None = None


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    ollama: OllamaHealthStatus
    embeddings: EmbeddingsHealthStatus
    tts: TtsHealthStatus
    message: str
    hint: str | None = None
