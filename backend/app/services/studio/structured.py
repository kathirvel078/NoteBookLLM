"""Structured JSON generation with Pydantic validation, repair retries, and SQLite persistence."""

from __future__ import annotations

import json
import re
from typing import TypeVar

from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.errors import StructuredOutputError
from app.core.logging import get_logger
from app.db.models import StudioOutput
from app.schemas.studio import StudioSavedItem
from app.services.ollama_client import OllamaService

logger = get_logger(__name__)

TModel = TypeVar("TModel", bound=BaseModel)


def _strip_json_fences(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


async def generate_structured(
    *,
    feature: str,
    schema_model: type[TModel],
    system_prompt: str,
    user_prompt: str,
    ollama_svc: OllamaService,
    settings: Settings | None = None,
    max_repairs: int = 2,
) -> TModel:
    """Call Ollama with JSON schema format and retry up to 2 times with repair prompts."""
    cfg = settings or get_settings()
    json_schema = schema_model.model_json_schema()

    messages: list[dict[str, str]] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    last_error = "Unknown validation error"
    for attempt in range(max_repairs + 1):
        raw = await ollama_svc.chat(
            messages,
            temperature=cfg.ollama_studio_temperature,
            num_ctx=cfg.ollama_num_ctx,
            response_format=json_schema,
        )
        cleaned = _strip_json_fences(raw)
        try:
            return schema_model.model_validate_json(cleaned)
        except (ValidationError, ValueError) as exc:
            last_error = str(exc)
            logger.warning(
                "Structured output validation failed for %s (attempt %d/%d): %s",
                feature,
                attempt + 1,
                max_repairs + 1,
                last_error[:300],
            )
            if attempt < max_repairs:
                messages.append({"role": "assistant", "content": cleaned[:1500]})
                messages.append(
                    {
                        "role": "user",
                        "content": (
                            f"Your JSON failed schema validation with error:\n{last_error[:600]}\n\n"
                            "Fix the JSON and return ONLY valid JSON matching the required schema."
                        ),
                    }
                )

    raise StructuredOutputError(feature, last_error)


def save_studio_output(
    db: Session,
    *,
    notebook_id: str,
    feature: str,
    payload: dict,
    source_ids: list[str] | None,
) -> StudioOutput:
    existing = db.scalar(
        select(StudioOutput).where(
            StudioOutput.notebook_id == notebook_id,
            StudioOutput.feature == feature,
        )
    )
    payload_str = json.dumps(payload, ensure_ascii=False)
    source_ids_str = json.dumps(source_ids) if source_ids is not None else None
    if existing is not None:
        existing.payload_json = payload_str
        existing.source_ids_json = source_ids_str
        db.commit()
        db.refresh(existing)
        return existing

    row = StudioOutput(
        notebook_id=notebook_id,
        feature=feature,
        payload_json=payload_str,
        source_ids_json=source_ids_str,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_saved_studio_outputs(db: Session, notebook_id: str) -> list[StudioSavedItem]:
    rows = db.scalars(
        select(StudioOutput)
        .where(StudioOutput.notebook_id == notebook_id)
        .order_by(StudioOutput.updated_at.desc())
    ).all()
    return [
        StudioSavedItem(
            feature=r.feature,
            payload=json.loads(r.payload_json),
            source_ids=json.loads(r.source_ids_json) if r.source_ids_json else None,
            updated_at=r.updated_at,
        )
        for r in rows
    ]
