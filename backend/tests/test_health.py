"""Tests for GET /api/health across ok and degraded states."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app
from app.services.ollama_client import OllamaService, get_ollama_service


class _FakeOllamaOk(OllamaService):
    async def check_health(self):
        return {
            "base_url": "http://localhost:11434",
            "model": "llama3.2",
            "reachable": True,
            "model_available": True,
            "available_models": ["llama3.2:latest"],
            "hint": None,
        }


class _FakeOllamaDown(OllamaService):
    async def check_health(self):
        return {
            "base_url": "http://localhost:11434",
            "model": "llama3.2",
            "reachable": False,
            "model_available": False,
            "available_models": [],
            "hint": "Run: ollama serve",
        }


class _FakeOllamaMissingModel(OllamaService):
    async def check_health(self):
        return {
            "base_url": "http://localhost:11434",
            "model": "llama3.2",
            "reachable": True,
            "model_available": False,
            "available_models": ["deepseek-coder:latest"],
            "hint": "Run: ollama pull llama3.2",
        }


def test_health_ok() -> None:
    app = create_app()
    app.dependency_overrides[get_ollama_service] = lambda: _FakeOllamaOk()
    client = TestClient(app)
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["ollama"]["reachable"] is True
    assert data["ollama"]["model_available"] is True
    assert data["hint"] is None


def test_health_degraded_ollama_down() -> None:
    app = create_app()
    app.dependency_overrides[get_ollama_service] = lambda: _FakeOllamaDown()
    client = TestClient(app)
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "degraded"
    assert data["ollama"]["reachable"] is False
    assert "ollama serve" in data["hint"]


def test_health_degraded_model_missing() -> None:
    app = create_app()
    app.dependency_overrides[get_ollama_service] = lambda: _FakeOllamaMissingModel()
    client = TestClient(app)
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "degraded"
    assert data["ollama"]["reachable"] is True
    assert data["ollama"]["model_available"] is False
    assert "ollama pull llama3.2" in data["hint"]
