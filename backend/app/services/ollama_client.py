"""Local Ollama AsyncClient wrapper with health check, retries, and structured JSON output."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any

import httpx
import ollama
from ollama import AsyncClient, ResponseError

from app.core.config import Settings, get_settings
from app.core.errors import ModelNotFoundError, OllamaUnavailableError
from app.core.logging import get_logger

logger = get_logger(__name__)


def _model_matches(configured: str, candidate: str) -> bool:
    if not candidate:
        return False
    if candidate == configured:
        return True
    if ":" not in configured:
        return candidate == f"{configured}:latest" or candidate.split(":")[0] == configured
    return False


def _extract_model_name(entry: Any) -> str:
    if isinstance(entry, dict):
        return str(entry.get("model") or entry.get("name") or "")
    return str(getattr(entry, "model", None) or getattr(entry, "name", "") or "")


def _extract_message_content(response: Any) -> str:
    if isinstance(response, dict):
        msg = response.get("message") or {}
        return str(msg.get("content") or "")
    msg = getattr(response, "message", None)
    if msg is None:
        return ""
    return str(getattr(msg, "content", "") or "")


class OllamaService:
    """Thin wrapper around official ollama.AsyncClient."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    def _client(self) -> AsyncClient:
        return AsyncClient(
            host=self.settings.ollama_base_url,
            timeout=self.settings.ollama_timeout_seconds,
        )

    async def check_health(self) -> dict[str, Any]:
        """Inspect Ollama reachability and whether the configured model is pulled."""
        base_url = self.settings.ollama_base_url
        model = self.settings.ollama_model
        try:
            client = AsyncClient(host=base_url, timeout=5.0)
            res = await client.list()
            raw_models = res.get("models", []) if isinstance(res, dict) else getattr(res, "models", [])
            names = [_extract_model_name(m) for m in raw_models if _extract_model_name(m)]
            available = any(_model_matches(model, n) for n in names)
            if not available:
                return {
                    "base_url": base_url,
                    "model": model,
                    "reachable": True,
                    "model_available": False,
                    "available_models": names,
                    "hint": f"Run: ollama pull {model}",
                }
            return {
                "base_url": base_url,
                "model": model,
                "reachable": True,
                "model_available": True,
                "available_models": names,
                "hint": None,
            }
        except (httpx.ConnectError, httpx.TimeoutException, ConnectionError, OSError) as exc:
            logger.warning("Ollama health check failed: %s", exc)
            return {
                "base_url": base_url,
                "model": model,
                "reachable": False,
                "model_available": False,
                "available_models": [],
                "hint": "Run: ollama serve",
            }
        except Exception as exc:
            logger.warning("Unexpected error checking Ollama health: %s", exc)
            return {
                "base_url": base_url,
                "model": model,
                "reachable": False,
                "model_available": False,
                "available_models": [],
                "hint": "Run: ollama serve",
            }

    def _translate_exception(self, exc: Exception) -> Exception:
        if isinstance(exc, ResponseError):
            msg = str(exc).lower()
            if exc.status_code == 404 or "not found" in msg or "pull" in msg:
                return ModelNotFoundError(self.settings.ollama_model)
            return OllamaUnavailableError(str(exc))
        if isinstance(
            exc,
            (
                httpx.ConnectError,
                httpx.ReadTimeout,
                httpx.ConnectTimeout,
                httpx.RemoteProtocolError,
                ConnectionError,
                TimeoutError,
                OSError,
            ),
        ):
            return OllamaUnavailableError(str(exc))
        return exc

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float | None = None,
        num_ctx: int | None = None,
        response_format: dict[str, Any] | str | None = None,
        max_retries: int = 2,
    ) -> str:
        """Run non-streaming chat completion with retries for transient failures."""
        options: dict[str, Any] = {
            "num_ctx": num_ctx or self.settings.ollama_num_ctx,
            "temperature": (
                temperature if temperature is not None else self.settings.ollama_chat_temperature
            ),
        }
        last_exc: Exception | None = None
        for attempt in range(max_retries + 1):
            try:
                client = self._client()
                kwargs: dict[str, Any] = {
                    "model": self.settings.ollama_model,
                    "messages": messages,
                    "stream": False,
                    "options": options,
                }
                if response_format is not None:
                    kwargs["format"] = response_format
                resp = await client.chat(**kwargs)
                return _extract_message_content(resp)
            except ResponseError as exc:
                translated = self._translate_exception(exc)
                if isinstance(translated, ModelNotFoundError):
                    raise translated from exc
                last_exc = translated
            except (
                httpx.ConnectError,
                httpx.TimeoutException,
                httpx.RemoteProtocolError,
                ConnectionError,
                TimeoutError,
                OSError,
            ) as exc:
                last_exc = self._translate_exception(exc)
            if attempt < max_retries:
                await asyncio.sleep(0.5 * (2**attempt))

        assert last_exc is not None
        raise last_exc

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float | None = None,
        num_ctx: int | None = None,
    ) -> AsyncIterator[str]:
        """Yield streamed token deltas from Ollama. Closes cleanly on cancellation."""
        options: dict[str, Any] = {
            "num_ctx": num_ctx or self.settings.ollama_num_ctx,
            "temperature": (
                temperature if temperature is not None else self.settings.ollama_chat_temperature
            ),
        }
        client = self._client()
        stream: Any = None
        try:
            stream = await client.chat(
                model=self.settings.ollama_model,
                messages=messages,
                stream=True,
                options=options,
            )
            async for chunk in stream:
                delta = _extract_message_content(chunk)
                if delta:
                    yield delta
        except asyncio.CancelledError:
            if stream is not None and hasattr(stream, "aclose"):
                await stream.aclose()
            raise
        except Exception as exc:
            raise self._translate_exception(exc) from exc
        finally:
            if stream is not None and hasattr(stream, "aclose"):
                try:
                    await stream.aclose()
                except Exception:
                    pass
            # Close underlying httpx client if exposed
            inner = getattr(client, "_client", None)
            if inner is not None and hasattr(inner, "aclose"):
                try:
                    await inner.aclose()
                except Exception:
                    pass


def get_ollama_service() -> OllamaService:
    return OllamaService()


__all__ = ["OllamaService", "get_ollama_service", "ollama"]
