"""Document ingestion pipeline: extract -> chunk -> embed -> store in ChromaDB."""

from __future__ import annotations

import hashlib
import shutil
import uuid
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.core.logging import get_logger
from app.db.models import Notebook, Source
from app.db.session import get_session_factory
from app.services.chunking import chunk_segments
from app.services.embeddings import get_embedding_service
from app.services.extractors import (
    detect_and_validate_file,
    extract_document,
    sanitize_filename,
)
from app.services.vectorstore import get_vector_store

logger = get_logger(__name__)


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


async def stage_source_upload(
    db: Session,
    *,
    notebook_id: str,
    upload: UploadFile,
    settings: Settings | None = None,
) -> Source:
    """Validate upload (size, ext, magic bytes, dedup), save to disk, and create Source row."""
    cfg = settings or get_settings()
    notebook = db.get(Notebook, notebook_id)
    if notebook is None:
        raise AppError(404, "NOTEBOOK_NOT_FOUND", f"Notebook '{notebook_id}' not found.")

    raw_name = upload.filename or "document"
    safe_name = sanitize_filename(raw_name)

    # Read up to max_upload_bytes + 1 so oversized uploads fail fast without unbounded RAM use
    content = await upload.read(cfg.max_upload_bytes + 1)
    if len(content) > cfg.max_upload_bytes:
        raise AppError(
            413,
            "FILE_TOO_LARGE",
            f"'{safe_name}' exceeds the {cfg.max_upload_mb} MB upload limit.",
            hint=f"Upload files smaller than {cfg.max_upload_mb} MB.",
        )

    try:
        file_type = detect_and_validate_file(safe_name, content)
    except ValueError as exc:
        raise AppError(400, "INVALID_FILE", str(exc)) from exc

    digest = _sha256_bytes(content)
    existing = db.scalar(
        select(Source).where(
            Source.notebook_id == notebook_id,
            Source.sha256 == digest,
        )
    )
    if existing is not None:
        raise AppError(
            409,
            "DUPLICATE_SOURCE",
            f"'{safe_name}' matches an already uploaded file ('{existing.filename}') in this notebook.",
        )

    source_id = uuid.uuid4().hex
    target_dir = cfg.uploads_dir / notebook_id
    target_dir.mkdir(parents=True, exist_ok=True)
    stored_path = target_dir / f"{source_id}_{safe_name}"
    stored_path.write_bytes(content)

    source = Source(
        id=source_id,
        notebook_id=notebook_id,
        filename=safe_name,
        stored_path=str(stored_path),
        file_type=file_type,
        size_bytes=len(content),
        sha256=digest,
        status="processing",
        chunk_count=0,
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    return source


def process_source_ingestion(source_id: str) -> None:
    """Background task: extract, chunk, embed, and persist vectors for a staged source."""
    settings = get_settings()
    factory = get_session_factory()
    db = factory()
    try:
        source = db.get(Source, source_id)
        if source is None:
            return

        path = Path(source.stored_path)
        if not path.exists():
            source.status = "failed"
            source.error_message = "Uploaded file missing from storage."
            db.commit()
            return

        extraction = extract_document(path, source.file_type)
        embedder = get_embedding_service()

        chunks = chunk_segments(
            extraction.segments,
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
            semantic_chunking=settings.semantic_chunking_enabled,
            semantic_similarity_threshold=settings.semantic_similarity_threshold,
            embed_fn=embedder.embed_documents if settings.semantic_chunking_enabled else None,
        )
        if not chunks:
            source.status = "failed"
            source.error_message = "Document produced no indexable text chunks."
            db.commit()
            return

        vectors = embedder.embed_documents([c.text for c in chunks])
        vector_store = get_vector_store()
        stored_count = vector_store.add_chunks(
            notebook_id=source.notebook_id,
            source_id=source.id,
            filename=source.filename,
            chunks=chunks,
            embeddings=vectors,
        )

        source.status = "ready"
        source.page_count = extraction.page_count
        source.warning_message = extraction.warning
        source.chunk_count = stored_count
        source.error_message = None
        db.commit()
        logger.info(
            "Ingested source_id=%s notebook_id=%s chunks=%d",
            source.id,
            source.notebook_id,
            stored_count,
        )
    except Exception as exc:
        logger.warning("Ingestion failed for source_id=%s: %s", source_id, exc)
        source = db.get(Source, source_id)
        if source is not None:
            source.status = "failed"
            msg = str(exc)
            source.error_message = msg
            if "scanned pdf" in msg.lower():
                source.warning_message = "no extractable text (scanned PDF)"
            db.commit()
    finally:
        db.close()


def delete_source_and_artifacts(db: Session, source: Source) -> None:
    """Delete a source's vectors, uploaded file on disk, and DB row."""
    vector_store = get_vector_store()
    vector_store.delete_source(source.notebook_id, source.id)

    path = Path(source.stored_path)
    if path.exists():
        try:
            path.unlink()
        except OSError as exc:
            logger.warning("Failed removing source file %s: %s", path, exc)

    db.delete(source)
    db.commit()


def delete_notebook_and_artifacts(
    db: Session, notebook: Notebook, settings: Settings | None = None
) -> None:
    """Delete a notebook's Chroma collection, upload directory, and DB rows."""
    cfg = settings or get_settings()
    vector_store = get_vector_store()
    vector_store.delete_notebook(notebook.id)

    nb_upload_dir = cfg.uploads_dir / notebook.id
    if nb_upload_dir.exists():
        shutil.rmtree(nb_upload_dir, ignore_errors=True)

    db.delete(notebook)
    db.commit()
