# MCP connector — design & reference

This document is the agreed design for exposing dtasks to Claude (claude.ai on
the web and the Claude iOS/Android apps) as a **remote MCP custom connector**.
It is tracked as a beads epic (see `bd search mcp`). Implementation tasks
reference sections of this file by number — keep the numbering stable.

Stack context: see `docs/auth.md` header. Session/OAuth-login auth for the SPA
is described in `docs/auth.md`; this document adds a second, independent auth
path for machine clients (Claude).

---

## 1. Goals and non-goals

**Goals**

- Any dtasks user can add `https://<DOMAIN>/mcp` as a custom connector on
  claude.ai, sign in with their existing dtasks login, and then use dtasks from
  any device where their Claude account is signed in (connectors added on the
  web sync to the mobile apps).
- Each connection acts as exactly one dtasks user; the existing per-user
  isolation applies unchanged.
- Read/write: capture, plan, and complete tasks; log habits; write work-log
  entries.

**Non-goals (v1)**

- Delete operations of any kind.
- Managing projects, recurrence rules, creating habits, reordering, analytics.
- Per-user timezones (see §7).
- Local/stdio MCP for Claude Desktop/Code (the remote server works there too).

## 2. Architecture

- The MCP server runs **inside the existing Litestar app**, using the official
  `mcp` Python SDK's Streamable HTTP transport, mounted as an ASGI app at
  `/mcp`. No new container, process, or Caddy route.
- Tools call the same SQLAlchemy query/mutation code the REST handlers use,
  scoped by the authenticated user id. Where that logic currently lives inline
  in a route handler, extract it to a function both can call — don't duplicate.
- Gated by `DTASKS_MCP_ENABLED` (default off). When off, `/mcp`, the OAuth
  endpoints, and the well-known metadata are not mounted.

## 3. Authorization server

dtasks acts as its own OAuth 2.1 authorization server, built on the `mcp`
SDK's auth support: we implement its `OAuthAuthorizationServerProvider`
interface on top of our own tables; the SDK supplies metadata, registration,
authorize/token endpoints and bearer-token verification in the shape claude.ai
expects. If the SDK's root-level `/.well-known/...` routes collide with the SPA
fallback, register explicit Litestar routes for them.

### 3.1 Metadata

- `/.well-known/oauth-authorization-server` and
  `/.well-known/oauth-protected-resource`, issuer = `DTASKS_PUBLIC_URL`.
- Unauthenticated `/mcp` requests get `401` with a `WWW-Authenticate` header
  pointing at the protected-resource metadata.

### 3.2 Client registration

- Dynamic Client Registration (RFC 7591) is enabled, but a registration is
  accepted **only if every `redirect_uri` is on the allowlist**.
- Allowlist default: `https://claude.ai/api/mcp/auth_callback`,
  `https://claude.com/api/mcp/auth_callback`. Override with
  `DTASKS_MCP_REDIRECT_ALLOWLIST` (comma-separated).
- Public clients with PKCE (S256) required.

### 3.3 Authorize + consent

1. Claude sends the user to the authorize endpoint.
2. No dtasks session → redirect to the normal login (`/welcome`, password or
   Google/GitHub), then back to the pending authorization.
3. Logged in → SPA consent page: "Claude wants access to your dtasks" with
   Allow / Deny. Never auto-approve — otherwise any link to the authorize URL
   would silently grant access.
4. Allow → authorization code (short-lived, single use) issued to the
   registered redirect URI.

### 3.4 Tokens

- Opaque random strings; only a hash (SHA-256) is stored.
- Access token: 1 hour. Refresh token: 90 days, **rotated** on every use.
- Reuse of an already-rotated refresh token revokes the whole grant.
- Single scope: `dtasks` (full read/write to the user's own data).
- Storage: new tables for registered clients, grants (user × client), and
  tokens, added by an Alembic migration. Revoking a grant invalidates all of
  its tokens.

### 3.5 Connected apps

A "Connected apps" section in Settings lists the user's grants (client name,
created, last used) with a Revoke button. Backed by
`GET /api/mcp/grants` and `DELETE /api/mcp/grants/{id}` (session auth).

## 4. Tools (v1)

Intent-level, small set. Task objects returned by every tool include:
`id`, `title`, `notes`, `project`, `plan` (`today` | `week` | `backlog`),
`green`, `must_have`, `complexity` (`low` | `high`), `completed`.

`plan` maps to the existing flags: `today` = `assigned_today`, `week` =
`assigned_week`, `backlog` = neither. `green` maps to `is_green` — the tool
description must explain it: a task that moves the user toward their own goals
and dreams, as opposed to reactive work (Dorofeev's "green tasks").

| Tool | Purpose |
| --- | --- |
| `get_today` | Today's tasks plus today's habits with done/not-done |
| `get_week` | This week's tasks |
| `search_tasks(query, project?, include_completed?)` | Find tasks by text |
| `list_projects` | Projects with ids and names |
| `add_task(title, project, notes?, plan?, green?, must_have?, complexity?)` | Create a task |
| `update_task(id, title?, notes?, project?, plan?, green?, must_have?, complexity?)` | Edit / re-plan / move a task |
| `complete_task(id)` / `uncomplete_task(id)` | Toggle completion |
| `list_habits` | Habits with recent log |
| `log_habit(habit, date?, done)` | Mark a habit done/not done for a day |
| `add_worklog_entry(text, date?)` | Add a work-log entry |
| `get_worklog(from, to)` | Read work-log entries |

**References**

- Projects and habits accept a **name (case-insensitive) or id**. No match or
  ambiguous match → tool error listing the valid names, so Claude can retry or
  ask the user.
- Tasks are referenced by `id` only (obtained from search/list results).

## 5. Dates

Tools use the same UTC "today" as the rest of the app (see
`backend/app/main.py`, recurrence generation). `date?` parameters default to
UTC today. Known limitation: near local midnight, "today"/"yesterday" can be
off by one for users east/west of UTC — tracked separately (§7).

## 6. Testing

One `backend/tests/test_mcp.py`, kept short and readable; shared fixtures
(e.g. "a connected Claude client for user X") live in `conftest.py`. Fewer,
meaningful tests over exhaustive per-tool tests — tools are thin wrappers over
logic the REST tests already cover.

1. Happy path: register → authorize → consent → token → `get_today` →
   refresh → call again.
2. OAuth rejections (one test each): non-allowlisted redirect URI; reused
   refresh token revokes the grant; revoked grant → 401.
3. Isolation: user B's token cannot read or modify user A's task.
4. Tool workflow: `add_task` (green, today) → `update_task` →
   `complete_task` → `get_today` reflects each change.

Final acceptance is manual: add the connector on claude.ai, use it from the
iPhone app.

## 7. Configuration & rollout

| Variable | Purpose |
| --- | --- |
| `DTASKS_MCP_ENABLED` | Mount `/mcp`, OAuth endpoints and metadata (default off) |
| `DTASKS_MCP_REDIRECT_ALLOWLIST` | Override allowed OAuth redirect URIs |
| `DTASKS_PUBLIC_URL` | Existing; used as OAuth issuer / resource URL |

User setup: claude.ai → Settings → Connectors → Add custom connector → URL
`https://<DOMAIN>/mcp` → Connect → dtasks login → Allow.

**Follow-up (separate bead):** per-user timezone, so "today" matches the
user's local day across the app and the MCP tools.
