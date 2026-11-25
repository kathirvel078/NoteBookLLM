"""Lazy singleton local embedding service using sentence-transformers."""

from __future__ import annotations

import threading
from typing import Any

from app.core.config import Settings, get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "


class EmbeddingService:
    """Thread-safe lazy loader for local HuggingFace sentence-transformers."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._model: Any = None
        self._active_model_name: str = self.settings.embedding_model
        self._lock = threading.Lock()

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    @property
    def active_model_name(self) -> str:
        return self._active_model_name

    def _ensure_model(self) -> Any:
        if self._model is not None:
            return self._model
        with self._lock:
            if self._model is not None:
                return self._model
            from sentence_transformers import SentenceTransformer

            primary = self.settings.embedding_model
            fallback = self.settings.embedding_fallback_model
            try:
                logger.info("Loading embedding model: %s", primary)
                self._model = SentenceTransformer(primary)
                self._active_model_name = primary
            except Exception as exc:
                logger.warning(
                    "Could not load primary embedding model %s (%s); falling back to %s",
                    primary,
                    exc,
                    fallback,
                )
                self._model = SentenceTransformer(fallback)
                self._active_model_name = fallback
            return self._model

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed document chunks in batches with L2 normalization."""
        if not texts:
            return []
        model = self._ensure_model()
        vectors = model.encode(
            texts,
            batch_size=self.settings.embedding_batch_size,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return [vec.tolist() for vec in vectors]

    def embed_query(self, query: str) -> list[float]:
        """Embed a retrieval query, applying the BGE query prefix when using BGE."""
        model = self._ensure_model()
        effective = query.strip()
        if "bge" in self._active_model_name.lower():
            effective = f"{_BGE_QUERY_PREFIX}{effective}"
        vec = model.encode(
            [effective],
            normalize_embeddings=True,
            show_progress_bar=False,
        )[0]
        return vec.tolist()


_singleton_service: EmbeddingService | None = None
_singleton_lock = threading.Lock()


def get_embedding_service() -> EmbeddingService:
    global _singleton_service
    if _singleton_service is None:
        with _singleton_lock:
            if _singleton_service is None:
                _singleton_service = EmbeddingService()
    return _singleton_service


def is_embedding_model_loaded() -> bool:
    return _singleton_service is not None and _singleton_service.is_loaded
