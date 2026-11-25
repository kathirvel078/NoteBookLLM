"""Tests for Studio endpoints, structured output repair retries, timeline grounding, and mindmap depth."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.main import create_app
from app.services import tts as tts_mod
from app.services.ollama_client import OllamaService, get_ollama_service


class _FakeStudioOllama(OllamaService):
    def __init__(self, *, fail_quiz_forever: bool = False) -> None:
        super().__init__()
        self.fail_quiz_forever = fail_quiz_forever
        self.quiz_attempts = 0

    async def chat(
        self, messages, *, temperature=None, num_ctx=None, response_format=None, max_retries=2
    ):
        props = (response_format or {}).get("properties", {})

        # Quiz tests repair retry (first attempt invalid: only 2 options; second attempt valid)
        if "questions" in props and "QuizQuestion" in json.dumps(response_format):
            self.quiz_attempts += 1
            if self.fail_quiz_forever or self.quiz_attempts == 1:
                return json.dumps(
                    {
                        "questions": [
                            {
                                "question": "When did Apollo 11 land?",
                                "options": ["1969", "1972"],  # Invalid: must be 4
                                "correct_index": 0,
                                "explanation": "Apollo 11 landed in 1969.",
                                "source_ref": "history.txt",
                            }
                        ]
                    }
                )
            return json.dumps(
                {
                    "questions": [
                        {
                            "question": "When did Apollo 11 land on the Moon?",
                            "options": ["1965", "1969", "1972", "1975"],
                            "correct_index": 1,
                            "explanation": "Apollo 11 landed in July 1969.",
                            "source_ref": "history.txt",
                        }
                    ]
                }
            )

        if "overview" in props and "key_points" in props:
            return json.dumps(
                {
                    "title": "Space History Overview",
                    "overview": "Key milestones in lunar exploration.",
                    "key_points": ["Sputnik launched in 1957", "Apollo 11 landed in 1969"],
                    "conclusion": "Rapid progress across the 1950s and 1960s.",
                }
            )

        if "key_concepts" in props:
            return json.dumps(
                {
                    "summary": "Core space exploration concepts.",
                    "key_concepts": [
                        {"term": "Apollo 11", "definition": "First crewed Moon landing in 1969."}
                    ],
                    "important_questions": ["What happened in 1969?"],
                    "further_study": ["Lunar orbital mechanics"],
                }
            )

        if "cards" in props:
            return json.dumps(
                {
                    "cards": [
                        {
                            "front": "Year of Sputnik launch",
                            "back": "1957",
                            "source_ref": "history.txt",
                        }
                    ]
                }
            )

        if "root" in props:
            # 5 levels deep -> backend must prune to depth <= 4
            return json.dumps(
                {
                    "root": {
                        "id": "r",
                        "label": "Space",
                        "children": [
                            {
                                "id": "b1",
                                "label": "Missions",
                                "children": [
                                    {
                                        "id": "c1",
                                        "label": "Apollo",
                                        "children": [
                                            {
                                                "id": "d1",
                                                "label": "Apollo 11",
                                                "children": [
                                                    {
                                                        "id": "e1",
                                                        "label": "Too Deep",
                                                        "children": [],
                                                    }
                                                ],
                                            }
                                        ],
                                    }
                                ],
                            }
                        ],
                    }
                }
            )

        if "events" in props:
            # Unsorted + includes hallucinated 2099 date that is NOT in the source
            return json.dumps(
                {
                    "events": [
                        {
                            "date": "2099",
                            "title": "Hallucinated Event",
                            "description": "Not in document.",
                            "source_ref": "history.txt",
                        },
                        {
                            "date": "1969-07-20",
                            "title": "Apollo 11 Landing",
                            "description": "First humans on the Moon.",
                            "source_ref": "history.txt",
                        },
                        {
                            "date": "1957",
                            "title": "Sputnik 1",
                            "description": "First artificial satellite.",
                            "source_ref": "history.txt",
                        },
                    ]
                }
            )

        if "executive_summary" in props:
            return json.dumps(
                {
                    "title": "Lunar Exploration Report",
                    "executive_summary": "Overview of milestones.",
                    "sections": [{"heading": "1960s", "content": "Apollo 11 succeeded in 1969."}],
                    "conclusion": "A landmark decade.",
                }
            )

        if "turns" in props:
            return json.dumps(
                {
                    "title": "Space Race Deep Dive",
                    "turns": [
                        {"speaker": "Host A", "text": "Welcome! Today we look at 1957 and 1969."},
                        {"speaker": "Host B", "text": "Apollo 11 in 1969 changed everything."},
                    ],
                }
            )

        return "{}"


def _mindmap_depth(node: dict) -> int:
    if not node.get("children"):
        return 1
    return 1 + max(_mindmap_depth(c) for c in node["children"])


def test_all_studio_features_and_repair_loop(isolated_env, monkeypatch) -> None:
    fake_ollama = _FakeStudioOllama()
    app = create_app()
    app.dependency_overrides[get_ollama_service] = lambda: fake_ollama
    monkeypatch.setattr(tts_mod, "detect_tts_engine", lambda _cfg=None: None)

    with TestClient(app) as client:
        nb_id = client.post("/api/notebooks", json={"title": "Space Studio"}).json()["id"]
        txt = (
            b"In 1957 Sputnik 1 launched into orbit. "
            b"On July 20, 1969 Apollo 11 landed humans on the Moon."
        )
        up = client.post(
            "/api/sources/upload",
            data={"notebook_id": nb_id},
            files=[("files", ("history.txt", txt, "text/plain"))],
        )
        assert up.status_code == 202

        assert client.post("/api/studio/summary", json={"notebook_id": nb_id}).status_code == 200
        assert client.post("/api/studio/study-guide", json={"notebook_id": nb_id}).status_code == 200
        assert client.post("/api/studio/flashcards", json={"notebook_id": nb_id}).status_code == 200

        # Quiz repairs on 2nd attempt
        quiz_resp = client.post("/api/studio/quiz", json={"notebook_id": nb_id})
        assert quiz_resp.status_code == 200
        assert fake_ollama.quiz_attempts == 2
        assert len(quiz_resp.json()["questions"][0]["options"]) == 4

        # Mindmap pruned to depth <= 4
        mm_resp = client.post("/api/studio/mindmap", json={"notebook_id": nb_id})
        assert mm_resp.status_code == 200
        assert _mindmap_depth(mm_resp.json()["root"]) <= 4

        # Timeline removes hallucinated 2099 & sorts 1957 before 1969-07-20
        tl_resp = client.post("/api/studio/timeline", json={"notebook_id": nb_id})
        assert tl_resp.status_code == 200
        dates = [e["date"] for e in tl_resp.json()["events"]]
        assert dates == ["1957", "1969-07-20"]

        assert client.post("/api/studio/report", json={"notebook_id": nb_id}).status_code == 200

        audio_resp = client.post("/api/studio/audio-overview", json={"notebook_id": nb_id})
        assert audio_resp.status_code == 200
        assert audio_resp.json()["audio_url"] is None
        assert audio_resp.json()["tts_available"] is False

        # All 8 persisted outputs load from SQLite
        saved = client.get(f"/api/studio/{nb_id}").json()
        assert len(saved) == 8


def test_studio_returns_422_when_repair_exhausted(isolated_env) -> None:
    fake_ollama = _FakeStudioOllama(fail_quiz_forever=True)
    app = create_app()
    app.dependency_overrides[get_ollama_service] = lambda: fake_ollama

    with TestClient(app) as client:
        nb_id = client.post("/api/notebooks", json={"title": "Fail Repair"}).json()["id"]
        client.post(
            "/api/sources/upload",
            data={"notebook_id": nb_id},
            files=[("files", ("doc.txt", b"Some text about 1969.", "text/plain"))],
        )
        resp = client.post("/api/studio/quiz", json={"notebook_id": nb_id})
        assert resp.status_code == 422
        assert resp.json()["error"]["code"] == "STRUCTURED_OUTPUT_INVALID"
        assert fake_ollama.quiz_attempts == 3  # initial + 2 repair attempts
