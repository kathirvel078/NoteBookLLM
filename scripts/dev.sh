#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"
if [[ ! -x "${PYTHON_BIN}" ]]; then
  PYTHON_BIN="python3"
fi

cleanup() {
  trap - EXIT INT TERM
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

(
  cd "${ROOT_DIR}/backend"
  "${PYTHON_BIN}" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
) &

(
  cd "${ROOT_DIR}/frontend"
  npm run dev
) &

wait
