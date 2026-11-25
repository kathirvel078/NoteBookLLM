"""Structure-aware recursive chunking preserving page/section provenance."""

from __future__ import annotations

import hashlib
import re
from collections.abc import Callable
from dataclasses import dataclass

from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.services.extractors import ExtractedSegment


@dataclass(slots=True)
class ChunkData:
    """A single chunk ready for embedding and ChromaDB persistence."""

    text: str
    page_start: int | None
    page_end: int | None
    section: str
    chunk_index: int
    char_start: int


def _normalize_for_dedup(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def _split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(])", text.strip())
    return [p.strip() for p in parts if p.strip()]


def _semantic_merge_sentences(
    sentences: list[str],
    embed_fn: Callable[[list[str]], list[list[float]]],
    chunk_size: int,
    similarity_threshold: float,
) -> list[str]:
    """Optional semantic-boundary grouping of adjacent sentences."""
    if len(sentences) <= 1:
        return sentences

    vectors = embed_fn(sentences)
    groups: list[list[str]] = [[sentences[0]]]
    for idx in range(1, len(sentences)):
        prev_vec = vectors[idx - 1]
        curr_vec = vectors[idx]
        # Vectors are L2-normalized, so dot product == cosine similarity
        sim = sum(a * b for a, b in zip(prev_vec, curr_vec, strict=False))
        candidate_len = sum(len(s) + 1 for s in groups[-1]) + len(sentences[idx])
        if sim >= similarity_threshold and candidate_len <= chunk_size:
            groups[-1].append(sentences[idx])
        else:
            groups.append([sentences[idx]])

    return [" ".join(g) for g in groups]


def chunk_segments(
    segments: list[ExtractedSegment],
    *,
    chunk_size: int = 900,
    chunk_overlap: int = 150,
    semantic_chunking: bool = False,
    semantic_similarity_threshold: float = 0.45,
    embed_fn: Callable[[list[str]], list[list[float]]] | None = None,
) -> list[ChunkData]:
    """Split extracted segments into chunks without ever merging across pages/segments."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ". ", "? ", "! ", " ", ""],
        length_function=len,
        add_start_index=True,
    )

    chunks: list[ChunkData] = []
    seen_hashes: set[str] = set()
    chunk_index = 0

    for seg in segments:
        raw_text = seg.text.strip()
        if not raw_text:
            continue

        if semantic_chunking and embed_fn is not None and len(raw_text) > chunk_size:
            sentences = _split_sentences(raw_text)
            semantic_blocks = _semantic_merge_sentences(
                sentences,
                embed_fn=embed_fn,
                chunk_size=chunk_size,
                similarity_threshold=semantic_similarity_threshold,
            )
            docs = splitter.create_documents(semantic_blocks)
        else:
            docs = splitter.create_documents([raw_text])

        search_cursor = 0
        for doc in docs:
            piece = doc.page_content.strip()
            if len(piece) < 20:
                continue

            norm = _normalize_for_dedup(piece)
            digest = hashlib.sha256(norm.encode("utf-8")).hexdigest()
            if digest in seen_hashes:
                continue
            seen_hashes.add(digest)

            char_start = int(doc.metadata.get("start_index", -1))
            if char_start < 0:
                found = raw_text.find(piece[:40], search_cursor)
                char_start = max(found, 0)
            search_cursor = max(search_cursor, char_start)

            chunks.append(
                ChunkData(
                    text=piece,
                    page_start=seg.page_start,
                    page_end=seg.page_end,
                    section=seg.section,
                    chunk_index=chunk_index,
                    char_start=char_start,
                )
            )
            chunk_index += 1

    return chunks
