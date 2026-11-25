"""Multiple-choice Quiz Studio generator."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.schemas.studio import QuizOutput
from app.services.ollama_client import OllamaService
from app.services.studio.map_reduce import build_studio_context
from app.services.studio.structured import generate_structured, save_studio_output


async def generate_quiz(
    db: Session,
    *,
    notebook_id: str,
    source_ids: list[str] | None,
    options: dict[str, Any],
    ollama_svc: OllamaService,
    settings: Settings | None = None,
) -> QuizOutput:
    count = max(3, min(15, int(options.get("count", 5) or 5)))
    context, _ = await build_studio_context(
        db,
        notebook_id=notebook_id,
        source_ids=source_ids,
        ollama_svc=ollama_svc,
        focus_instruction="Testable concepts, quantitative facts, and cause-effect relationships.",
        settings=settings,
    )
    result = await generate_structured(
        feature="quiz",
        schema_model=QuizOutput,
        system_prompt=(
            "You create multiple-choice quizzes grounded strictly in the provided sources. "
            "Every question MUST have exactly 4 distinct options and a valid correct_index (0, 1, 2, or 3), "
            "plus a short explanation and source_ref. Return valid JSON matching the schema."
        ),
        user_prompt=(
            f"Source material:\n{context}\n\n"
            f"Generate {count} multiple-choice questions with 4 options each."
        ),
        ollama_svc=ollama_svc,
        settings=settings,
    )
    save_studio_output(
        db,
        notebook_id=notebook_id,
        feature="quiz",
        payload=result.model_dump(),
        source_ids=source_ids,
    )
    return result
