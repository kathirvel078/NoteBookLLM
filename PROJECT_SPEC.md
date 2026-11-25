An existing repo is in this workspace at ./REA. Read its structure and README first, reuse what fits the spec, and do not remove existing working code without telling me.
# MISSION

You are a principal full-stack and AI engineer. Build **LocalLM Notebook**, a complete, production-quality, NotebookLM-inspired application that runs 100% locally and for free. Users create notebooks, upload documents, chat with them using grounded RAG with citations, and generate Studio outputs (summary, study guide, flashcards, quiz, mind map, timeline, report, audio overview script).

Work like an autonomous senior engineer: plan first, build in verified milestones, test everything you build, and never claim something works until you have run it.

---

# 0. HARD CONSTRAINTS (non-negotiable)

- NO Gemini, OpenAI, Anthropic, or any paid or cloud LLM/embedding/TTS API. No API keys anywhere in the project.
- All LLM inference goes through local **Ollama** at `http://localhost:11434`. Default model: `llama3.2`. Configurable via `.env`.
- Embeddings are generated locally with HuggingFace `sentence-transformers` (default `BAAI/bge-small-en-v1.5`, fallback `sentence-transformers/all-MiniLM-L6-v2`).
- Vector store: **ChromaDB** in persistent local mode. Documents, DB and vectors stay on disk under `./data/`.
- The React app never holds secrets. It only talks to FastAPI, via the Vite dev proxy or `VITE_API_BASE_URL`. FastAPI is the only thing that talks to Ollama and ChromaDB.
- Llama does not generate audio or video. Audio Overview = LLM-written script + optional local TTS (Piper, falling back to pyttsx3). If no TTS engine is installed, return the script only and say so in the UI. Never fake audio.
- Be honest about limits: llama3.2 (3B) has a small effective context, so design around it (see sections 4 and 6).

---

# 1. PHASE 0: PREFLIGHT (do this BEFORE writing code)

Run these in the terminal and report the results in your plan:

1. `python --version` (need 3.10+), `node --version` (need 18+), `ollama --version`
2. `curl http://localhost:11434/api/tags`. If it fails, tell me to run `ollama serve`, and wait.
3. Check that `llama3.2` appears in the tags. If not, run `ollama pull llama3.2`.
4. Smoke-test generation: `ollama run llama3.2 "Reply with OK"`.
5. Download and test the embedding model once with sentence-transformers.

Also build this same check into the app: a `GET /api/health` endpoint plus a `scripts/preflight.py` script. If Ollama is down or the model is missing, the backend still boots, health reports `degraded` with a clear fix message, and the UI shows a persistent banner with the exact command to run.

---

# 2. TECH STACK

**Backend:** Python 3.10+, FastAPI, Uvicorn, Pydantic v2, SQLAlchemy 2 + SQLite (metadata, chat history, studio outputs), the official `ollama` Python package (AsyncClient), ChromaDB, sentence-transformers, LangChain (`langchain-text-splitters`, `langchain-chroma`, `langchain-huggingface`, `langchain-ollama` only where useful, with no heavy agent abstractions), PyMuPDF (PDF with page numbers), python-docx, python-multipart, pytest, httpx, ruff.

**Frontend:** React 18 + Vite + TypeScript, Tailwind CSS, TanStack Query, Zustand, react-markdown + remark-gfm, React Flow (mind map), lucide-react.

---

# 3. REPOSITORY STRUCTURE

