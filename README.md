# DTask — Jedi Techniques task tracker

A task tracker inspired by Maxim Dorofeev's *Jedi Techniques*, built from the
Claude Design prototype in `project/FlowTask.html` (design transcripts in `chats/`).

**Core ideas:**

- **Today** — the day's working set, with a **Must Have** section (max 2 tasks,
  marked 🔥) so you always know where to start.
- **Plan** — browse every open task grouped by project and assign it to Today or
  This Week; the 2-must-have limit is enforced by the backend.
- **Review** — walk through all projects against a single session-wide countdown
  (5 min × number of projects). Description, open tasks (checkable, editable
  inline, reorderable), completed tasks, and editable notes per project.
- **Habits** — GitHub-style contribution grid (16 weeks) with three states per
  day (none / minimal / complete), streak and total counters, click any past
  cell to cycle its state.

Plus per-project pages, a light/dark theme toggle, and an English/Russian
language toggle (persisted, defaulting to the browser language).

## Stack

- **Backend:** Python, [Litestar](https://litestar.dev), SQLAlchemy 2 (async), SQLite
- **Frontend:** React 19, TypeScript, TanStack Router + Query, Tailwind CSS 4, Vite

## Development

Backend (API on `:8000`, database is created and seeded on first start):

```sh
cd backend
uv sync
uv run litestar --app app.main:app run --port 8000
```

Frontend (dev server on `:5173`, proxies `/api` to the backend):

```sh
cd frontend
npm install
npm run dev
```

## Production

Build the frontend, then the Litestar app serves it as static files with an
SPA fallback:

```sh
cd frontend && npm run build
cd ../backend && uv run litestar --app app.main:app run --port 8000
# open http://localhost:8000
```

## API

| Method | Path                          | Purpose                                    |
| ------ | ----------------------------- | ------------------------------------------ |
| GET    | `/api/projects`               | All projects with their tasks              |
| PATCH  | `/api/projects/{id}`          | Update name / group / description / notes  |
| POST   | `/api/projects/{id}/tasks`    | Create a task                              |
| PATCH  | `/api/tasks/{id}`             | Update any task field (enforces must-have limit, returns 409 above it) |
| POST   | `/api/tasks/{id}/reorder`     | Move a task up/down within its project     |
| GET    | `/api/habits`                 | All habits with their day logs             |
| PUT    | `/api/habits/{id}/log`        | Set a day's state (0 none / 1 minimal / 2 complete) |
| DELETE | `/api/habits/{id}`            | Delete a habit and its logs                |

Rules mirrored from the design: marking a task Must Have also assigns it to
Today; removing it from Today clears Must Have; at most 2 active Must Have
tasks per day.

## Design source

- `project/FlowTask.html` — the original HTML/CSS/JS prototype (design system source of truth)
- `chats/` — the design conversation transcripts
