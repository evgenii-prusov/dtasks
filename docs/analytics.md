# Feature-usage analytics

DTask records what you *did*, not just what your data looks like, so you can
tell which features work and which don't. Everything lands in one append-only
`events` table in the app's SQLite database.

The question this exists to answer first is **"am I moving from mouse to
keyboard?"** — as a trend over weeks. The schema is shaped around that.

## How it works

Two sources feed one table, split so nothing is counted twice:

| Source | Records | Where |
| --- | --- | --- |
| Backend middleware | Every mutating `/api` request — create/update/delete/reorder of tasks, projects, habits, recurrences, plus auth | `backend/app/analytics.py` |
| Browser | What the server cannot see: navigation, search, hotkeys, command palette, undo, preferences | `frontend/src/lib/analytics.ts` |

**The frontend never re-emits a mutation.** If it is an HTTP mutation, the
server owns it.

That split is what makes the migration measurable. Clicking a checkbox and
pressing `x` both arrive as `PATCH /api/tasks/{id}`, so the backend records the
*same event* either way — the only difference is the `X-DTask-Input` header the
browser attaches. Keyboard share is then a ratio over one event name, not a
correlation between two different streams.

Disable the whole thing with `DTASKS_ANALYTICS_ENABLED=0`.

## Privacy rule

**No free text, ever.** Props carry derived values — `query_length`,
`result_count`, `had_results` — never the search string or the task title.

This is enforced, not just documented. `sanitize_props()` keeps scalars only,
caps props at 12 keys, truncates strings to 64 characters, and drops nested
objects and lists of non-strings. A call site that passes a task title has it
dropped rather than quietly stored.

## Schema

| Column | Notes |
| --- | --- |
| `id` | Monotonic. Use as the incremental cursor: `where id > (select max(id) from ...)` |
| `event_id` | Client UUID, unique. Dedup key — a retried flush inserts nothing twice |
| `user_id` | FK to `users`, cascade delete |
| `session_id` | Per browser tab. Lets a hotkey miss be tied to the mouse action that followed |
| `occurred_at` | Client clock — skewable, so prefer `received_at` for ordering |
| `received_at` | Server clock. Authoritative |
| `source` | `web` (browser) or `api` (middleware) |
| `input` | `keyboard` / `mouse` / `touch` / `pen` / `unknown`. A column, not a prop — every migration query filters on it |
| `name` | e.g. `task.update`, `hotkey.use` |
| `entity_type`, `entity_id` | `task` / `project` / `habit` / `recurrence` |
| `surface` | `today`, `plan`, `review`, `habits`, `report`, `project`, `quick_add`, `sidebar`, `palette`, `help` |
| `props` | JSON object of scalars |
| `app_version` | Git SHA, so a regression can be dated to a deploy |
| `schema_version` | Bump when the taxonomy changes; old rows stay interpretable |

Rows are **only ever inserted**. Never update them.

## Event dictionary

### Backend (`source = 'api'`)

All carry `props.status` and `props.ok`. 4xx responses are recorded too —
hitting the 2-must-have limit is exactly the friction worth seeing.

| Name | Fires when | Notable props |
| --- | --- | --- |
| `task.create` | `POST /api/projects/{id}/tasks` | `project_id` |
| `task.update` | `PATCH /api/tasks/{id}` | `fields` — which fields the patch carried |
| `task.delete`, `task.reorder` | | |
| `project.create/update/delete/reorder` | | |
| `recurrence.create/update/delete` | | |
| `habit.create/delete`, `habit.log` | | |
| `auth.signup/login/logout` | | |

`task.update` is the one route that under-describes itself — completing,
scheduling, prioritizing, moving and renaming all arrive as the same PATCH.
`props.fields` separates them, so filter on it:

```sql
-- completions only
WHERE name = 'task.update' AND json_extract(props, '$.fields') = '["completed"]'
```

### Browser (`source = 'web'`)

| Name | Fires when | Props |
| --- | --- | --- |
| `nav.view` | Route resolved | `to`, `via` (`sidebar`/`hotkey`/`palette`/`url`) |
| `hotkey.use` | A shortcut fired | `name`, `chord`, `layer` |
| `hotkey.miss` | A real shortcut fired *nothing* | `chord`, `blocked` |
| `search.query` | Plan search, debounced 400ms | `query_length`, `result_count` |
| `search.enter_results` | Diving into results from the search box | `via`, `result_count` |
| `search.clear` | | `via` (`escape`/`button`) |
| `palette.open` | | `via` (`mod+k`/`slash`/`click`) |
| `palette.query` | Debounced 400ms | `query_length`, `result_count`, `top_kind` |
| `palette.select` | An item was run | `kind`, `rank`, `query_length` |
| `palette.dismiss` | Closed without picking | `query_length`, `had_results` |
| `help.open` | Shortcuts overlay opened | `via` |
| `quickadd.submit` | | `resolved`, `had_hash`, `repeating`, `weekday_count` |
| `quickadd.autocomplete_shown` / `_select` | `#tag` dropdown | `option_count` / `is_new` |
| `quickadd.group_prompt_shown` / `_choice` | Work/Personal prompt | `had_hash` / `group` |
| `undo.shown`, `undo.used` | Undo toast | |
| `review.start`, `review.finish` | Review session | `project_count`, `reached_index` |
| `habit.cell_click` | Heatmap cell cycled | `state_from`, `state_to`, `days_ago` |
| `pref.theme`, `pref.lang` | | `to` |

## Queries

### The trend line: weekly keyboard share

Defined over **dual-path actions only** — the ones you can do either way.
Including keyboard-only actions (typing a title) or pointer-only ones (the habit
heatmap) would make this measure which *features* you used rather than how you
drove them. The list lives in `DUAL_PATH_EVENTS` in `backend/app/analytics.py`.

