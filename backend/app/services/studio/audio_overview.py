"""Audio Overview Studio generator (conversational script + optional local TTS)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.schemas.studio import AudioOverviewResponse, AudioScriptOutput
from app.services.ollama_client import OllamaService
from app.services.studio.map_reduce import build_studio_context
from app.services.studio.structured import generate_structured, save_studio_output
from app.services.tts import synthesize_audio_overview


async def generate_audio_overview(
    db: Session,
    *,
    notebook_id: str,
    source_ids: list[str] | None,
    ollama_svc: OllamaService,
    settings: Settings | None = None,
) -> AudioOverviewResponse:
    context, _ = await build_studio_context(
        db,
        notebook_id=notebook_id,
        source_ids=source_ids,
        ollama_svc=ollama_svc,
        focus_instruction="Main insights, interesting facts, and takeaways for a two-host discussion.",
        settings=settings,
    )
    script = await generate_structured(
        feature="audio_overview",
        schema_model=AudioScriptOutput,
        system_prompt=(
            "You write engaging, accurate two-host podcast scripts ('Host A' and 'Host B') "
            "strictly grounded in the provided sources. Keep turns natural and concise (8-12 turns). "
            "Return valid JSON matching the schema."
        ),
        user_prompt=(
            f"Source material:\n{context}\n\n"
            "Write a conversational audio overview script alternating between Host A and Host B."
        ),
        ollama_svc=ollama_svc,
        settings=settings,
    )

    filename, tts_available, tts_engine, tts_message = await synthesize_audio_overview(
        notebook_id=notebook_id,
        turns=script.turns,
        settings=settings,
    )
    response = AudioOverviewResponse(
        title=script.title,
        turns=script.turns,
        audio_url=f"/api/studio/audio/{filename}" if filename else None,
        tts_available=tts_available,
        tts_engine=tts_engine,
        tts_message=tts_message,
    )
    save_studio_output(
        db,
        notebook_id=notebook_id,
        feature="audio_overview",
        payload=response.model_dump(),
        source_ids=source_ids,
    )
    return response
