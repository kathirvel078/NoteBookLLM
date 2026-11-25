"""Shared pytest fixtures with isolated temp data directory and mocked/fast embeddings."""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.db.session import get_engine, get_session_factory, init_db
from app.main import create_app
from app.services import embeddings as emb_mod
from app.services import vectorstore as vs_mod


class DeterministicFakeEmbedder:
    """Fast, deterministic 16-d normalized embeddings for unit/integration tests."""

    is_loaded = True
    active_model_name = "fake-test-embedder"

    @staticmethod
    def _vec(text: str) -> list[float]:
        # Deterministic bag-of-words + trigram projection (384-d) so unrelated texts stay orthogonal
        dims = 384
        vec = [0.0] * dims
        lowered = text.lower()
        tokens = lowered.split()
        for tok in tokens:
            h = int(hashlib.md5(tok.encode("utf-8")).hexdigest(), 16)
            vec[h % dims] += 1.0
        for i in range(max(0, len(lowered) - 2)):
            tri = lowered[i : i + 3]
            h = int(hashlib.md5(tri.encode("utf-8")).hexdigest(), 16)
            vec[h % dims] += 0.35
        norm = sum(x * x for x in vec) ** 0.5
        if norm == 0:
            vec[0] = 1.0
            return vec
        return [x / norm for x in vec]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._vec(t) for t in texts]

    def embed_query(self, query: str) -> list[float]:
        return self._vec(query)


@pytest.fixture()
def isolated_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Isolate DATA_DIR, SQLite engine, Chroma singleton, and use deterministic embeddings."""
    data_dir = tmp_path / "data"
    monkeypatch.setenv("DATA_DIR", str(data_dir))
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://localhost:11434")
    monkeypatch.setenv("OLLAMA_MODEL", "llama3.2")

    get_settings.cache_clear()
    get_session_factory.cache_clear()
    get_engine.cache_clear()
    vs_mod._vector_store = None

    fake_emb = DeterministicFakeEmbedder()
    monkeypatch.setattr(emb_mod, "_singleton_service", fake_emb)
    monkeypatch.setattr("app.services.ingestion.get_embedding_service", lambda: fake_emb)

    init_db()
    yield data_dir

    # Clean up SQLite engine handles on Windows before tmp_path cleanup
    try:
        get_engine().dispose()
    except Exception:
        pass
    vs_mod._vector_store = None
    get_session_factory.cache_clear()
    get_engine.cache_clear()
    get_settings.cache_clear()


@pytest.fixture()
def client(isolated_env: Path) -> TestClient:
    app = create_app()
    with TestClient(app) as tc:
        yield tc
