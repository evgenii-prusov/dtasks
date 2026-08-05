RUN_DIR := .run
# Not 8000: several sibling local projects (e.g. dcash) default to 8000 too,
# so two `make start` runs at once silently fight over the port (uvicorn
# just fails to bind — no error surfaced to the caller). Keep this and
# frontend/vite.config.ts's proxy target in sync if you ever change it.
DEV_BACKEND_PORT := 8010

.PHONY: help install install-backend install-frontend \
	db-upgrade test test-backend test-frontend test-e2e \
	dev-backend dev-frontend e2e-backend start stop restart status \
	logs logs-backend logs-frontend clean docker-build

help: ## Show this help
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: install-backend install-frontend ## Install backend + frontend dependencies

install-backend: ## Install backend dependencies (uv sync)
	cd backend && uv sync

install-frontend: ## Install frontend dependencies (npm install)
	cd frontend && npm install

# A dev database is an ordinary SQLite file with no schema of its own: prod
# builds it with `alembic upgrade head` (see docker-entrypoint.sh), and the
# app's lifespan only calls create_all when a test opts in via
# DTASKS_AUTO_CREATE_SCHEMA. So a fresh clone starts, binds the port, and then
# 500s on every request with "no such table: users" unless something runs the
# migrations first. Every target that starts the backend depends on this one.
db-upgrade: ## Bring the dev database schema up to date (alembic upgrade head)
	cd backend && uv run alembic upgrade head

test: test-backend test-frontend ## Run backend + frontend test suites

test-backend: ## Run backend tests (pytest)
	cd backend && uv run pytest

test-frontend: ## Run frontend tests (vitest + Playwright)
	cd frontend && npm test

test-e2e: ## Run only the end-to-end tests (Playwright starts the servers itself)
	cd frontend && npx playwright test

dev-backend: db-upgrade ## Run backend in the foreground (Ctrl+C to stop)
	cd backend && DTASKS_INVITE_CODE=test-invite-code uv run litestar --app app.main:app run --port $(DEV_BACKEND_PORT) --reload

# What Playwright's webServer starts. Two differences from dev-backend: no
# --reload, whose child process outlives the SIGTERM Playwright sends at
# teardown and leaves the port held; and `exec`, so the signal reaches uvicorn
# instead of the wrapping shell.
e2e-backend: db-upgrade ## Backend for Playwright (no reload, clean teardown)
	cd backend && exec env DTASKS_INVITE_CODE=test-invite-code uv run litestar --app app.main:app run --port $(DEV_BACKEND_PORT)

dev-frontend: ## Run frontend dev server in the foreground (Ctrl+C to stop)
	cd frontend && npm run dev

start: db-upgrade ## Start backend + frontend in the background
	@mkdir -p $(RUN_DIR)
	@if [ -f $(RUN_DIR)/backend.pid ] && kill -0 $$(cat $(RUN_DIR)/backend.pid) 2>/dev/null; then \
		echo "backend already running (pid $$(cat $(RUN_DIR)/backend.pid))"; \
	else \
		bash -c 'cd backend && exec env DTASKS_INVITE_CODE=test-invite-code uv run litestar --app app.main:app run --port $(DEV_BACKEND_PORT) --reload' > $(RUN_DIR)/backend.log 2>&1 & \
		echo $$! > $(RUN_DIR)/backend.pid; \
		echo "backend started (pid $$(cat $(RUN_DIR)/backend.pid))"; \
	fi
	@if [ -f $(RUN_DIR)/frontend.pid ] && kill -0 $$(cat $(RUN_DIR)/frontend.pid) 2>/dev/null; then \
		echo "frontend already running (pid $$(cat $(RUN_DIR)/frontend.pid))"; \
	else \
		bash -c 'cd frontend && exec npm run dev' > $(RUN_DIR)/frontend.log 2>&1 & \
		echo $$! > $(RUN_DIR)/frontend.pid; \
		echo "frontend started (pid $$(cat $(RUN_DIR)/frontend.pid))"; \
	fi
	@echo "backend:  http://localhost:$(DEV_BACKEND_PORT)"
	@echo "frontend: http://localhost:5173"

stop: ## Stop backend + frontend
	@if [ -f $(RUN_DIR)/backend.pid ]; then \
		pid=$$(cat $(RUN_DIR)/backend.pid); \
		pkill -TERM -P $$pid 2>/dev/null; \
		kill -TERM $$pid 2>/dev/null && echo "stopped backend (pid $$pid)" || echo "backend not running"; \
		rm -f $(RUN_DIR)/backend.pid; \
	else echo "backend not running"; fi
	@if [ -f $(RUN_DIR)/frontend.pid ]; then \
		pid=$$(cat $(RUN_DIR)/frontend.pid); \
		pkill -TERM -P $$pid 2>/dev/null; \
		kill -TERM $$pid 2>/dev/null && echo "stopped frontend (pid $$pid)" || echo "frontend not running"; \
		rm -f $(RUN_DIR)/frontend.pid; \
	else echo "frontend not running"; fi

restart: stop start ## Restart backend + frontend

status: ## Show backend/frontend running status
	@if [ -f $(RUN_DIR)/backend.pid ] && kill -0 $$(cat $(RUN_DIR)/backend.pid) 2>/dev/null; then \
		echo "backend:  running (pid $$(cat $(RUN_DIR)/backend.pid), http://localhost:$(DEV_BACKEND_PORT))"; \
	else echo "backend:  stopped"; fi
	@if [ -f $(RUN_DIR)/frontend.pid ] && kill -0 $$(cat $(RUN_DIR)/frontend.pid) 2>/dev/null; then \
		echo "frontend: running (pid $$(cat $(RUN_DIR)/frontend.pid), http://localhost:5173)"; \
	else echo "frontend: stopped"; fi

logs: ## Tail backend + frontend logs together
	@tail -f $(RUN_DIR)/backend.log $(RUN_DIR)/frontend.log

logs-backend: ## Tail backend log
	@tail -f $(RUN_DIR)/backend.log

logs-frontend: ## Tail frontend log
	@tail -f $(RUN_DIR)/frontend.log

clean: stop ## Stop services and remove .run directory (logs + pid files)
	rm -rf $(RUN_DIR)

docker-build: ## Build the production image with the current commit baked in as the UI version badge
	GIT_SHA=$$(git rev-parse --short HEAD) docker compose build

.DEFAULT_GOAL := help
