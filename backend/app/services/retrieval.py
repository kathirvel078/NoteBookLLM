"""Retrieval pipeline: history-aware query rewrite, multi-doc balancing, MMR, thresholding."""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.db.models import Source
from app.services.embeddings import get_embedding_service
from app.services.ollama_client import OllamaService
from app.services.vectorstore import StoredChunk, get_vector_store

logger = get_logger(__name__)


def _cosine_sim(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b, strict=False))


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


async def rewrite_query_with_history(
    *,
    question: str,
    history: list[dict[str, str]],
    ollama_svc: OllamaService,
) -> str:
    """Rewrite a follow-up question into a standalone search query using recent turns."""
    if not history:
        return question

    recent = history[-6:]
    transcript = "\n".join(
        f"{m['role'].capitalize()}: {m['content'][:400]}" for m in recent
    )
    messages = [
        {
            "role": "system",
            "content": (
                "Rewrite the user's latest question into a concise standalone search query "
                "using the conversation history for context. Output ONLY the rewritten query text, "
                "nothing else. If it is already standalone, return it unchanged."
            ),
        },
        {
            "role": "user",
            "content": f"Conversation:\n{transcript}\n\nLatest question: {question}",
        },
    ]
    try:
        rewritten = (await ollama_svc.chat(messages, temperature=0.0, max_retries=1)).strip()
        if rewritten and len(rewritten) <= 500:
            return rewritten.strip('"').strip("'")
    except Exception as exc:
        logger.warning("Query rewrite failed, using original question: %s", exc)
    return question


def apply_mmr_balanced(
    candidates: list[StoredChunk],
    query_vec: list[float],
    *,
    keep_k: int,
    token_budget: int,
    lambda_mult: float = 0.7,
) -> list[StoredChunk]:
    """Select up to keep_k chunks using MMR + mild source-diversity bonus within token budget."""
    if not candidates:
        return []

    selected: list[StoredChunk] = []
    remaining = list(candidates)
    source_counts: dict[str, int] = defaultdict(int)
    used_tokens = 0

    while remaining and len(selected) < keep_k:
        best_idx = -1
        best_mmr = float("-inf")

        for idx, cand in enumerate(remaining):
            rel = cand.score
            if cand.embedding is not None and query_vec:
                rel = max(rel, _cosine_sim(query_vec, cand.embedding))

            redundancy = 0.0
            if selected and cand.embedding is not None:
                sims = [
                    _cosine_sim(cand.embedding, s.embedding)
                    for s in selected
                    if s.embedding is not None
                ]
                if sims:
                    redundancy = max(sims)

            # Mild penalty on already-represented sources so multi-doc QA stays balanced
            source_penalty = 0.08 * source_counts[cand.source_id]
            mmr_score = lambda_mult * rel - (1.0 - lambda_mult) * redundancy - source_penalty

            if mmr_score > best_mmr:
                best_mmr = mmr_score
                best_idx = idx

        if best_idx < 0:
            break

        chosen = remaining.pop(best_idx)
        tok = _estimate_tokens(chosen.text) + 30
        if selected and used_tokens + tok > token_budget:
            continue

        selected.append(chosen)
        source_counts[chosen.source_id] += 1
        used_tokens += tok

    return selected


async def retrieve_relevant_chunks(
    db: Session,
    *,
    notebook_id: str,
    question: str,
    history: list[dict[str, str]],
    ollama_svc: OllamaService,
    source_ids: list[str] | None = None,
    settings: Settings | None = None,
) -> tuple[str, list[StoredChunk]]:
    """Retrieve diverse, thresholded, multi-document balanced chunks for RAG."""
    cfg = settings or get_settings()

    # Determine ready sources in scope
    stmt = select(Source.id).where(
        Source.notebook_id == notebook_id,
        Source.status == "ready",
    )
    if source_ids is not None:
        if len(source_ids) == 0:
            return question, []
        stmt = stmt.where(Source.id.in_(source_ids))

    ready_source_ids = list(db.scalars(stmt).all())
    if not ready_source_ids:
        return question, []

    search_query = await rewrite_query_with_history(
        question=question, history=history, ollama_svc=ollama_svc
    )

    embedder = get_embedding_service()
    query_vec = embedder.embed_query(search_query)
    vector_store = get_vector_store()

    def _retrieve_candidates(embedding: list[float]) -> list[StoredChunk]:
        """Retrieve global hits plus per-source coverage for a query embedding."""
        pool_by_id: dict[str, StoredChunk] = {}
        global_hits = vector_store.query(
            notebook_id=notebook_id,
            query_embedding=embedding,
            n_results=cfg.retrieval_top_k,
            source_ids=ready_source_ids,
            include_embeddings=True,
        )
        for hit in global_hits:
            pool_by_id[hit.chunk_id] = hit

        # Ensure multi-document representation when multiple sources are active.
        if len(ready_source_ids) > 1:
            per_source_k = max(2, cfg.retrieval_top_k // len(ready_source_ids))
            for sid in ready_source_ids:
                per_hits = vector_store.query(
                    notebook_id=notebook_id,
                    query_embedding=embedding,
                    n_results=per_source_k,
                    source_ids=[sid],
                    include_embeddings=True,
                )
                for hit in per_hits:
                    pool_by_id.setdefault(hit.chunk_id, hit)
        return list(pool_by_id.values())

    # Apply the similarity threshold to the standalone rewrite first. If that
    # rewrite loses the user's important keywords, retry the original question
    # rather than incorrectly reporting that the selected documents lack an answer.
    candidates = _retrieve_candidates(query_vec)
    filtered = [c for c in candidates if c.score >= cfg.retrieval_min_score]
    if not filtered and search_query.strip() != question.strip():
        search_query = question
        query_vec = embedder.embed_query(question)
        candidates = _retrieve_candidates(query_vec)
        filtered = [c for c in candidates if c.score >= cfg.retrieval_min_score]

    if not filtered:
        return search_query, []

    filtered.sort(key=lambda c: c.score, reverse=True)
    selected = apply_mmr_balanced(
        filtered[: max(cfg.retrieval_top_k, len(ready_source_ids) * 2)],
        query_vec,
        keep_k=cfg.retrieval_keep_k,
        token_budget=cfg.chat_context_token_budget,
    )
    return search_query, selected
