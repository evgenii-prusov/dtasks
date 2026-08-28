# DTask — Jedi Techniques task tracker

A task tracker inspired by Maxim Dorofeev's *Jedi Techniques*, built from the
Claude Design prototype in `project/FlowTask.html` (design transcripts in `chats/`).

**Core ideas:**

- **Inbox** — one place to park an idea without deciding anything about it. Quick
  add with no `#tag` files here rather than asking Work or Personal; Review then
  opens on the Inbox, where each parked task is filed into a project (or
  scheduled, or dropped).
- **Today** — the day's working set, with a **Must Have** section (max 2 tasks,
  marked 🔥) so you always know where to start.
- **Plan** — browse every open task grouped by project and assign it to Today or
  This Week; the 2-must-have limit is enforced by the backend.
- **Review** — walk through the Inbox and then all projects, against a single
  session-wide countdown (5 min × number of phases). The Inbox comes first, with
  a "File to…" picker on every parked task. Description, open tasks (checkable, editable
  inline, reorderable), completed tasks, and editable notes per project.
- **Habits** — GitHub-style contribution grid (16 weeks) with three states per
  day (none / minimal / complete), streak and total counters, click any past
  cell to cycle its state.
- **Work Log** — a daily engineering record aimed at review season rather than
  at execution: what you did, sorted into shipped / operational / glue &
  mentorship / learning, with the evidence attached (PR and RFC links, the
  impact, the problem context) and a two-tap energy/friction signal for the day.
  Weekly and monthly rollups are computed server-side from that history. A task
  finished today can be promoted into an entry in one click.

Plus per-project pages, a light/dark theme toggle, and an English/Russian
language toggle (persisted, defaulting to the browser language).

## Stack

- **Backend:** Python, [Litestar](https://litestar.dev), SQLAlchemy 2 (async), SQLite
- **Frontend:** React 19, TypeScript, TanStack Router + Query, Tailwind CSS 4, Vite

## Development

```sh
make install    # uv sync + npm install
make start      # backend + frontend in the background
make status     # what is running, and where
make logs       # tail both logs
make stop
```

The backend serves the API on `:8010` — not `:8000`, to avoid clashing with
sibling local projects that default there too — and the Vite dev server runs on
`:5173`, proxying `/api` to it. `make start` runs `alembic upgrade head` first,
so a fresh clone gets its schema; starting the backend by hand without that
leaves you with a running server that answers every request with
`no such table: users`. Accounts are created through the normal signup form,
which asks for an invite code: in development it is `test-invite-code`, set by
the make targets via `DTASKS_INVITE_CODE`. Each new account is seeded with
starter projects and habits.

To run either half in the foreground instead, use `make dev-backend` or
`make dev-frontend`.

Tests:

```sh
make test       # backend pytest + frontend vitest and Playwright
make test-e2e   # end-to-end only; Playwright starts the servers itself
```

## Production

Build the frontend, then the Litestar app serves it as static files with an
SPA fallback:

```sh
cd frontend && npm run build
cd ../backend && uv run litestar --app app.main:app run --port 8010
# open http://localhost:8010
```

For an actual internet-facing deployment (Docker + Caddy for automatic HTTPS),
see [`docs/deploy.md`](docs/deploy.md).

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
| GET    | `/api/worklog/entries`        | Work log entries in a date range (`?start=&end=`) |
| POST   | `/api/worklog/entries`        | Create an entry, with its evidence links   |
| PATCH  | `/api/worklog/entries/{id}`   | Update an entry (`links`, when sent, replaces them wholesale) |
| DELETE | `/api/worklog/entries/{id}`   | Delete an entry and its links              |
| GET    | `/api/worklog/days`           | Day signals in a date range                |
| PUT    | `/api/worklog/day`            | Upsert a day's energy / friction / note (0 = unrated, 1–5) |
| GET    | `/api/worklog/rollup`         | Weekly or monthly aggregation (`?period=week\|month&start=&end=`) |
| POST   | `/api/auth/signup`            | Email + password + invite code signup      |
| POST   | `/api/auth/login`             | Email + password login                     |
| POST   | `/api/auth/logout`            | Clear the session                          |
| GET    | `/api/auth/me`                | Current signed-in user                     |
| GET    | `/api/auth/oauth/{provider}/login` | Start Google/GitHub OAuth login, redirects to the provider |
| GET    | `/api/auth/oauth/{provider}/callback` | Provider redirects back here to complete OAuth login |
| GET    | `/api/auth/providers`         | `{google, github}` — which OAuth providers are configured |
| POST   | `/api/events`                 | Batch of browser-reported usage events (max 50) |

Rules mirrored from the design: marking a task Must Have also assigns it to
Today; removing it from Today clears Must Have; at most 2 active Must Have
tasks per day.

Every account has exactly one Inbox: a server-managed project named `Inbox` in a
group of its own, always returned first by `GET /api/projects`. It is created on
demand, so accounts that predate it get one on their next read, and it cannot be
renamed, moved between groups, or deleted (`POST /api/projects` also refuses the
`Inbox` group). Filing a parked task is an ordinary
`PATCH /api/tasks/{id} {"project_id": …}`.

Full auth design (sessions, OAuth flow, account-linking rules): [`docs/auth.md`](docs/auth.md).

## Usage analytics

Every mutating request and every keyboard/mouse interaction is recorded to an
append-only `events` table, so you can see which features are actually used —
and in particular track a mouse-to-keyboard migration over time. No free text
(search queries, task titles) is ever stored. Set `DTASKS_ANALYTICS_ENABLED=0`
to turn it off.

Event dictionary, ready-made SQL and dbt notes: [`docs/analytics.md`](docs/analytics.md).

## Design source

- `project/FlowTask.html` — the original HTML/CSS/JS prototype (design system source of truth)
- `chats/` — the design conversation transcripts
