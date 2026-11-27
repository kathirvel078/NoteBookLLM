"""Sources upload, listing, and deletion router."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.db.models import Notebook, Source
from app.db.session import get_db
from app.schemas.sources import SourceRead, SourceUploadResponse
from app.services.ingestion import (
    delete_source_and_artifacts,
    process_source_ingestion,
    stage_source_upload,
)

router = APIRouter(prefix="/api/sources", tags=["sources"])


def _to_source_read(src: Source) -> SourceRead:
    return SourceRead(
        id=src.id,
        notebook_id=src.notebook_id,
        filename=src.filename,
        file_type=src.file_type,
        size_bytes=src.size_bytes,
        sha256=src.sha256,
        status=src.status,  # type: ignore[arg-type]
        error_message=src.error_message,
        warning_message=src.warning_message,
        page_count=src.page_count,
        chunk_count=src.chunk_count,
        created_at=src.created_at,
    )


@router.post("/upload", response_model=SourceUploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_sources(
    background_tasks: BackgroundTasks,
    notebook_id: str = Form(...),
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> SourceUploadResponse:
    if not files:
        raise AppError(400, "NO_FILES", "At least one file must be provided.")
    if len(files) > settings.max_files_per_upload:
        raise AppError(
            400,
            "TOO_MANY_FILES",
            f"Maximum {settings.max_files_per_upload} files allowed per upload request.",
        )

    staged: list[Source] = []
    try:
        for upload in files:
            src = await stage_source_upload(db, notebook_id=notebook_id, upload=upload, settings=settings)
            staged.append(src)
    except Exception:
        for partial in staged:
            delete_source_and_artifacts(db, partial)
        raise

    for src in staged:
        background_tasks.add_task(process_source_ingestion, src.id)

    return SourceUploadResponse(uploaded=[_to_source_read(s) for s in staged])


@router.get("/{notebook_id}", response_model=list[SourceRead])
def list_sources(notebook_id: str, db: Session = Depends(get_db)) -> list[SourceRead]:
    if db.get(Notebook, notebook_id) is None:
        raise AppError(404, "NOTEBOOK_NOT_FOUND", f"Notebook '{notebook_id}' not found.")
    rows = db.scalars(
        select(Source).where(Source.notebook_id == notebook_id).order_by(Source.created_at.desc())
    ).all()
    return [_to_source_read(r) for r in rows]


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_source(source_id: str, db: Session = Depends(get_db)) -> Response:
    src = db.get(Source, source_id)
    if src is None:
        raise AppError(404, "SOURCE_NOT_FOUND", f"Source '{source_id}' not found.")
    delete_source_and_artifacts(db, src)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
