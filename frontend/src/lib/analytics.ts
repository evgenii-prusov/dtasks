/**
 * Queues UI events and flushes them to /api/events in batches.
 *
 * Only reports what the server cannot see for itself -- navigation, search,
 * hotkeys, the command palette. Every mutation already becomes an event via the
 * backend middleware, so re-emitting them here would double count.
 *
 * Never send free text. Props carry derived values (`query_length`,
 * `result_count`, `had_results`) rather than the query or the task title. The
 * server truncates and drops non-scalars as a backstop, but the rule belongs at
 * the call site.
 */

import { currentModality, type InputModality } from './inputModality'

export type EventProps = Record<string, string | number | boolean | null | string[]>

interface QueuedEvent {
  event_id: string
  name: string
  occurred_at: string
  session_id: string
  input: InputModality
  surface: string | null
  props: EventProps | null
  app_version: string | null
}

const FLUSH_AT = 20
const FLUSH_INTERVAL_MS = 5000
const MAX_FAILURES = 3
const SESSION_KEY = 'dtask_analytics_session'

let queue: QueuedEvent[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let failures = 0
let disabled = false

/** Set by the app; lets `surface` be derived without threading it through every call. */
let surfaceResolver: (() => string | null) | null = null

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function sessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY)
    if (existing) return existing
    const fresh = uuid()
    sessionStorage.setItem(SESSION_KEY, fresh)
    return fresh
  } catch {
    // Private mode or a blocked store: a per-load id still groups one visit.
    return uuid()
  }
}

function appVersion(): string | null {
  try {
    return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : null
  } catch {
    return null
  }
}

export function setSurfaceResolver(resolve: () => string | null) {
  surfaceResolver = resolve
}

/** Where the user currently is, for tagging both events and outbound mutations. */
export function currentSurface(): string | null {
  return surfaceResolver?.() ?? null
}

/**
 * Which affordance is about to cause a navigation.
 *
 * `input` alone cannot separate them: reaching Plan by clicking the sidebar,
 * pressing `g p`, or picking it in the palette are three affordances competing
 * for one job, and two of them are keyboard. Whoever triggers the navigation
 * sets this; the router subscriber consumes it.
 */
export type NavCause = 'sidebar' | 'hotkey' | 'palette' | 'link' | 'url'

let nextNavCause: NavCause | null = null

export function setNavCause(cause: NavCause) {
  nextNavCause = cause
}

export function takeNavCause(): NavCause {
  const cause = nextNavCause ?? 'url'
  nextNavCause = null
  return cause
}

/**
 * Record one event. Cheap and non-blocking; failures are swallowed.
 *
 * `input` defaults to the modality behind the current gesture, which is what
 * makes the mouse-vs-keyboard ratio computable without per-call-site work.
 */
export function track(name: string, props?: EventProps, input?: InputModality) {
  if (disabled) return
  queue.push({
    event_id: uuid(),
    name,
    occurred_at: new Date().toISOString(),
    session_id: sessionId(),
    input: input ?? currentModality(),
    surface: surfaceResolver?.() ?? null,
    props: props ?? null,
    app_version: appVersion(),
  })

  if (queue.length >= FLUSH_AT) {
    void flush()
  } else if (timer === null) {
    timer = setTimeout(() => void flush(), FLUSH_INTERVAL_MS)
  }
}

function clearTimer() {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
}

/** Send everything queued. `beacon` survives page-hide, where fetch may not. */
export async function flush({ beacon = false }: { beacon?: boolean } = {}): Promise<void> {
  clearTimer()
  if (disabled || queue.length === 0) return

  const batch = queue
  queue = []
  const body = JSON.stringify({ events: batch })

  if (beacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }))
    return
  }

  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    })
    if (!res.ok) {
      // 401 means the session went away; the router already handles that, and
      // these events are not worth resurrecting. Drop them either way.
      if (res.status !== 401) failures += 1
      if (failures >= MAX_FAILURES) disabled = true
      return
    }
    failures = 0
  } catch {
    failures += 1
    if (failures >= MAX_FAILURES) disabled = true
  }
}

export function installAnalytics(): () => void {
  const onHide = () => {
    if (document.visibilityState === 'hidden') void flush({ beacon: true })
  }
  document.addEventListener('visibilitychange', onHide)
  return () => {
    document.removeEventListener('visibilitychange', onHide)
    clearTimer()
  }
}

/** Off in tests: the suites stub fetch and assert on calls. */
export function disableAnalytics() {
  disabled = true
  queue = []
  clearTimer()
}

/** Test seam. */
export function resetAnalytics() {
  queue = []
  failures = 0
  disabled = false
  surfaceResolver = null
  clearTimer()
}

export function pendingCount(): number {
  return queue.length
}