```sql
WITH dual AS (
  SELECT * FROM events
  WHERE name IN ('task.create','task.update','task.delete','task.reorder','nav.view')
    AND input IN ('keyboard','mouse')   -- excludes touch and unknown
)
SELECT strftime('%Y-W%W', received_at) AS week,
       COUNT(*)                        AS actions,
       SUM(input = 'keyboard')         AS keyboard,
       ROUND(100.0 * SUM(input = 'keyboard') / COUNT(*), 1) AS keyboard_pct
FROM dual
GROUP BY week
ORDER BY week;
```

### Where the migration is stuck: per-action breakdown

```sql
SELECT name,
       SUM(input = 'keyboard') AS keyboard,
       SUM(input = 'mouse')    AS mouse,
       ROUND(100.0 * SUM(input = 'keyboard') /
             NULLIF(SUM(input IN ('keyboard','mouse')), 0), 1) AS keyboard_pct
FROM events
WHERE input IN ('keyboard','mouse')
GROUP BY name
ORDER BY keyboard_pct;
```

Completing tasks may be keyboard-first while reordering never is. The bottom of
this list is your worklist.

### Migration blockers: a miss, then a mouse fallback

The highest-value query here. A shortcut that fired nothing, followed within ten
seconds by a mouse action in the same session, is a concrete obstacle to going
keyboard-only.

```sql
SELECT json_extract(m.props, '$.chord') AS chord,
       json_extract(m.props, '$.blocked') AS blocked,
       m.surface,
       COUNT(*) AS fallbacks
FROM events m
JOIN events a
  ON a.session_id = m.session_id
 AND a.id > m.id
 AND a.input = 'mouse'
 AND julianday(a.received_at) - julianday(m.received_at) < 10.0 / 86400
WHERE m.name = 'hotkey.miss'
GROUP BY chord, blocked, m.surface
ORDER BY fallbacks DESC;
```

`blocked = 1` means focus was in a text field. Those are usually fixable by
letting the binding through with `allowInInput`.

### Shortcut adoption: tried once vs. actually adopted

```sql
SELECT json_extract(props, '$.name') AS shortcut,
       COUNT(*)                      AS uses,
       COUNT(DISTINCT date(received_at)) AS days_used,
       MIN(date(received_at))        AS first_use,
       MAX(date(received_at))        AS last_use
FROM events
WHERE name = 'hotkey.use' AND json_extract(props, '$.name') IS NOT NULL
GROUP BY shortcut
ORDER BY days_used DESC, uses DESC;
```

`days_used = 1` with a `first_use` weeks ago means you tried it and it never
stuck.

### Which affordance wins for navigation

```sql
SELECT json_extract(props, '$.via') AS via, input, COUNT(*) AS n
FROM events WHERE name = 'nav.view'
GROUP BY via, input ORDER BY n DESC;
```

### Does search lead to action?

```sql
SELECT
  SUM(name = 'search.query')         AS searches,
  SUM(name = 'search.enter_results') AS acted_on,
  SUM(name = 'search.query' AND json_extract(props,'$.result_count') = 0) AS empty
FROM events WHERE name LIKE 'search.%';
```

### Is the palette ranking any good?

```sql
SELECT json_extract(props,'$.kind') AS kind,
       json_extract(props,'$.rank') AS rank,
       COUNT(*) AS n
FROM events WHERE name = 'palette.select'
GROUP BY kind, rank ORDER BY kind, rank;
```

Selections clustered at rank 0 mean the scorer is good. A fat tail means the top
hit is usually wrong.

## Caveats

- **Mobile has no keyboard.** Touch sessions must be excluded from the migration
  ratio or they drag it down as a function of how much phone use happened that
  week. The queries above filter `input IN ('keyboard','mouse')`, which drops
  `touch` and `pen`.
- **`input = 'unknown'` is a data-quality canary**, not a third category. It
  means no gesture happened within 2s of the action — a background refetch, a
  lazily generated recurrence. If it climbs above a few percent of *user*
  actions, the modality tracker is mis-attributing something.
- **`occurred_at` comes from the client clock.** Order by `received_at`.

## Reading the data with dbt

The table is built to be a dbt source: immutable rows, a monotonic `id` cursor,
and `event_id` as a dedup key.

```yaml
# models/staging/_sources.yml
sources:
  - name: dtask
    schema: main
    tables:
      - name: events
```

```sql
-- models/staging/stg_events.sql
{{ config(materialized='incremental', unique_key='event_id') }}

SELECT
  id, event_id, user_id, session_id,
  received_at, occurred_at, source, input, name,
  entity_type, entity_id, surface, app_version,
  json_extract(props, '$.status') AS status,
  json_extract(props, '$.via')    AS via,
  props
FROM {{ source('dtask', 'events') }}
{% if is_incremental() %}
  WHERE id > (SELECT COALESCE(MAX(id), 0) FROM {{ this }})
{% endif %}
```

**Point dbt at a snapshot, not the live database.** The app writes to
`dtasks.sqlite` in WAL mode while dbt reads; use the existing backup instead:

```sh
python scripts/backup_db.py           # produces a consistent copy
```

Then set the `dbt-sqlite` profile's `database` to that copy.
`dbt-sqlite` attaches multiple files as schemas, so if the events table ever
outgrows the app database and moves to its own file, models keep working with
only a profile change.

Make `DUAL_PATH_EVENTS` a seed so the metric definition lives in one place:

```csv
# seeds/dual_path_events.csv
event_name
task.create
task.update
task.delete
task.reorder
nav.view
```