```
locallm-notebook/
├── backend/
│   ├── app/
│   │   ├── main.py              # app factory, CORS, lifespan, routers
│   │   ├── core/                # config.py (pydantic-settings), logging, errors
│   │   ├── db/                  # models.py, session.py
│   │   ├── schemas/             # Pydantic request/response models
│   │   ├── services/
│   │   │   ├── ollama_client.py # health, model check, chat, stream, JSON-schema generate
│   │   │   ├── ingestion.py     # extract → chunk → embed → store
│   │   │   ├── extractors.py    # pdf/txt/docx
│   │   │   ├── chunking.py
│   │   │   ├── embeddings.py    # singleton, lazy load
│   │   │   ├── vectorstore.py   # Chroma wrapper
│   │   │   ├── retrieval.py     # query rewrite, MMR, filtering, reranking
│   │   │   ├── rag.py           # prompt build, citations
│   │   │   ├── studio/          # one module per feature + map_reduce.py
│   │   │   └── tts.py           # optional local TTS
│   │   └── routers/             # notebooks, sources, chat, studio, health
│   ├── tests/
│   ├── requirements.txt
│   └── .env.example
├── frontend/                    # Vite + React + TS
├── data/                        # gitignored: uploads/, chroma/, app.db, audio/
├── scripts/                     # preflight.py, dev.sh, dev.ps1
├── .github/workflows/ci.yml
├── README.md  LICENSE  .gitignore  Makefile
```

---

# 4. RAG PIPELINE (must be a real RAG implementation)

**Upload:** `POST /api/sources/upload` (multipart, notebook_id + files). Accept PDF/TXT/DOCX only. Validate extension AND magic bytes, enforce max size (default 25 MB, configurable), sanitize filenames, store as `data/uploads/{notebook_id}/{source_id}_{safe_name}`. Reject duplicates by SHA-256 within a notebook. Ingest in a background task. Source status: `processing → ready | failed` (with error message), and expose it via `GET /api/sources/{notebook_id}`.

**Extraction:** PDF via PyMuPDF, per page, keeping page numbers. DOCX via python-docx, preserving headings and tables as text. DOCX has no real pages, so cite by nearest heading or section ("Section: Methods") and say so honestly. TXT with encoding detection. If a PDF yields almost no text (scanned), mark the source with a clear "no extractable text (scanned PDF)" warning. Don't silently succeed.

**Chunking:** structure-aware recursive splitting (paragraph → sentence → word), ~800–1000 chars with ~150 overlap. Never merge text across pages; every chunk keeps `page_start/page_end`. Optionally add a semantic-boundary pass using embedding similarity between adjacent sentences, behind a config flag. Drop empty and near-duplicate chunks.

**Embeddings:** local sentence-transformers, batched, normalized, model loaded once lazily. Use the BGE query instruction prefix for queries when applicable.

**Storage:** one Chroma persistent client. One collection per notebook (`nb_{id}`), or a single collection filtered by `notebook_id`. Pick one and justify it. Metadata per chunk: `notebook_id, source_id, filename, page_start, page_end, section, chunk_index, char_start`. Deleting a source or notebook must remove its vectors, files and DB rows (verify with a test).

**Retrieval:**
- History-aware query rewriting: use the last N turns plus the follow-up question to produce a standalone query via Llama (skip when there is no history).
- Filter by `notebook_id` AND an optional `source_ids` list (this is the "relevant source selection" feature: the user ticks which sources to use).
- Retrieve top-k candidates (default 12), apply MMR for diversity, keep the best 5–6 within a context token budget.
- Apply a similarity threshold. If nothing is relevant, answer exactly that the documents don't contain it. Do not hallucinate.
- Multi-document QA must balance across sources so one document doesn't dominate.

**Generation:**
- Number the context blocks `[1]…[n]` with filename and page.
- System prompt: answer ONLY from the context, cite with `[n]`, say when information is missing, never invent page numbers, be concise, and use markdown.
- Set `num_ctx` explicitly (default 8192), temperature 0.2 for chat and ~0.3 for studio. Make both configurable.
- Post-process: parse the `[n]` markers actually used in the answer and return only those as citations. Each citation has `{index, source_id, filename, page_start, page_end, snippet, score}`. Strip or flag citations that point to non-existent indices.

---

# 5. API (implement all, with OpenAPI docs and typed schemas)

