import { describe, expect, it } from 'vitest'
import { bucketLabel, groupByDay, inferLinkKind, trailingRange } from './worklog'
import { unloggedCompletedTasks } from '../api/hooks'
import type { Project, Task, WorkLogEntry } from '../api/types'

function entry(id: number, day: string): WorkLogEntry {
  return {
    id,
    day,
    category: 'shipped',
    title: `entry ${id}`,
    context: '',
    impact: '',
    task_id: null,
    created_at: '2026-08-19T10:00:00Z',
    links: [],
  }
}

describe('inferLinkKind', () => {
  it.each([
    ['https://github.com/acme/api/pull/1421', 'pr'],
    ['https://gitlab.com/acme/api/-/merge_requests/88', 'pr'],
    ['https://docs.acme.dev/rfc/0042-queue-backpressure', 'rfc'],
    ['https://acme.dev/designs/checkout-rewrite', 'rfc'],
    ['https://status.acme.dev/incident/2026-08-11', 'incident'],
    ['https://acme.notion.so/Runbook-abc123', 'doc'],
    ['https://example.com/whatever', 'link'],
  ])('classifies %s as %s', (url, expected) => {
    expect(inferLinkKind(url)).toBe(expected)
  })

  it('is case-insensitive', () => {
    expect(inferLinkKind('https://GitHub.com/Acme/API/PULL/7')).toBe('pr')
  })

  it('does not mistake a repo named "pull" for a PR link', () => {
    expect(inferLinkKind('https://github.com/acme/pull-request-bot')).toBe('link')
  })
})

describe('groupByDay', () => {
  it('groups entries by day, newest day first', () => {
    const grouped = groupByDay([entry(1, '2026-08-19'), entry(2, '2026-08-17'), entry(3, '2026-08-19')])
    expect(grouped.map((g) => g.day)).toEqual(['2026-08-19', '2026-08-17'])
    expect(grouped[0].entries.map((e) => e.id)).toEqual([1, 3])
  })

  it('returns nothing for no entries', () => {
    expect(groupByDay([])).toEqual([])
  })
})

describe('bucketLabel', () => {
  it('renders a week as its date span', () => {
    expect(bucketLabel('2026-08-17', '2026-08-23', 'week', 'en-US')).toBe('Aug 17 – Aug 23')
  })

  it('renders a month by name', () => {
    expect(bucketLabel('2026-08-01', '2026-08-31', 'month', 'en-US')).toBe('August 2026')
  })
})

describe('trailingRange', () => {
  it('spans n days ending today, inclusive', () => {
    expect(trailingRange('2026-08-20', 14)).toEqual({ start: '2026-08-07', end: '2026-08-20' })
  })

  it('crosses a month boundary', () => {
    expect(trailingRange('2026-08-02', 7)).toEqual({ start: '2026-07-27', end: '2026-08-02' })
  })
})

describe('unloggedCompletedTasks', () => {
  const project = (tasks: Task[]): Project => ({
    id: 1,
    name: 'Platform',
    group: 'Work',
    description: '',
    notes: '',
    position: 0,
    tasks,
    recurrences: [],
  })

  const done = (id: number, completedAt: string | null): Task => ({
    id,
    project_id: 1,
    title: `task ${id}`,
    notes: '',
    complexity: 'low',
    assigned_today: true,
    assigned_week: false,
    must_have: false,
    is_green: false,
    completed: completedAt !== null,
    completed_at: completedAt,
    position: 0,
    recurrence_rule_id: null,
    occurrence_date: null,
  })

  const localDay = '2026-08-20'
  // `completed_at` is a UTC instant; `day` is the user's local date. Both edges of
  // the local day are covered because only one of them straddles in a given zone:
  // east of UTC the early one falls on the previous UTC date, west of UTC the late
  // one falls on the next. Comparing ISO-string prefixes drops whichever it is.
  const justAfterMidnight = new Date(2026, 7, 20, 0, 30)
  const lateEvening = new Date(2026, 7, 20, 23, 30)

  it('matches tasks by their local completion day, not their UTC one', () => {
    const result = unloggedCompletedTasks(
      [
        project([
          done(1, justAfterMidnight.toISOString()),
          done(2, lateEvening.toISOString()),
        ]),
      ],
      [],
      localDay,
    )
    expect(result.map((r) => r.task.id)).toEqual([1, 2])
  })

  it('ignores a task completed on another day', () => {
    const dayBefore = new Date(2026, 7, 19, 12, 0)
    const result = unloggedCompletedTasks([project([done(1, dayBefore.toISOString())])], [], localDay)
    expect(result).toEqual([])
  })

  it('ignores a task an entry already references', () => {
    const entry: WorkLogEntry = {
      id: 9,
      day: localDay,
      category: 'shipped',
      title: 'already logged',
      context: '',
      impact: '',
      task_id: 1,
      created_at: `${localDay}T09:00:00Z`,
      links: [],
    }
    const result = unloggedCompletedTasks(
      [project([done(1, justAfterMidnight.toISOString()), done(2, lateEvening.toISOString())])],
      [entry],
      localDay,
    )
    expect(result.map((r) => r.task.id)).toEqual([2])
  })

  it('ignores an open task with no completion timestamp', () => {
    expect(unloggedCompletedTasks([project([done(1, null)])], [], localDay)).toEqual([])
  })
})
