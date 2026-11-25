.PHONY: setup preflight dev backend frontend test lint eval

PYTHON ?= .venv/bin/python
ifeq ($(OS),Windows_NT)
	PYTHON := .venv/Scripts/python.exe
endif

setup:
	python -m venv .venv || true
	$(PYTHON) -m pip install --upgrade pip
	$(PYTHON) -m pip install -r backend/requirements.txt
	cd frontend && npm install
	cp -n backend/.env.example backend/.env || true

preflight:
	$(PYTHON) scripts/preflight.py

dev:
	bash scripts/dev.sh

backend:
	cd backend && ../$(PYTHON) -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

frontend:
	cd frontend && npm run dev

test:
	cd backend && ../$(PYTHON) -m pytest -v
	cd frontend && npm test -- --run

lint:
	cd backend && ../$(PYTHON) -m ruff check app tests && ../$(PYTHON) -m mypy app
	cd frontend && npm run lint && npm run typecheck

eval:
	$(PYTHON) scripts/eval_rag.py
