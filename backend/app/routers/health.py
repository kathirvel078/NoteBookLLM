"""Health endpoint reporting Ollama, embeddings, and local TTS readiness."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.schemas.health import (
    EmbeddingsHealthStatus,
    HealthResponse,
    OllamaHealthStatus,
    TtsHealthStatus,
)
from app.services.ollama_client import OllamaService, get_ollama_service

router = APIRouter(prefix="/api", tags=["health"])


def _is_embeddings_loaded() -> bool:
    try:
        from app.services.embeddings import is_embedding_model_loaded

        return is_embedding_model_loaded()
    except ImportError:
        return False


def _detect_tts_status(settings: Settings) -> tuple[bool, str | None]:
    try:
        from app.services.tts import detect_tts_engine

        engine = detect_tts_engine(settings)
        return (engine is not None, engine)
    except ImportError:
        return (False, None)


@router.get("/health", response_model=HealthResponse)
async def health_check(
    settings: Settings = Depends(get_settings),
    ollama_svc: OllamaService = Depends(get_ollama_service),
) -> HealthResponse:
    """Return overall system health; reports 'degraded' with fix command if Ollama/model unavailable."""
    ollama_info = await ollama_svc.check_health()
    ollama_status = OllamaHealthStatus(**ollama_info)

    emb_loaded = _is_embeddings_loaded()
    tts_available, tts_engine = _detect_tts_status(settings)

    if not ollama_status.reachable:
        return HealthResponse(
            status="degraded",
            ollama=ollama_status,
            embeddings=EmbeddingsHealthStatus(model=settings.embedding_model, loaded=emb_loaded),
            tts=TtsHealthStatus(available=tts_available, engine=tts_engine),
            message="Ollama server is not reachable.",
            hint=ollama_status.hint or "Run: ollama serve",
        )

    if not ollama_status.model_available:
        return HealthResponse(
            status="degraded",
            ollama=ollama_status,
            embeddings=EmbeddingsHealthStatus(model=settings.embedding_model, loaded=emb_loaded),
            tts=TtsHealthStatus(available=tts_available, engine=tts_engine),
            message=f"Model '{settings.ollama_model}' is missing in Ollama.",
            hint=ollama_status.hint or f"Run: ollama pull {settings.ollama_model}",
        )

    return HealthResponse(
        status="ok",
        ollama=ollama_status,
        embeddings=EmbeddingsHealthStatus(model=settings.embedding_model, loaded=emb_loaded),
        tts=TtsHealthStatus(available=tts_available, engine=tts_engine),
        message="All local AI services are ready.",
        hint=None,
    )
