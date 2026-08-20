import type { EntryCategory, LinkKind, WorkLogEntry } from '../api/types'
import type { LabelKey } from './hotkeys/bindings'
import { parseISODate } from './dates'

/** Display order for the four categories, and the i18n key for each label.
 *
 * Categories are stored server-side as English strings and localized at render,
 * the same arrangement as project groups. */
export const CATEGORY_LABEL_KEYS: Record<EntryCategory, LabelKey> = {
  shipped: 'worklog.categoryShipped',
  operational: 'worklog.categoryOperational',
  glue: 'worklog.categoryGlue',
  learning: 'worklog.categoryLearning',
}

export const LINK_KIND_LABEL_KEYS: Record<LinkKind, LabelKey> = {
  pr: 'worklog.linkPr',
  rfc: 'worklog.linkRfc',
  doc: 'worklog.linkDoc',
  incident: 'worklog.linkIncident',
  link: 'worklog.linkOther',
}

/**
 * Guess what kind of evidence a URL is, so pasting a PR link doesn't also cost a
 * dropdown. Always overridable in the form -- this is a default, not a verdict.
 */
export function inferLinkKind(url: string): LinkKind {
  const u = url.toLowerCase()
  if (/\/pulls?\/\d|\/merge_requests?\//.test(u)) return 'pr'
  if (/\brfc\b|\/design[s]?\/|\/proposals?\//.test(u)) return 'rfc'
  if (/incident|postmortem|post-mortem|statuspage/.test(u)) return 'incident'
  if (/\/docs?\/|notion\.so|confluence|readthedocs|\/wiki\//.test(u)) return 'doc'
  return 'link'
}

/** Group entries by their day, newest day first, preserving each day's order. */
export function groupByDay(entries: WorkLogEntry[]): { day: string; entries: WorkLogEntry[] }[] {
  const byDay = new Map<string, WorkLogEntry[]>()
  for (const entry of entries) {
    const bucket = byDay.get(entry.day)
    if (bucket) bucket.push(entry)
    else byDay.set(entry.day, [entry])
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, dayEntries]) => ({ day, entries: dayEntries }))
}

/**
 * Human label for a rollup bucket, from the bucket's own start/end dates rather
 * than by re-parsing its key -- the server already resolved the ISO-week maths,
 * and redoing it here is how the two drift apart.
 */
export function bucketLabel(start: string, end: string, period: 'week' | 'month', locale: string): string {
  const from = parseISODate(start)
  if (period === 'month') {
    const label = from.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
    return label.charAt(0).toUpperCase() + label.slice(1)
  }
  const to = parseISODate(end)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  return `${from.toLocaleDateString(locale, opts)} – ${to.toLocaleDateString(locale, opts)}`
}

/** Last `n` ISO days ending today, as the range the entries list asks for. */
export function trailingRange(today: string, days: number): { start: string; end: string } {
  const end = parseISODate(today)
  const start = new Date(end)
  start.setDate(end.getDate() - (days - 1))
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { start: iso(start), end: today }
}
