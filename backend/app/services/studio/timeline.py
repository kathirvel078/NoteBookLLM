"""Timeline Studio generator (grounded dates only, sorted chronologically)."""

from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.schemas.studio import TimelineEvent, TimelineOutput
from app.services.ollama_client import OllamaService
from app.services.studio.map_reduce import build_studio_context
from app.services.studio.structured import generate_structured, save_studio_output

_MONTHS = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}


def _date_present_in_corpus(date_str: str, corpus_lower: str) -> bool:
    cleaned = date_str.strip().lower()
    if not cleaned:
        return False
    if cleaned in corpus_lower:
        return True
    years = re.findall(r"\b\d{4}\b", cleaned)
    if years:
        return all(y in corpus_lower for y in years)
    tokens = [t for t in re.findall(r"[a-z0-9]+", cleaned) if len(t) >= 3]
    return bool(tokens) and any(t in corpus_lower for t in tokens)


def _chronological_key(date_str: str) -> tuple[int, int, int, str]:
    s = date_str.strip().lower()
    iso = re.search(r"\b(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?\b", s)
    year = int(iso.group(1)) if iso else 9999
    month = int(iso.group(2)) if (iso and iso.group(2)) else 0
    day = int(iso.group(3)) if (iso and iso.group(3)) else 0

    if month == 0:
        for name, m_num in _MONTHS.items():
            if re.search(rf"\b{name}\b", s):
                month = m_num
                break
    if day == 0 and month > 0:
        day_match = re.search(r"\b([12]?\d|3[01])\b", s)
        if day_match:
            val = int(day_match.group(1))
            if 1 <= val <= 31:
                day = val
    return (year, month, day, s)


def ground_and_sort_timeline(events: list[TimelineEvent], corpus_text: str) -> list[TimelineEvent]:
    """Filter out events whose dates do not appear in the sources and sort chronologically."""
    corpus_lower = corpus_text.lower()
    grounded = [ev for ev in events if _date_present_in_corpus(ev.date, corpus_lower)]
    grounded.sort(key=lambda ev: _chronological_key(ev.date))
    return grounded


async def generate_timeline(
    db: Session,
    *,
    notebook_id: str,
    source_ids: list[str] | None,
    ollama_svc: OllamaService,
    settings: Settings | None = None,
) -> TimelineOutput:
    context, corpus_text = await build_studio_context(
        db,
        notebook_id=notebook_id,
        source_ids=source_ids,
        ollama_svc=ollama_svc,
        focus_instruction="Dates, years, historical milestones, and chronological events.",
        settings=settings,
    )
    raw = await generate_structured(
        feature="timeline",
        schema_model=TimelineOutput,
        system_prompt=(
            "You extract a chronological timeline strictly from the provided sources. "
            "ONLY include events with dates explicitly mentioned in the sources. "
            "Never invent or estimate dates. Return valid JSON matching the schema."
        ),
        user_prompt=(
            f"Source material:\n{context}\n\n"
            "Extract dated events in chronological order with date, title, description, and source_ref."
        ),
        ollama_svc=ollama_svc,
        settings=settings,
    )
    filtered = ground_and_sort_timeline(raw.events, corpus_text)
    result = TimelineOutput(events=filtered)
    save_studio_output(
        db,
        notebook_id=notebook_id,
        feature="timeline",
        payload=result.model_dump(),
        source_ids=source_ids,
    )
    return result
