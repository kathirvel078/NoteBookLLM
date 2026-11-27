"""Additional audit tests for notebook CRUD, upload limits/rollback, Ollama respx errors, and map-reduce."""

from __future__ import annotations

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.core.errors import ModelNotFoundError, OllamaUnavailableError
from app.services.extractors import sanitize_filename
from app.services.ollama_client import OllamaService
from app.services.studio.map_reduce import build_studio_context


def test_notebook_rename_and_validation(client: TestClient) -> None:
    created = client.post("/api/notebooks", json={"title": "Initial Title"})
    assert created.status_code == 201
    nb_id = created.json()["id"]

    renamed = client.patch(f"/api/notebooks/{nb_id}", json={"title": "Renamed Title"})
    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Renamed Title"

    blank = client.patch(f"/api/notebooks/{nb_id}", json={"title": "   "})
    assert blank.status_code == 422
    assert blank.json()["error"]["code"] == "INVALID_TITLE"

    missing = client.patch("/api/notebooks/nonexistent", json={"title": "Anything"})
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "NOTEBOOK_NOT_FOUND"


def test_upload_limits_sanitization_and_multifile_rollback(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert sanitize_filename("../../etc/passwd") == "passwd"
    assert sanitize_filename("...hidden.txt") == "hidden.txt"

    nb_id = client.post("/api/notebooks", json={"title": "Upload Guards"}).json()["id"]

    # Empty file rejected
    empty_resp = client.post(
        "/api/sources/upload",
        data={"notebook_id": nb_id},
        files=[("files", ("empty.txt", b"", "text/plain"))],
    )
    assert empty_resp.status_code == 400
    assert empty_resp.json()["error"]["code"] == "INVALID_FILE"

    # Multi-file upload where second file is invalid must roll back the first file cleanly
    partial_fail = client.post(
        "/api/sources/upload",
        data={"notebook_id": nb_id},
        files=[
            ("files", ("good.txt", b"Valid text content for local RAG indexing.", "text/plain")),
            ("files", ("spoofed.pdf", b"Not a real PDF", "application/pdf")),
        ],
    )
    assert partial_fail.status_code == 400
    assert client.get(f"/api/sources/{nb_id}").json() == []
    upload_dir = get_settings().uploads_dir / nb_id
    if upload_dir.exists():
        assert list(upload_dir.iterdir()) == []

    # File count limit
    too_many = client.post(
        "/api/sources/upload",
        data={"notebook_id": nb_id},
        files=[
            ("files", (f"f{i}.txt", f"Document {i} text content.".encode(), "text/plain"))
            for i in range(11)
        ],
    )
    assert too_many.status_code == 400
    assert too_many.json()["error"]["code"] == "TOO_MANY_FILES"

    # File size limit (413)
    monkeypatch.setattr(get_settings(), "max_upload_mb", 0)
    oversize = client.post(
        "/api/sources/upload",
        data={"notebook_id": nb_id},
        files=[("files", ("big.txt", b"Too big", "text/plain"))],
    )
    assert oversize.status_code == 413
    assert oversize.json()["error"]["code"] == "FILE_TOO_LARGE"


@pytest.mark.asyncio
async def test_ollama_service_respx_health_retries_and_errors() -> None:
    cfg = Settings(ollama_base_url="http://127.0.0.1:19999", ollama_model="llama3.2")
    svc = OllamaService(settings=cfg)

    with respx.mock(base_url="http://127.0.0.1:19999") as mock:
        mock.get("/api/tags").mock(
            return_value=httpx.Response(200, json={"models": [{"model": "llama3.2:latest"}]})
        )
        ok = await svc.check_health()
        assert ok["reachable"] is True
        assert ok["model_available"] is True

    with respx.mock(base_url="http://127.0.0.1:19999") as mock:
        mock.get("/api/tags").mock(
            return_value=httpx.Response(200, json={"models": [{"model": "mistral:latest"}]})
        )
        missing = await svc.check_health()
        assert missing["reachable"] is True
        assert missing["model_available"] is False
        assert "ollama pull llama3.2" in (missing["hint"] or "")

    with respx.mock(base_url="http://127.0.0.1:19999") as mock:
        mock.get("/api/tags").mock(side_effect=httpx.ConnectError("connection refused"))
        down = await svc.check_health()
        assert down["reachable"] is False
        assert down["hint"] == "Run: ollama serve"

    # Chat retries once on transient ConnectError then succeeds
    with respx.mock(base_url="http://127.0.0.1:19999") as mock:
        route = mock.post("/api/chat").mock(
            side_effect=[
                httpx.ConnectError("transient"),
                httpx.Response(200, json={"message": {"role": "assistant", "content": "OK"}}),
            ]
        )
        reply = await svc.chat([{"role": "user", "content": "hi"}], max_retries=1)
        assert reply == "OK"
        assert route.call_count == 2

    # Persistent ConnectError raises OllamaUnavailableError (503)
    with respx.mock(base_url="http://127.0.0.1:19999") as mock:
        mock.post("/api/chat").mock(side_effect=httpx.ConnectError("refused"))
        with pytest.raises(OllamaUnavailableError) as exc_info:
            await svc.chat([{"role": "user", "content": "hi"}], max_retries=0)
        assert exc_info.value.status_code == 503
        assert exc_info.value.code == "OLLAMA_UNAVAILABLE"

    # 404 model missing raises ModelNotFoundError (503)
    with respx.mock(base_url="http://127.0.0.1:19999") as mock:
        mock.post("/api/chat").mock(
            return_value=httpx.Response(404, json={"error": "model 'llama3.2' not found"})
        )
        with pytest.raises(ModelNotFoundError) as model_exc:
            await svc.chat([{"role": "user", "content": "hi"}], max_retries=0)
        assert model_exc.value.status_code == 503
        assert model_exc.value.code == "MODEL_NOT_FOUND"


class _FakeMapReduceOllama(OllamaService):
    def __init__(self) -> None:
        super().__init__()
        self.map_calls = 0

    async def chat(
        self, messages, *, temperature=None, num_ctx=None, response_format=None, max_retries=2
    ):
        self.map_calls += 1
        return f"- Key point extracted in map call {self.map_calls}"


@pytest.mark.asyncio
async def test_map_reduce_triggers_batches_on_large_corpus(client: TestClient) -> None:
    nb_id = client.post("/api/notebooks", json={"title": "Large Doc"}).json()["id"]
    # > 10000 distinct chars guarantees multiple chunks exceeding the 5000-char direct threshold
    big_text = "".join(
        f"Topic {i}: Distributed consensus protocols, Raft leader election, and term {i} replication. "
        for i in range(180)
    ).encode()
    up = client.post(
        "/api/sources/upload",
        data={"notebook_id": nb_id},
        files=[("files", ("raft.txt", big_text, "text/plain"))],
    )
    assert up.status_code == 202

    from app.db.session import get_session_factory

    fake_ollama = _FakeMapReduceOllama()
    with get_session_factory()() as db:
        reduced, full_corpus = await build_studio_context(
            db,
            notebook_id=nb_id,
            source_ids=None,
            ollama_svc=fake_ollama,
            focus_instruction="Extract core Raft consensus concepts.",
        )
    assert fake_ollama.map_calls >= 2
    assert "Batch 1 Notes:" in reduced
    assert len(full_corpus) > 5000
