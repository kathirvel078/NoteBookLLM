"""Structured logging with request ID correlation."""

from __future__ import annotations

import json
import logging
from contextvars import ContextVar
from datetime import datetime, timezone

request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


class RequestIdFilter(logging.Filter):
    """Inject the current request ID into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get()
        return True


class JsonFormatter(logging.Formatter):
    """Compact structured JSON log formatter."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "request_id": getattr(record, "request_id", "-"),
            "msg": record.getMessage(),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(level: str = "INFO") -> None:
    """Configure root logging with request ID context."""
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    root.handlers.clear()

    handler = logging.StreamHandler()
    handler.addFilter(RequestIdFilter())
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)

    # Reduce noisy third-party loggers
    for noisy in ("chromadb", "sentence_transformers", "httpx", "httpx2", "huggingface_hub", "urllib3"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
