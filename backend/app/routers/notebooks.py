"""Notebooks CRUD router."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.db.models import Notebook, Source
from app.db.session import get_db
from app.schemas.notebooks import NotebookCreate, NotebookRead, NotebookUpdate
from app.services.ingestion import delete_notebook_and_artifacts

router = APIRouter(prefix="/api/notebooks", tags=["notebooks"])


def _to_read(notebook: Notebook, source_count: int) -> NotebookRead:
    return NotebookRead(
        id=notebook.id,
        title=notebook.title,
        source_count=source_count,
        created_at=notebook.created_at,
        updated_at=notebook.updated_at,
    )


@router.post("", response_model=NotebookRead, status_code=status.HTTP_201_CREATED)
def create_notebook(payload: NotebookCreate, db: Session = Depends(get_db)) -> NotebookRead:
    title = payload.title.strip()
    if not title:
        raise AppError(422, "INVALID_TITLE", "Notebook title cannot be empty.")
    nb = Notebook(title=title)
    db.add(nb)
    db.commit()
    db.refresh(nb)
    return _to_read(nb, 0)


@router.get("", response_model=list[NotebookRead])
def list_notebooks(db: Session = Depends(get_db)) -> list[NotebookRead]:
    stmt = (
        select(Notebook, func.count(Source.id))
        .outerjoin(Source, Source.notebook_id == Notebook.id)
        .group_by(Notebook.id)
        .order_by(Notebook.updated_at.desc())
    )
    rows = db.execute(stmt).all()
    return [_to_read(nb, int(cnt)) for nb, cnt in rows]


@router.patch("/{notebook_id}", response_model=NotebookRead)
def rename_notebook(
    notebook_id: str, payload: NotebookUpdate, db: Session = Depends(get_db)
) -> NotebookRead:
    nb = db.get(Notebook, notebook_id)
    if nb is None:
        raise AppError(404, "NOTEBOOK_NOT_FOUND", f"Notebook '{notebook_id}' not found.")
    title = payload.title.strip()
    if not title:
        raise AppError(422, "INVALID_TITLE", "Notebook title cannot be empty.")
    nb.title = title
    db.commit()
    db.refresh(nb)
    cnt = db.scalar(select(func.count(Source.id)).where(Source.notebook_id == nb.id)) or 0
    return _to_read(nb, int(cnt))


@router.delete("/{notebook_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notebook(
    notebook_id: str,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Response:
    nb = db.get(Notebook, notebook_id)
    if nb is None:
        raise AppError(404, "NOTEBOOK_NOT_FOUND", f"Notebook '{notebook_id}' not found.")
    delete_notebook_and_artifacts(db, nb, settings)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
