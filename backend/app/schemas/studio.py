"""Pydantic schemas for all Studio features (requests, structured outputs, persistence)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class StudioRequest(BaseModel):
    notebook_id: str
    source_ids: list[str] | None = None
    options: dict[str, Any] = Field(default_factory=dict)


class SummaryOutput(BaseModel):
    title: str
    overview: str
    key_points: list[str]
    conclusion: str


class KeyConcept(BaseModel):
    term: str
    definition: str


class StudyGuideOutput(BaseModel):
    summary: str
    key_concepts: list[KeyConcept]
    important_questions: list[str]
    further_study: list[str]


class FlashcardItem(BaseModel):
    front: str
    back: str
    source_ref: str


class FlashcardsOutput(BaseModel):
    cards: list[FlashcardItem]


class QuizQuestion(BaseModel):
    question: str
    options: list[str]
    correct_index: int
    explanation: str
    source_ref: str

    @field_validator("options")
    @classmethod
    def check_four_options(cls, v: list[str]) -> list[str]:
        cleaned = [opt.strip() for opt in v if opt.strip()]
        if len(cleaned) != 4:
            raise ValueError(f"Quiz question must have exactly 4 options, got {len(cleaned)}.")
        return cleaned

    @field_validator("correct_index")
    @classmethod
    def check_valid_index(cls, v: int) -> int:
        if v < 0 or v > 3:
            raise ValueError(f"correct_index must be 0..3, got {v}.")
        return v


class QuizOutput(BaseModel):
    questions: list[QuizQuestion]


class MindMapNode(BaseModel):
    id: str
    label: str
    children: list[MindMapNode] = Field(default_factory=list)


MindMapNode.model_rebuild()


class MindMapOutput(BaseModel):
    root: MindMapNode


class TimelineEvent(BaseModel):
    date: str
    title: str
    description: str
    source_ref: str


class TimelineOutput(BaseModel):
    events: list[TimelineEvent]


class ReportSection(BaseModel):
    heading: str
    content: str


class ReportOutput(BaseModel):
    title: str
    executive_summary: str
    sections: list[ReportSection]
    conclusion: str


class AudioTurn(BaseModel):
    speaker: Literal["Host A", "Host B"]
    text: str


class AudioScriptOutput(BaseModel):
    title: str
    turns: list[AudioTurn]


class AudioOverviewResponse(BaseModel):
    title: str
    turns: list[AudioTurn]
    audio_url: str | None = None
    tts_available: bool = False
    tts_engine: str | None = None
    tts_message: str | None = None


class StudioSavedItem(BaseModel):
    feature: str
    payload: dict[str, Any]
    source_ids: list[str] | None = None
    updated_at: datetime
