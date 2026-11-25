"""Studio API router (summary, study guide, flashcards, quiz, mindmap, timeline, report, audio)."""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.db.models import Notebook
from app.db.session import get_db
from app.schemas.studio import (
    AudioOverviewResponse,
    FlashcardsOutput,
    MindMapOutput,
    QuizOutput,
    ReportOutput,
    StudioRequest,
    StudioSavedItem,
    StudyGuideOutput,
    SummaryOutput,
    TimelineOutput,
)
from app.services.ollama_client import OllamaService, get_ollama_service
from app.services.studio.audio_overview import generate_audio_overview
from app.services.studio.flashcards import generate_flashcards
from app.services.studio.mindmap import generate_mindmap
from app.services.studio.quiz import generate_quiz
from app.services.studio.report import generate_report
from app.services.studio.structured import list_saved_studio_outputs
from app.services.studio.study_guide import generate_study_guide
from app.services.studio.summary import generate_summary
from app.services.studio.timeline import generate_timeline

router = APIRouter(prefix="/api/studio", tags=["studio"])

_SAFE_AUDIO_RE = re.compile(r"^[A-Za-z0-9_-]+\.wav$")


@router.get("/audio/{file}")
def get_studio_audio(
    file: str,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    if not _SAFE_AUDIO_RE.match(file):
        raise AppError(400, "INVALID_AUDIO_FILENAME", "Invalid audio file name.")
    audio_path = (settings.audio_dir / file).resolve()
    if audio_path.parent != settings.audio_dir.resolve() or not audio_path.exists():
        raise AppError(404, "AUDIO_NOT_FOUND", "Audio file not found.")
    return FileResponse(path=str(audio_path), media_type="audio/wav", filename=file)


@router.get("/{notebook_id}", response_model=list[StudioSavedItem])
def list_studio_outputs(
    notebook_id: str,
    db: Session = Depends(get_db),
) -> list[StudioSavedItem]:
    if db.get(Notebook, notebook_id) is None:
        raise AppError(404, "NOTEBOOK_NOT_FOUND", f"Notebook '{notebook_id}' not found.")
    return list_saved_studio_outputs(db, notebook_id)


@router.post("/summary", response_model=SummaryOutput)
async def studio_summary(
    payload: StudioRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    ollama_svc: OllamaService = Depends(get_ollama_service),
) -> SummaryOutput:
    return await generate_summary(
        db,
        notebook_id=payload.notebook_id,
        source_ids=payload.source_ids,
        ollama_svc=ollama_svc,
        settings=settings,
    )


@router.post("/study-guide", response_model=StudyGuideOutput)
async def studio_study_guide(
    payload: StudioRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    ollama_svc: OllamaService = Depends(get_ollama_service),
) -> StudyGuideOutput:
    return await generate_study_guide(
        db,
        notebook_id=payload.notebook_id,
        source_ids=payload.source_ids,
        ollama_svc=ollama_svc,
        settings=settings,
    )


@router.post("/flashcards", response_model=FlashcardsOutput)
async def studio_flashcards(
    payload: StudioRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    ollama_svc: OllamaService = Depends(get_ollama_service),
) -> FlashcardsOutput:
    return await generate_flashcards(
        db,
        notebook_id=payload.notebook_id,
        source_ids=payload.source_ids,
        options=payload.options,
        ollama_svc=ollama_svc,
        settings=settings,
    )


@router.post("/quiz", response_model=QuizOutput)
async def studio_quiz(
    payload: StudioRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    ollama_svc: OllamaService = Depends(get_ollama_service),
) -> QuizOutput:
    return await generate_quiz(
        db,
        notebook_id=payload.notebook_id,
        source_ids=payload.source_ids,
        options=payload.options,
        ollama_svc=ollama_svc,
        settings=settings,
    )


@router.post("/mindmap", response_model=MindMapOutput)
async def studio_mindmap(
    payload: StudioRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    ollama_svc: OllamaService = Depends(get_ollama_service),
) -> MindMapOutput:
    return await generate_mindmap(
        db,
        notebook_id=payload.notebook_id,
        source_ids=payload.source_ids,
        ollama_svc=ollama_svc,
        settings=settings,
    )


@router.post("/timeline", response_model=TimelineOutput)
async def studio_timeline(
    payload: StudioRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    ollama_svc: OllamaService = Depends(get_ollama_service),
) -> TimelineOutput:
    return await generate_timeline(
        db,
        notebook_id=payload.notebook_id,
        source_ids=payload.source_ids,
        ollama_svc=ollama_svc,
        settings=settings,
    )


@router.post("/report", response_model=ReportOutput)
async def studio_report(
    payload: StudioRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    ollama_svc: OllamaService = Depends(get_ollama_service),
) -> ReportOutput:
    return await generate_report(
        db,
        notebook_id=payload.notebook_id,
        source_ids=payload.source_ids,
        ollama_svc=ollama_svc,
        settings=settings,
    )


@router.post("/audio-overview", response_model=AudioOverviewResponse)
async def studio_audio_overview(
    payload: StudioRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    ollama_svc: OllamaService = Depends(get_ollama_service),
) -> AudioOverviewResponse:
    return await generate_audio_overview(
        db,
        notebook_id=payload.notebook_id,
        source_ids=payload.source_ids,
        ollama_svc=ollama_svc,
        settings=settings,
    )
