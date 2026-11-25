"""Application settings loaded from environment / .env."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    """Runtime configuration for LocalLM Notebook."""

    model_config = SettingsConfigDict(
        env_file=(str(BACKEND_DIR / ".env"), str(REPO_ROOT / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "LocalLM Notebook"
    app_env: str = "development"
    log_level: str = "INFO"

    # Local Ollama
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"
    ollama_num_ctx: int = 8192
    ollama_chat_temperature: float = 0.2
    ollama_studio_temperature: float = 0.3
    ollama_timeout_seconds: float = 120.0

    # Local HuggingFace sentence-transformers
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    embedding_fallback_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_batch_size: int = 32

    # Persistent local storage
    data_dir: str = "../data"

    # Upload & RAG limits
    max_upload_mb: int = 25
    max_files_per_upload: int = 10
    chunk_size: int = 900
    chunk_overlap: int = 150
    semantic_chunking_enabled: bool = False
    semantic_similarity_threshold: float = 0.45
    retrieval_top_k: int = 12
    retrieval_keep_k: int = 6
    retrieval_min_score: float = 0.28
    chat_history_max_turns: int = 6
    chat_context_token_budget: int = 3200
    chat_history_token_budget: int = 1200

    # CORS
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )

    # Optional local Piper TTS
    piper_bin: str = ""
    piper_voice_a: str = ""
    piper_voice_b: str = ""

    @property
    def resolved_data_dir(self) -> Path:
        p = Path(self.data_dir)
        if not p.is_absolute():
            p = (BACKEND_DIR / p).resolve()
        return p

    @property
    def uploads_dir(self) -> Path:
        return self.resolved_data_dir / "uploads"

    @property
    def chroma_dir(self) -> Path:
        return self.resolved_data_dir / "chroma"

    @property
    def audio_dir(self) -> Path:
        return self.resolved_data_dir / "audio"

    @property
    def sqlite_path(self) -> Path:
        return self.resolved_data_dir / "app.db"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    def ensure_data_dirs(self) -> None:
        self.resolved_data_dir.mkdir(parents=True, exist_ok=True)
        self.uploads_dir.mkdir(parents=True, exist_ok=True)
        self.chroma_dir.mkdir(parents=True, exist_ok=True)
        self.audio_dir.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
