"""Mind Map Studio generator (enforces tree depth <= 4)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.schemas.studio import MindMapNode, MindMapOutput
from app.services.ollama_client import OllamaService
from app.services.studio.map_reduce import build_studio_context
from app.services.studio.structured import generate_structured, save_studio_output


def _normalize_mindmap(node: MindMapNode, depth: int = 1, counter: list[int] | None = None) -> MindMapNode:
    """Enforce depth <= 4 and unique non-empty node IDs for React Flow."""
    if counter is None:
        counter = [0]
    idx = counter[0]
    counter[0] += 1
    clean_id = node.id.strip() or f"node_{idx}"
    clean_id = f"{clean_id}_{idx}" if idx > 0 else clean_id
    clean_label = node.label.strip() or f"Topic {idx}"
    if depth >= 4:
        return MindMapNode(id=clean_id, label=clean_label, children=[])
    children = [_normalize_mindmap(c, depth + 1, counter) for c in node.children[:6]]
    return MindMapNode(id=clean_id, label=clean_label, children=children)


async def generate_mindmap(
    db: Session,
    *,
    notebook_id: str,
    source_ids: list[str] | None,
    ollama_svc: OllamaService,
    settings: Settings | None = None,
) -> MindMapOutput:
    context, _ = await build_studio_context(
        db,
        notebook_id=notebook_id,
        source_ids=source_ids,
        ollama_svc=ollama_svc,
        focus_instruction="Hierarchical topic breakdown: central theme, major branches, sub-topics.",
        settings=settings,
    )
    raw = await generate_structured(
        feature="mindmap",
        schema_model=MindMapOutput,
        system_prompt=(
            "You create hierarchical concept mind maps grounded in the provided sources. "
            "Keep labels concise (2-6 words), maximum depth 4 levels, and return valid JSON."
        ),
        user_prompt=(
            f"Source material:\n{context}\n\n"
            "Generate a hierarchical mind map rooted at the central topic (depth <= 4)."
        ),
        ollama_svc=ollama_svc,
        settings=settings,
    )
    result = MindMapOutput(root=_normalize_mindmap(raw.root))
    save_studio_output(
        db,
        notebook_id=notebook_id,
        feature="mindmap",
        payload=result.model_dump(),
        source_ids=source_ids,
    )
    return result
