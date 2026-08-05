"""Feature-usage analytics: append-only event capture.

Two sources feed one ``events`` table, with a deliberate split:

* **This middleware** records every mutating ``/api`` request. It is the ground
  truth for CRUD -- a request that happened is a feature that was used, and it
  cannot be missed the way a forgotten frontend call site can.
* **The browser** posts what the server cannot see (navigation, search, hotkeys,
  the command palette) to ``POST /api/events``.

The frontend never re-emits a mutation, so the two streams do not double count.

The point of recording CRUD server-side is that the resulting event is identical
whichever way the user triggered it: clicking a checkbox and pressing ``x`` both
arrive as ``PATCH /api/tasks/{id}``. Modality lives in the ``X-DTask-Input``
header, so "what fraction of completions were keyboard-driven" is one ratio over
one event name rather than a fragile correlation between two different streams.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import UTC, datetime
from typing import Any

from litestar import Request, post
from litestar.enums import ScopeType
from litestar.exceptions import ClientException
from litestar.middleware import ASGIMiddleware
from litestar.types import ASGIApp, Message, Receive, Scope, Send
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from . import db
from .models import Event, User
from .schemas import EventBatchIn

# ── Limits ────────────────────────────────────────────────────────────────

MAX_BATCH = 50
MAX_PROP_KEYS = 12
MAX_KEY_LEN = 32
MAX_STR_LEN = 64
MAX_LIST_ITEMS = 10

SCHEMA_VERSION = 1

INPUT_MODALITIES = frozenset({"keyboard", "mouse", "touch", "pen"})
UNKNOWN_INPUT = "unknown"

SURFACES = frozenset(
    {"today", "plan", "review", "habits", "report", "project", "quick_add", "sidebar", "palette", "help"}
)

# ── Taxonomy ──────────────────────────────────────────────────────────────

#: Events the browser is allowed to report. An allow-list rather than free text
#: so the table cannot accumulate typo'd names that downstream models then have
#: to reconcile. Backend-emitted names live in ROUTE_EVENTS and are not accepted
#: from clients -- a browser must not be able to forge a "task.create".
CLIENT_EVENT_NAMES = frozenset(
    {
        "nav.view",
        "search.query",
        "search.enter_results",
        "search.clear",
        "hotkey.use",
        "hotkey.miss",
        "palette.open",
        "palette.query",
        "palette.select",
        "palette.dismiss",
        "help.open",
        "quickadd.autocomplete_shown",
        "quickadd.autocomplete_select",
        "quickadd.submit",
        "quickadd.group_prompt_shown",
        "quickadd.group_prompt_choice",
        "undo.shown",
        "undo.used",
        "review.start",
        "review.finish",
        "habit.cell_click",
        "pref.theme",
        "pref.lang",
    }
)

#: (method, normalized path) -> (event name, entity type, path id *is* the entity).
#:
#: When the last flag is False the path's id identifies the *parent* project
#: rather than the thing being created, so it is recorded as a prop instead of
#: as entity_id. Both such routes nest under /api/projects/{id}.
ROUTE_EVENTS: dict[tuple[str, str], tuple[str, str | None, bool]] = {
    ("POST", "/api/projects"): ("project.create", "project", False),
    ("PATCH", "/api/projects/{id}"): ("project.update", "project", True),
    ("DELETE", "/api/projects/{id}"): ("project.delete", "project", True),
    ("POST", "/api/projects/{id}/reorder"): ("project.reorder", "project", True),
    ("POST", "/api/projects/{id}/tasks"): ("task.create", "task", False),
    ("PATCH", "/api/tasks/{id}"): ("task.update", "task", True),
    ("DELETE", "/api/tasks/{id}"): ("task.delete", "task", True),
    ("POST", "/api/tasks/{id}/reorder"): ("task.reorder", "task", True),
    ("POST", "/api/projects/{id}/recurrences"): ("recurrence.create", "recurrence", False),
    ("PATCH", "/api/recurrences/{id}"): ("recurrence.update", "recurrence", True),
    ("DELETE", "/api/recurrences/{id}"): ("recurrence.delete", "recurrence", True),
    ("POST", "/api/habits"): ("habit.create", "habit", False),
    ("PUT", "/api/habits/{id}/log"): ("habit.log", "habit", True),
    ("DELETE", "/api/habits/{id}"): ("habit.delete", "habit", True),
    ("POST", "/api/auth/signup"): ("auth.signup", None, False),
    ("POST", "/api/auth/login"): ("auth.login", None, False),
    ("POST", "/api/auth/logout"): ("auth.logout", None, False),
}

#: Actions reachable by both mouse and keyboard. The migration metric is defined
#: over exactly these -- including keyboard-only actions (typing a title) or
#: pointer-only ones (the habit heatmap) would make the ratio a measure of which
#: features were used rather than how they were driven. Kept here so the docs and
#: any downstream model read the same list.
DUAL_PATH_EVENTS = frozenset(
    {
        "task.create",
        "task.update",
        "task.delete",
        "task.reorder",
        "nav.view",
    }
)


def analytics_enabled() -> bool:
    return os.environ.get("DTASKS_ANALYTICS_ENABLED", "1") != "0"


# ── Sanitizing ────────────────────────────────────────────────────────────


def sanitize_props(raw: Any) -> str | None:
    """Reduce client-supplied props to a small JSON object of scalars.

    Deliberately lossy. Free text never belongs in this table -- a call site that
    passes a task title or a search query should have that value dropped here
    rather than quietly stored, so the privacy rule holds even when a call site
    gets it wrong.
    """
    if not isinstance(raw, dict) or not raw:
        return None

    clean: dict[str, Any] = {}
    for key, value in list(raw.items())[:MAX_PROP_KEYS]:
        if not isinstance(key, str) or len(key) > MAX_KEY_LEN:
            continue
        if isinstance(value, bool) or isinstance(value, int) or isinstance(value, float):
            clean[key] = value
        elif isinstance(value, str):
            clean[key] = value[:MAX_STR_LEN]
        elif value is None:
            clean[key] = None
        elif isinstance(value, list):
            # Only lists of short strings, for things like the changed-field list.
            items = [v[:MAX_STR_LEN] for v in value[:MAX_LIST_ITEMS] if isinstance(v, str)]
            if items:
                clean[key] = items
        # Anything else (dicts, nested structures) is dropped.

    return json.dumps(clean, separators=(",", ":")) if clean else None


def _clean_input(value: Any) -> str:
    return value if isinstance(value, str) and value in INPUT_MODALITIES else UNKNOWN_INPUT


def _clean_surface(value: Any) -> str | None:
    return value if isinstance(value, str) and value in SURFACES else None


def _clean_str(value: Any, limit: int) -> str | None:
    return value[:limit] if isinstance(value, str) and value else None


# ── Request annotation ────────────────────────────────────────────────────


def annotate(request: Request, **props: Any) -> None:
    """Attach extra props to the event this request will emit.

    For handlers whose URL under-describes what happened -- ``PATCH
    /api/tasks/{id}`` is completing, scheduling, prioritizing, moving or renaming,
    which are five different features wearing one route.
    """
    state = request.scope.setdefault("state", {})
    state.setdefault("analytics_props", {}).update(props)


# ── Writing ───────────────────────────────────────────────────────────────


async def record_events(session: AsyncSession, rows: list[dict[str, Any]]) -> None:
    """Insert events, ignoring any whose event_id was already stored.

    ON CONFLICT DO NOTHING makes a retried batch idempotent, which matters
    because the browser flushes on page-hide and may resend after a failure.
    """
    if not rows:
        return
    await session.execute(sqlite_insert(Event).on_conflict_do_nothing(index_elements=["event_id"]), rows)
    await session.commit()


def _normalize_path(path: str) -> tuple[str, int | None]:
    """`/api/tasks/123` -> (`/api/tasks/{id}`, 123). Returns the last numeric segment."""
    parts = path.rstrip("/").split("/")
    last_id: int | None = None
    for i, part in enumerate(parts):
        if part.isdigit():
            last_id = int(part)
            parts[i] = "{id}"
    return "/".join(parts), last_id


def _user_id_from_scope(scope: Scope) -> int | None:
    user = scope.get("user")
    user_id = getattr(user, "id", None)
    if isinstance(user_id, int):
        return user_id
    # Signup and login authenticate *during* the handler, after the auth
    # middleware has already run, so scope["user"] is still empty for them.
    session = scope.get("session")
    if isinstance(session, dict) and isinstance(session.get("user_id"), int):
        return session["user_id"]
    return None


class AnalyticsMiddleware(ASGIMiddleware):
    """Records one event per mutating /api request, after the response is sent.

    Failures here are swallowed: analytics must never break a user request, and a
    lost event is much cheaper than a 500 on a task update.
    """

    scopes = (ScopeType.HTTP,)

    async def handle(self, scope: Scope, receive: Receive, send: Send, next_app: ASGIApp) -> None:
        method: str = scope.get("method", "")
        path: str = scope.get("path", "")

        # The ingest endpoint is itself a POST; recording it would be pure noise.
        if (
            not analytics_enabled()
            or method in ("GET", "HEAD", "OPTIONS")
            or not path.startswith("/api")
            or path.rstrip("/") == "/api/events"
        ):
            await next_app(scope, receive, send)
            return

        status = 0

        async def send_wrapper(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        await next_app(scope, receive, send_wrapper)

        # Response bytes are already flushed by this point, so the insert adds no
        # latency the user can perceive. Reading scope now also means the auth
        # middleware has populated scope["user"], whatever the middleware order.
        try:
            await self._record(scope, method, path, status)
        except Exception:  # noqa: BLE001 - never surface analytics failures
            pass

    async def _record(self, scope: Scope, method: str, path: str, status: int) -> None:
        template, path_id = _normalize_path(path)
        mapped = ROUTE_EVENTS.get((method, template))
        if mapped is None:
            return
        name, entity_type, id_is_entity = mapped

        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}

        state = scope.get("state") or {}
        props: dict[str, Any] = dict(state.get("analytics_props") or {})
        props["status"] = status
        # 4xx are kept, not filtered: "user hit the 2-must-have limit" is exactly
        # the kind of friction this table exists to surface.
        props["ok"] = 200 <= status < 300
        if not id_is_entity and path_id is not None:
            props["project_id"] = path_id

        row = {
            "event_id": str(uuid.uuid4()),
            "user_id": _user_id_from_scope(scope),
            "session_id": None,
            "occurred_at": datetime.now(UTC),
            "received_at": datetime.now(UTC),
            "source": "api",
            "input": _clean_input(headers.get("x-dtask-input")),
            "name": name,
            "entity_type": entity_type,
            "entity_id": path_id if id_is_entity else None,
            "surface": _clean_surface(headers.get("x-dtask-surface")),
            "props": sanitize_props(props),
            "app_version": _clean_str(headers.get("x-dtask-version"), 40),
            "schema_version": SCHEMA_VERSION,
        }

        async with db.session_factory() as db_session:
            await record_events(db_session, [row])


# ── Ingest ────────────────────────────────────────────────────────────────


@post("/api/events", status_code=204)
async def ingest_events(data: EventBatchIn, session: AsyncSession, user: User) -> None:
    """Accept a batch of browser-reported events.

    Authenticated implicitly: the session-auth exclude regex only exempts
    non-/api paths, so an anonymous post is rejected with 401 before arriving.
    """
    if not analytics_enabled():
        return
    if len(data.events) > MAX_BATCH:
        raise ClientException(detail=f"At most {MAX_BATCH} events per batch")

    now = datetime.now(UTC)
    rows: list[dict[str, Any]] = []
    for event in data.events:
        if event.name not in CLIENT_EVENT_NAMES:
            raise ClientException(detail=f"Unknown event name: {event.name}")
        event_id = _clean_str(event.event_id, 36)
        if event_id is None:
            raise ClientException(detail="event_id is required")
        rows.append(
            {
                "event_id": event_id,
                "user_id": user.id,
                "session_id": _clean_str(event.session_id, 36),
                "occurred_at": event.occurred_at,
                "received_at": now,
                "source": "web",
                "input": _clean_input(event.input),
                "name": event.name,
                "entity_type": _clean_str(event.entity_type, 20),
                "entity_id": event.entity_id if isinstance(event.entity_id, int) else None,
                "surface": _clean_surface(event.surface),
                "props": sanitize_props(event.props),
                "app_version": _clean_str(event.app_version, 40),
                "schema_version": SCHEMA_VERSION,
            }
        )

    await record_events(session, rows)