Required:
```
POST   /api/notebooks                 GET /api/notebooks
DELETE /api/notebooks/{id}
POST   /api/sources/upload            GET /api/sources/{notebook_id}
POST   /api/chat                      POST /api/chat/stream
POST   /api/studio/summary            POST /api/studio/flashcards
POST   /api/studio/quiz               POST /api/studio/mindmap
POST   /api/studio/study-guide
```
Also add:
```
GET    /api/health
DELETE /api/sources/{source_id}
GET    /api/chat/history/{notebook_id}
DELETE /api/chat/{notebook_id}        # clear chat
POST   /api/studio/report
POST   /api/studio/timeline
POST   /api/studio/audio-overview     # script + optional audio_url
GET    /api/studio/audio/{file}
```

**Streaming (`/api/chat/stream`):** Server-Sent Events over POST (consume it in React with `fetch` + `ReadableStream`, not `EventSource`). Event types: `sources` (citations sent first), `token`, `done` (message id, usage), `error`. Handle client disconnects by cancelling the Ollama stream. Persist the final assistant message and citations after completion.

**Chat request:** `{notebook_id, message, source_ids?: string[], conversation_id?}`. Server-side history is loaded from SQLite and trimmed to a token budget. Follow-ups must work.

---

# 6. STUDIO (all functional, all grounded in the notebook's documents)

Every Studio request accepts `{notebook_id, source_ids?, options}`.

**Handling long documents with a small-context model:** implement `map_reduce.py`: (1) select representative chunks (cluster embeddings, or pick evenly across the documents), (2) "map" step: extract key points per batch of chunks, (3) "reduce" step: synthesize the final output from the key points. Never stuff everything into one prompt.

**Structured output:** use Ollama's structured outputs (`format` = JSON schema generated from Pydantic models). Validate with Pydantic. On failure, retry up to 2 times with a repair prompt, then return a clean 422/502 with a helpful message. Never return raw broken JSON.

| Feature | Output schema |
|---|---|
| Summary | `{title, overview, key_points[], conclusion}` |
| Study guide | `{summary, key_concepts[{term, definition}], important_questions[], further_study[]}` |
| Flashcards | `{cards[{front, back, source_ref}]}` (count configurable, default 10) |
| Quiz | `{questions[{question, options[4], correct_index, explanation, source_ref}]}`; validate exactly 4 options and a valid index |
| Mind map | `{root:{id,label,children[...]}}` with depth ≤ 4; convert to React Flow nodes/edges on the client with auto layout |
| Timeline | `{events[{date, title, description, source_ref}]}`, sorted chronologically; allow only dates actually present in the sources |
| Report | `{title, executive_summary, sections[{heading, content}], conclusion}` with an export-to-Markdown button |
| Audio overview | `{title, turns[{speaker:"Host A"\|"Host B", text}]}` conversational script; optional TTS via Piper (alternating two voices) or pyttsx3, saved as WAV under `data/audio/`. If there is no TTS, return `audio_url: null` plus `tts_available: false` |

Persist generated outputs in SQLite so they reappear after refresh, with a regenerate button.

---

# 7. ERROR HANDLING

- Ollama unreachable → HTTP 503 with `{code:"OLLAMA_UNAVAILABLE", hint:"Run: ollama serve"}`.
- Model missing → 503 with `{code:"MODEL_NOT_FOUND", hint:"Run: ollama pull llama3.2"}`.
- Timeouts, retries with backoff for transient errors, and a global exception handler returning a consistent error envelope.
- Structured logging with request IDs. Never log document contents at INFO level.
- Frontend shows human-readable toasts and inline error states, never raw stack traces.

---

# 8. SECURITY AND ROBUSTNESS

CORS restricted to the configured frontend origin. Upload limits, MIME and magic-byte validation, path-traversal-safe filenames, and a limit on files per request. No secrets in the repo (`.env.example` only). Prompt-injection hygiene: treat document text as untrusted data, delimit it clearly, and instruct the model not to follow instructions found inside documents.

---

# 9. FRONTEND (NotebookLM-inspired, polished)

Run the `frontend-design` skill guidance if available. Avoid generic template looks.

