"""Chat router: non-streaming RAG, SSE streaming over POST, history, and clear."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.schemas.chat import ChatMessageRead, ChatRequest, ChatResponse
from app.services.ollama_client import OllamaService, get_ollama_service
from app.services.rag import (
    clear_chat_history,
    get_chat_history,
    run_chat,
    stream_chat_events,
)

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat_endpoint(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    ollama_svc: OllamaService = Depends(get_ollama_service),
) -> ChatResponse:
    return await run_chat(
        db,
        notebook_id=payload.notebook_id,
        message=payload.message,
        source_ids=payload.source_ids,
        ollama_svc=ollama_svc,
        settings=settings,
    )


@router.post("/stream")
async def chat_stream_endpoint(
    payload: ChatRequest,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    ollama_svc: OllamaService = Depends(get_ollama_service),
) -> StreamingResponse:
    async def _generator():
        async for chunk in stream_chat_events(
            db,
            notebook_id=payload.notebook_id,
            message=payload.message,
            source_ids=payload.source_ids,
            ollama_svc=ollama_svc,
            settings=settings,
        ):
            if await request.is_disconnected():
                break
            yield chunk

    return StreamingResponse(
        _generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/history/{notebook_id}", response_model=list[ChatMessageRead])
def chat_history_endpoint(
    notebook_id: str,
    db: Session = Depends(get_db),
) -> list[ChatMessageRead]:
    return get_chat_history(db, notebook_id)


@router.delete("/{notebook_id}", status_code=status.HTTP_204_NO_CONTENT)
def clear_chat_endpoint(
    notebook_id: str,
    db: Session = Depends(get_db),
) -> Response:
    clear_chat_history(db, notebook_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
