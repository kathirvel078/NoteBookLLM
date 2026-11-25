"""Consistent application exceptions and global FastAPI error handlers."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.logging import get_logger, request_id_ctx

logger = get_logger(__name__)


class AppError(Exception):
    """Base application exception serialized into a consistent error envelope."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        hint: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.hint = hint


class OllamaUnavailableError(AppError):
    """Raised when local Ollama cannot be reached."""

    def __init__(self, detail: str | None = None) -> None:
        msg = "Local Ollama server is unreachable."
        if detail:
            msg = f"{msg} ({detail})"
        super().__init__(
            status_code=503,
            code="OLLAMA_UNAVAILABLE",
            message=msg,
            hint="Run: ollama serve",
        )


class ModelNotFoundError(AppError):
    """Raised when the configured Ollama model has not been pulled."""

    def __init__(self, model: str) -> None:
        super().__init__(
            status_code=503,
            code="MODEL_NOT_FOUND",
            message=f"Ollama model '{model}' is not installed locally.",
            hint=f"Run: ollama pull {model}",
        )


class StructuredOutputError(AppError):
    """Raised when the model fails to produce schema-valid JSON after retries."""

    def __init__(self, feature: str, detail: str) -> None:
        super().__init__(
            status_code=422,
            code="STRUCTURED_OUTPUT_INVALID",
            message=f"Failed to generate valid structured output for {feature}: {detail}",
            hint="Try regenerating or selecting fewer/clearer source documents.",
        )


def error_envelope(
    code: str,
    message: str,
    hint: str | None = None,
    details: Any | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "error": {
            "code": code,
            "message": message,
            "request_id": request_id_ctx.get(),
        }
    }
    if hint:
        body["error"]["hint"] = hint
    if details is not None:
        body["error"]["details"] = details
    return body


def register_exception_handlers(app: FastAPI) -> None:
    """Attach consistent exception handlers to the FastAPI instance."""

    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_envelope(exc.code, exc.message, exc.hint),
        )

    @app.exception_handler(HTTPException)
    async def handle_http_exception(_: Request, exc: HTTPException) -> JSONResponse:
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        return JSONResponse(
            status_code=exc.status_code,
            content=error_envelope(f"HTTP_{exc.status_code}", detail),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=error_envelope(
                "VALIDATION_ERROR",
                "Request validation failed.",
                details=exc.errors(),
            ),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error during request: %s", exc)
        return JSONResponse(
            status_code=500,
            content=error_envelope(
                "INTERNAL_SERVER_ERROR",
                "An unexpected server error occurred.",
                hint="Check backend logs with the request_id for details.",
            ),
        )
