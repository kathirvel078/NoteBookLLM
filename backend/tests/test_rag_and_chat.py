"""Tests for retrieval, source selection, citation parsing, non-streaming and streaming chat."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

import pymupdf as fitz
from fastapi.testclient import TestClient

from app.main import create_app
from app.schemas.chat import Citation
from app.services.ollama_client import OllamaService, get_ollama_service
from app.services.rag import NO_RELEVANT_INFO_MSG, ensure_grounded_citations


def _make_pdf_bytes(pages: list[str]) -> bytes:
    doc = fitz.open()
    for text in pages:
        page = doc.new_page()
        page.insert_text((72, 72), text)
    data = doc.tobytes()
    doc.close()
    return data


class _FakeRagOllama(OllamaService):
    def __init__(self) -> None:
        super().__init__()
        self.calls: list[dict] = []

    async def chat(
        self, messages, *, temperature=None, num_ctx=None, response_format=None, max_retries=2
    ):
        self.calls.append({"messages": messages, "response_format": response_format})
        sys_msg = messages[0]["content"]
        user_msg = messages[-1]["content"]
        if "Rewrite the user's latest question" in sys_msg:
            if "xyzzy" in user_msg:
                return "xyzzy qqqzxv zzzqqq"
            return "Olympus Mons height on Mars"
        if "Generate 3 concise follow-up questions" in sys_msg:
            return json.dumps(
                {
                    "questions": [
                        "What are Saturn rings made of?",
                        "How tall is Olympus Mons?",
                    ]
                }
            )
        # Normal RAG answer with one valid citation [1] and one bogus [99]
        return "Olympus Mons is the tallest volcano on Mars [1]. Extra hallucinated ref [99]."

    async def chat_stream(self, messages, *, temperature=None, num_ctx=None) -> AsyncIterator[str]:
        self.calls.append({"messages": messages, "stream": True})
        for tok in ["Saturn rings ", "contain water ice [1] ", "and dust [42]."]:
            yield tok


def test_missing_model_markers_receive_grounded_source_fallback() -> None:
    citation = Citation(
        index=1,
        source_id="source-1",
        filename="atlas.txt",
        snippet="Project Atlas launched in 2025.",
        score=0.9,
    )
    answer, used = ensure_grounded_citations(
        "Project Atlas launched in 2025.", [], [citation]
    )
    assert answer.endswith("Sources: [1]")
    assert used == [citation]


def test_rag_chat_citations_history_and_streaming(isolated_env) -> None:
    fake_ollama = _FakeRagOllama()
    app = create_app()
    app.dependency_overrides[get_ollama_service] = lambda: fake_ollama

    with TestClient(app) as client:
        nb_id = client.post("/api/notebooks", json={"title": "Astronomy"}).json()["id"]

        pdf_mars = _make_pdf_bytes(
            ["Olympus Mons on Mars is the tallest planetary volcano in the solar system."]
        )
        pdf_saturn = _make_pdf_bytes(
            ["Saturn has prominent rings composed mainly of water ice and rocky debris."]
        )
        up = client.post(
            "/api/sources/upload",
            data={"notebook_id": nb_id},
            files=[
                ("files", ("mars.pdf", pdf_mars, "application/pdf")),
                ("files", ("saturn.pdf", pdf_saturn, "application/pdf")),
            ],
        )
        assert up.status_code == 202
        mars_id = up.json()["uploaded"][0]["id"]
        saturn_id = up.json()["uploaded"][1]["id"]

        # 1. Non-streaming chat scoped to Mars source
        resp = client.post(
            "/api/chat",
            json={
                "notebook_id": nb_id,
                "message": "What is Olympus Mons on Mars?",
                "source_ids": [mars_id],
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "[1]" in body["answer"]
        assert "[99]" not in body["answer"]
        assert len(body["citations"]) == 1
        assert body["citations"][0]["source_id"] == mars_id
        assert body["citations"][0]["page_start"] == 1
        assert len(body["suggested_questions"]) == 2

        # 2. Out-of-scope query below similarity threshold returns honest fallback
        unrelated = client.post(
            "/api/chat",
            json={
                "notebook_id": nb_id,
                "message": "xyzzy qqqzxv zzzqqq",
                "source_ids": [mars_id],
            },
        )
        assert unrelated.status_code == 200
        assert unrelated.json()["answer"] == NO_RELEVANT_INFO_MSG
        assert unrelated.json()["citations"] == []

        # 3. Streaming chat scoped to Saturn source; history exists so query rewrite runs too
        with client.stream(
            "POST",
            "/api/chat/stream",
            json={
                "notebook_id": nb_id,
                "message": "Tell me about its rings and water ice",
                "source_ids": [saturn_id],
            },
        ) as stream_resp:
            assert stream_resp.status_code == 200
            raw_sse = "".join(stream_resp.iter_text())

        assert "event: sources" in raw_sse
        assert "event: token" in raw_sse
        assert "event: done" in raw_sse
        # Invalid [42] stripped in persisted done payload
        done_line = [ln for ln in raw_sse.splitlines() if ln.startswith("data: ")][-1]
        done_data = json.loads(done_line.removeprefix("data: "))
        assert "[42]" not in done_data["answer"]
        assert len(done_data["citations"]) == 1
        assert done_data["citations"][0]["source_id"] == saturn_id

        # 4. History & clear chat
        hist = client.get(f"/api/chat/history/{nb_id}").json()
        assert len(hist) == 6  # 3 user + 3 assistant messages
        clr = client.delete(f"/api/chat/{nb_id}")
        assert clr.status_code == 204
        assert client.get(f"/api/chat/history/{nb_id}").json() == []
