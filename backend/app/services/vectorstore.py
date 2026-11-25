"""Persistent ChromaDB wrapper using one collection per notebook (nb_{notebook_id})."""

from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Any

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.core.config import Settings, get_settings
from app.services.chunking import ChunkData


@dataclass(slots=True)
class StoredChunk:
    """Chunk + metadata + cosine similarity returned from ChromaDB."""

    chunk_id: str
    text: str
    notebook_id: str
    source_id: str
    filename: str
    page_start: int | None
    page_end: int | None
    section: str
    chunk_index: int
    char_start: int
    score: float
    embedding: list[float] | None = None


def _collection_name(notebook_id: str) -> str:
    return f"nb_{notebook_id}"


def _meta_to_stored_chunk(
    chunk_id: str,
    text: str,
    meta: dict[str, Any],
    score: float,
    embedding: list[float] | None = None,
) -> StoredChunk:
    p_start = int(meta.get("page_start", 0) or 0)
    p_end = int(meta.get("page_end", 0) or 0)
    return StoredChunk(
        chunk_id=chunk_id,
        text=text,
        notebook_id=str(meta.get("notebook_id", "")),
        source_id=str(meta.get("source_id", "")),
        filename=str(meta.get("filename", "")),
        page_start=p_start if p_start > 0 else None,
        page_end=p_end if p_end > 0 else None,
        section=str(meta.get("section", "")),
        chunk_index=int(meta.get("chunk_index", 0) or 0),
        char_start=int(meta.get("char_start", 0) or 0),
        score=score,
        embedding=embedding,
    )


class VectorStoreService:
    """Manages persistent ChromaDB collections (one per notebook for clean isolation & deletion)."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.settings.ensure_data_dirs()
        self._client = chromadb.PersistentClient(
            path=str(self.settings.chroma_dir),
            settings=ChromaSettings(anonymized_telemetry=False),
        )

    def _get_or_create_collection(self, notebook_id: str):
        return self._client.get_or_create_collection(
            name=_collection_name(notebook_id),
            metadata={"hnsw:space": "cosine"},
        )

    def _get_collection_if_exists(self, notebook_id: str):
        try:
            return self._client.get_collection(name=_collection_name(notebook_id))
        except Exception:
            return None

    def add_chunks(
        self,
        *,
        notebook_id: str,
        source_id: str,
        filename: str,
        chunks: list[ChunkData],
        embeddings: list[list[float]],
    ) -> int:
        if not chunks:
            return 0
        collection = self._get_or_create_collection(notebook_id)
        ids = [f"{source_id}_{c.chunk_index}" for c in chunks]
        documents = [c.text for c in chunks]
        metadatas = [
            {
                "notebook_id": notebook_id,
                "source_id": source_id,
                "filename": filename,
                "page_start": c.page_start if c.page_start is not None else 0,
                "page_end": c.page_end if c.page_end is not None else 0,
                "section": c.section,
                "chunk_index": c.chunk_index,
                "char_start": c.char_start,
            }
            for c in chunks
        ]
        collection.upsert(
            ids=ids,
            documents=documents,
            embeddings=embeddings,
            metadatas=metadatas,
        )
        return len(chunks)

    def query(
        self,
        *,
        notebook_id: str,
        query_embedding: list[float],
        n_results: int = 12,
        source_ids: list[str] | None = None,
        include_embeddings: bool = True,
    ) -> list[StoredChunk]:
        collection = self._get_collection_if_exists(notebook_id)
        if collection is None:
            return []
        total = collection.count()
        if total == 0:
            return []

        where: dict[str, Any] | None = None
        if source_ids is not None:
            if len(source_ids) == 0:
                return []
            where = (
                {"source_id": source_ids[0]}
                if len(source_ids) == 1
                else {"source_id": {"$in": source_ids}}
            )

        include = ["documents", "metadatas", "distances"]
        if include_embeddings:
            include.append("embeddings")

        res = collection.query(
            query_embeddings=[query_embedding],
            n_results=min(n_results, total),
            where=where,
            include=include,
        )
        ids = (res.get("ids") or [[]])[0]
        docs = (res.get("documents") or [[]])[0]
        metas = (res.get("metadatas") or [[]])[0]
        dists = (res.get("distances") or [[]])[0]
        embs = (res.get("embeddings") or [[]])[0] if include_embeddings else [None] * len(ids)

        results: list[StoredChunk] = []
        for idx, cid in enumerate(ids):
            dist = float(dists[idx]) if idx < len(dists) else 1.0
            score = max(0.0, min(1.0, 1.0 - dist))
            emb_raw = embs[idx] if idx < len(embs) else None
            emb_list = list(emb_raw) if emb_raw is not None else None
            results.append(
                _meta_to_stored_chunk(
                    chunk_id=str(cid),
                    text=str(docs[idx]),
                    meta=dict(metas[idx] or {}),
                    score=score,
                    embedding=emb_list,
                )
            )
        return results

    def get_notebook_chunks(
        self,
        notebook_id: str,
        source_ids: list[str] | None = None,
    ) -> list[StoredChunk]:
        """Return all stored chunks for a notebook (ordered by source_id, chunk_index)."""
        collection = self._get_collection_if_exists(notebook_id)
        if collection is None or collection.count() == 0:
            return []

        where: dict[str, Any] | None = None
        if source_ids is not None:
            if len(source_ids) == 0:
                return []
            where = {"source_id": source_ids[0]} if len(source_ids) == 1 else {"source_id": {"$in": source_ids}}

        res = collection.get(where=where, include=["documents", "metadatas"])
        ids = res.get("ids") or []
        docs = res.get("documents") or []
        metas = res.get("metadatas") or []

        items = [
            _meta_to_stored_chunk(
                chunk_id=str(ids[i]),
                text=str(docs[i]),
                meta=dict(metas[i] or {}),
                score=1.0,
            )
            for i in range(len(ids))
        ]
        items.sort(key=lambda c: (c.source_id, c.chunk_index))
        return items

    def count_source_chunks(self, notebook_id: str, source_id: str) -> int:
        collection = self._get_collection_if_exists(notebook_id)
        if collection is None:
            return 0
        res = collection.get(where={"source_id": source_id}, include=[])
        return len(res.get("ids") or [])

    def delete_source(self, notebook_id: str, source_id: str) -> None:
        collection = self._get_collection_if_exists(notebook_id)
        if collection is None:
            return
        collection.delete(where={"source_id": source_id})

    def delete_notebook(self, notebook_id: str) -> None:
        try:
            self._client.delete_collection(name=_collection_name(notebook_id))
        except Exception:
            pass


_vector_store: VectorStoreService | None = None
_vs_lock = threading.Lock()


def get_vector_store() -> VectorStoreService:
    global _vector_store
    if _vector_store is None:
        with _vs_lock:
            if _vector_store is None:
                _vector_store = VectorStoreService()
    return _vector_store