- **Home:** notebook grid (create, rename, delete with confirm).
- **Notebook view, 3 resizable panels:**
  1. **Sources:** upload drag-and-drop with progress and status chips (processing/ready/failed), checkbox per source for source selection, delete source.
  2. **Chat:** streaming markdown answers, a typing/stop button, clickable citation chips `[1]` that open a side drawer showing filename, page and the exact snippet, suggested follow-up questions (generated by Llama after each answer), a "clear chat" action with confirmation, and the history loaded on open.
  3. **Studio:** tiles for each feature, a loading state per tile, and a dedicated renderer for each output (flip-card flashcards, interactive quiz with scoring and explanations, React Flow mind map with zoom/pan and PNG export, vertical timeline, collapsible study guide, report with Markdown download, audio player plus transcript).
- Global Ollama status indicator in the header (green/amber/red) polling `/api/health`.
- Responsive, keyboard accessible, dark and light themes, empty states, skeleton loaders.

---

# 10. TESTING AND QUALITY

- Backend pytest: extractors (with fixture PDF/DOCX/TXT), chunking (page metadata preserved), ingestion → retrieval round trip, citation parsing, structured-output validation and retry (mock Ollama with httpx/respx), delete cascades, health degraded states, upload validation.
- Frontend: Vitest + React Testing Library for the streaming hook, the citation chip, and the quiz component.
- Add an **evaluation script** `scripts/eval_rag.py`: given a sample doc and 5 Q&A pairs, report retrieval hit-rate and whether answers include valid citations.
- ruff + mypy-lite on the backend, eslint + tsc on the frontend. CI (GitHub Actions) runs lint and tests with Ollama mocked.

---

# 11. REPOSITORY AND GITHUB

Initialize git with Conventional Commits, one commit per milestone. Write a thorough `README.md`: architecture diagram (Mermaid), prerequisites, Ollama install and model pull, one-command setup (`make setup`, `make dev`, plus Windows PowerShell equivalents), env vars table, API reference summary, feature walkthrough, troubleshooting (Ollama not running, slow CPU inference, model switching to `llama3.2:1b`, Chroma reset), and a "Known limitations" section (small context, DOCX page references, scanned PDFs). Include `.gitignore` (data/, .env, node_modules, __pycache__), MIT license, and a CONTRIBUTING note.

---

# 12. HOW YOU MUST WORK (Antigravity workflow)

1. **Plan first.** Produce an Implementation Plan and a Task List artifact. Wait for nothing; proceed after posting the plan, but keep the plan updated.
2. **Milestones**, each with acceptance checks that you actually run:
   - M0 Preflight + scaffold + health endpoint
   - M1 Notebooks + sources upload + ingestion (verify vectors in Chroma)
   - M2 Retrieval + non-streaming chat with citations
   - M3 Streaming chat + history + clear chat + source selection
   - M4 Studio backend (all features, structured outputs)
   - M5 Frontend shell, sources panel, chat with streaming and citations
   - M6 Studio UI renderers
   - M7 Tests, eval script, CI, README polish
3. After each milestone, run the tests and start the servers. Use the **browser agent** to open the UI, upload a real sample PDF, ask a question, check that citations point to the right page, and run every Studio feature. Capture screenshots as artifacts.
4. If something fails, diagnose the root cause and fix it. Don't work around it silently or stub it out. Never leave TODO stubs or mock data in the shipped app.
5. Don't add dependencies you don't need, and don't use any cloud service.

# DEFINITION OF DONE

- `ollama serve` + `make dev` brings up the full app with no API keys and no internet needed after the initial model downloads.
- A fresh user can create a notebook, upload a PDF, DOCX and TXT, ask multi-document questions with correct page-level citations, stream answers, ask follow-ups, clear chat, and generate all Studio outputs.
- Stopping Ollama produces a graceful, actionable UI message, not a crash.
- All tests pass, the README is complete, and the repo is clean and pushable to GitHub.

Begin with Phase 0 (preflight) now.