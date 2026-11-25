"""Preflight verification script for LocalLM Notebook."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request


def check_python() -> bool:
    major, minor = sys.version_info[:2]
    ok = (major, minor) >= (3, 10)
    print(f"[{'OK' if ok else 'FAIL'}] Python {sys.version.split()[0]} (need >= 3.10)")
    return ok


def check_node() -> bool:
    node = shutil.which("node")
    if not node:
        print("[FAIL] Node.js not found on PATH (need >= 18)")
        return False
    out = subprocess.check_output([node, "--version"], text=True).strip()
    try:
        major = int(out.lstrip("v").split(".")[0])
    except ValueError:
        major = 0
    ok = major >= 18
    print(f"[{'OK' if ok else 'FAIL'}] Node.js {out} (need >= 18)")
    return ok


def check_ollama(base_url: str, model: str) -> bool:
    ollama_bin = shutil.which("ollama")
    if ollama_bin:
        ver = subprocess.check_output([ollama_bin, "--version"], text=True, stderr=subprocess.STDOUT).strip()
        print(f"[OK] {ver.splitlines()[-1]}")
    else:
        print("[WARN] 'ollama' CLI not found on PATH; checking HTTP endpoint directly")

    tags_url = f"{base_url.rstrip('/')}/api/tags"
    try:
        with urllib.request.urlopen(tags_url, timeout=5) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        print(f"[FAIL] Cannot reach Ollama at {tags_url}: {exc}")
        print("       Fix: Run `ollama serve`")
        return False

    models = [m.get("name", "") for m in payload.get("models", [])]
    base_target = model.split(":")[0]
    found = any(
        m == model or m == f"{model}:latest" or (":" not in model and m.split(":")[0] == base_target)
        for m in models
    )
    if not found:
        print(f"[FAIL] Model '{model}' not found in Ollama. Available: {models}")
        print(f"       Fix: Run `ollama pull {model}`")
        return False
    print(f"[OK] Ollama reachable and model '{model}' is available")

    gen_url = f"{base_url.rstrip('/')}/api/generate"
    req = urllib.request.Request(
        gen_url,
        data=json.dumps({"model": model, "prompt": "Reply with OK", "stream": False}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            gen_payload = json.loads(resp.read().decode("utf-8"))
        text = str(gen_payload.get("response", "")).strip()
        print(f"[OK] Ollama generation smoke test returned: {text!r}")
    except Exception as exc:
        print(f"[FAIL] Ollama generation smoke test failed: {exc}")
        return False
    return True


def check_embeddings(model_name: str, fallback_name: str) -> bool:
    try:
        from sentence_transformers import SentenceTransformer

        try:
            model = SentenceTransformer(model_name)
            used = model_name
        except Exception as exc:
            print(f"[WARN] Failed loading {model_name} ({exc}); trying fallback {fallback_name}")
            model = SentenceTransformer(fallback_name)
            used = fallback_name

        vec = model.encode(["LocalLM Notebook preflight check"], normalize_embeddings=True)
        print(f"[OK] Embeddings ready ({used}, dim={len(vec[0])})")
        return True
    except Exception as exc:
        print(f"[FAIL] Embedding model check failed: {exc}")
        return False


def main() -> int:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    model = os.getenv("OLLAMA_MODEL", "llama3.2")
    emb_model = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
    emb_fallback = os.getenv("EMBEDDING_FALLBACK_MODEL", "sentence-transformers/all-MiniLM-L6-v2")

    checks = [
        check_python(),
        check_node(),
        check_ollama(base_url, model),
        check_embeddings(emb_model, emb_fallback),
    ]
    if all(checks):
        print("\nAll preflight checks passed.")
        return 0
    print("\nPreflight finished with failures.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
