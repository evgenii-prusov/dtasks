import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkLogView } from './WorkLogView'
import { trailingRange } from '../lib/worklog'
import { todayISO } from '../lib/dates'
import type { Project, Task, WorkLogBucket, WorkLogEntry, WorkLogRollup } from '../api/types'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}))

const TODAY = todayISO()
const RANGE = trailingRange(TODAY, 14)

function entry(id: number, title: string, over: Partial<WorkLogEntry> = {}): WorkLogEntry {
  return {
    id,
    day: TODAY,
    category: 'shipped',
    title,
    context: '',
    impact: '',
    task_id: null,
    created_at: `${TODAY}T09:00:00Z`,
    links: [],
    ...over,
  }
}

function task(id: number, title: string, over: Partial<Task> = {}): Task {
  return {
    id,
    project_id: 1,
    title,
    notes: '',
    complexity: 'low',
    assigned_today: true,
    assigned_week: false,
    must_have: false,
    is_green: false,
    completed: true,
    completed_at: `${TODAY}T11:00:00Z`,
    position: 0,
    recurrence_rule_id: null,
    occurrence_date: null,
    ...over,
  }
}

function project(tasks: Task[]): Project {
  return {
    id: 1,
    name: 'Platform',
    group: 'Work',
    description: '',
    notes: '',
    position: 0,
    tasks,
    recurrences: [],
  }
}

const ROLLUP: WorkLogRollup = {
  period: 'week',
  buckets: [
    {
      key: '2026-W34',
      start: '2026-08-17',
      end: '2026-08-23',
      total: 2,
      by_category: { shipped: 1, operational: 0, glue: 1, learning: 0 },
      links_by_kind: { pr: 3, rfc: 1, doc: 0, incident: 0, link: 0 },
      with_impact: 1,
      days_logged: 2,
      avg_energy: 4.5,
      avg_friction: 2,
      friction_notes: ['CI was flaky all week'],
      entries: [entry(10, 'Rolled out the new queue', { day: '2026-08-17' })],
    },
  ],
}

const emptyBucket: WorkLogBucket = {
  key: '2026-W33',
  start: '2026-08-10',
  end: '2026-08-16',
  total: 0,
  by_category: { shipped: 0, operational: 0, glue: 0, learning: 0 },
  links_by_kind: { pr: 0, rfc: 0, doc: 0, incident: 0, link: 0 },
  with_impact: 0,
  days_logged: 0,
  avg_energy: null,
  avg_friction: null,
  friction_notes: [],
  entries: [],
}

const emptyBucket2: WorkLogBucket = { ...emptyBucket, key: '2026-W32', start: '2026-08-03', end: '2026-08-09' }

function renderView({
  entries = [] as WorkLogEntry[],
  projects = [] as Project[],
} = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['worklog', 'entries', RANGE.start, RANGE.end], entries)
  qc.setQueryData(['worklog', 'days', RANGE.start, RANGE.end], [])
  qc.setQueryData(['projects'], projects)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  render(<WorkLogView />, { wrapper })
  return qc
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
})
afterEach(() => vi.restoreAllMocks())

describe('WorkLogView capture tab', () => {
  it('groups entries under their day', () => {
    renderView({ entries: [entry(1, 'Shipped the importer'), entry(2, 'Unblocked Dana')] })

    expect(screen.getByText('Shipped the importer')).toBeInTheDocument()
    expect(screen.getByText('Unblocked Dana')).toBeInTheDocument()
    expect(screen.getByText('2 entries')).toBeInTheDocument()
  })

  it('shows the empty state when nothing is logged', () => {
    renderView()
    expect(screen.getByText('Nothing logged yet')).toBeInTheDocument()
  })

  it('offers tasks completed today that are not logged yet', () => {
    renderView({ projects: [project([task(7, 'Drain the retry queue')])] })

    const promote = screen.getByText('Finished today').closest<HTMLElement>('.card')!
    expect(within(promote).getByText('Drain the retry queue')).toBeInTheDocument()
  })

  it('does not offer a completed task that an entry already references', () => {
    renderView({
      entries: [entry(1, 'Drained the retry queue', { task_id: 7 })],
      projects: [project([task(7, 'Drain the retry queue')])],
    })
    expect(screen.queryByText('Finished today')).not.toBeInTheDocument()
  })

  it('prefills the form from a promoted task', async () => {
    renderView({
      projects: [project([task(7, 'Drain the retry queue', { notes: 'Backlog hit 40k' })])],
    })

    await userEvent.click(screen.getByRole('button', { name: 'Log it' }))

    expect(screen.getByPlaceholderText('What did you do?')).toHaveValue('Drain the retry queue')
    expect(screen.getByPlaceholderText(/What was broken/)).toHaveValue('Backlog hit 40k')
  })

  it('infers the link kind from a pasted PR url', async () => {
    renderView()

    await userEvent.click(screen.getByRole('button', { name: /Log something/ }))
    await userEvent.type(
      screen.getByPlaceholderText(/Paste a PR/),
      'https://github.com/acme/api/pull/12',
    )

    expect(screen.getByRole('combobox')).toHaveValue('pr')
  })
})

describe('WorkLogView editing', () => {
  const withLink = () =>
    entry(1, 'Cut checkout latency', {
      context: 'p95 was over a second',
      impact: '820ms -> 340ms',
      links: [{ id: 5, kind: 'pr', url: 'https://github.com/acme/api/pull/7', label: '' }],
    })

  it('opens an editor prefilled with every field of the entry', async () => {
    renderView({ entries: [withLink()] })

    await userEvent.click(screen.getByRole('button', { name: 'Edit entry' }))

    expect(screen.getByPlaceholderText('What did you do?')).toHaveValue('Cut checkout latency')
    expect(screen.getByPlaceholderText(/What was broken/)).toHaveValue('p95 was over a second')
    expect(screen.getByPlaceholderText(/820ms/)).toHaveValue('820ms -> 340ms')
    expect(screen.getByPlaceholderText(/Paste a PR/)).toHaveValue(
      'https://github.com/acme/api/pull/7',
    )
    expect(screen.getByRole('combobox')).toHaveValue('pr')
    expect(screen.getByLabelText('Day')).toHaveValue(TODAY)
  })

  it('PATCHes the edited fields and closes the editor', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }))
    renderView({ entries: [withLink()] })

    await userEvent.click(screen.getByRole('button', { name: 'Edit entry' }))
    const title = screen.getByPlaceholderText('What did you do?')
    await userEvent.clear(title)
    await userEvent.type(title, 'Halved checkout latency')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const patch = fetchSpy.mock.calls.find(([, init]) => init?.method === 'PATCH')
    expect(patch?.[0]).toBe('/api/worklog/entries/1')
    const body = JSON.parse(String(patch?.[1]?.body))
    expect(body.title).toBe('Halved checkout latency')
    // The whole entry goes in the patch, links included -- PATCH replaces them.
    expect(body.links).toEqual([
      { url: 'https://github.com/acme/api/pull/7', kind: 'pr', label: '' },
    ])
    expect(screen.queryByPlaceholderText('What did you do?')).not.toBeInTheDocument()
  })

  it('discards changes on cancel', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }))
    renderView({ entries: [withLink()] })

    await userEvent.click(screen.getByRole('button', { name: 'Edit entry' }))
    await userEvent.type(screen.getByPlaceholderText('What did you do?'), ' EDITED')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(fetchSpy.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
    expect(screen.getByText('Cut checkout latency')).toBeInTheDocument()
  })

  it('drops a link that was cleared', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }))
    renderView({ entries: [withLink()] })

    await userEvent.click(screen.getByRole('button', { name: 'Edit entry' }))
    await userEvent.clear(screen.getByPlaceholderText(/Paste a PR/))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const patch = fetchSpy.mock.calls.find(([, init]) => init?.method === 'PATCH')
    expect(JSON.parse(String(patch?.[1]?.body)).links).toEqual([])
  })

  it('closes the editor when the add form is opened, so only one is ever live', async () => {
    renderView({ entries: [withLink()] })

    await userEvent.click(screen.getByRole('button', { name: 'Edit entry' }))
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Log something/ }))
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })
})

describe('WorkLogView rollup tabs', () => {
  it('renders a period tile per bucket, carrying its entry count', async () => {
    const qc = renderView()
    qc.setQueryData(['worklog', 'rollup', 'week'], ROLLUP)

    await userEvent.click(screen.getByRole('button', { name: 'By week' }))

    const tile = await screen.findByRole('button', { name: /Aug 17 – Aug 23/ })
    expect(tile).toHaveTextContent('2')
    // Two entries lands on the first volume step. This fixture's range stops
    // well before today, so the newest bucket is marked by fallback; which
    // bucket is current when the range does reach today is
    // `currentBucketKey`'s own test.
    expect(tile.className).toContain('v1')
    expect(tile.className).toContain('current')
    expect(tile).toHaveAccessibleName(/2 entries/)
  })

  it('renders an empty bucket as a disabled tile with no count', async () => {
    const qc = renderView()
    qc.setQueryData(['worklog', 'rollup', 'week'], {
      period: 'week',
      buckets: [emptyBucket, ROLLUP.buckets[0]],
    })

    await userEvent.click(screen.getByRole('button', { name: 'By week' }))

    const tile = await screen.findByRole('button', { name: /Aug 10 – Aug 16/ })
    expect(tile).toBeDisabled()
    expect(tile).toHaveTextContent('')
    expect(tile).toHaveAccessibleName(/Nothing logged/)
  })

  it('shows range totals as chips rather than a totals row', async () => {
    const qc = renderView()
    qc.setQueryData(['worklog', 'rollup', 'week'], {
      period: 'week',
      buckets: [emptyBucket, ROLLUP.buckets[0]],
    })

    await userEvent.click(screen.getByRole('button', { name: 'By week' }))

    await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument())
    // The same labels repeat on each period card, and the range chips come
    // first in the DOM -- so index 0 is the range-wide figure.
    expect(screen.getAllByText('Entries')[0].parentElement).toHaveTextContent('Entries 2')
    expect(screen.getAllByText('With impact')[0].parentElement).toHaveTextContent('With impact 1')
  })

  it('gives a card only to periods that have entries, newest first', async () => {
    const older = {
      ...ROLLUP.buckets[0],
      key: '2026-W33',
      start: '2026-08-10',
      end: '2026-08-16',
      total: 1,
      entries: [entry(20, 'Older thing', { day: '2026-08-10' })],
      friction_notes: [],
    }
    const qc = renderView()
    qc.setQueryData(['worklog', 'rollup', 'week'], {
      period: 'week',
      buckets: [emptyBucket2, older, ROLLUP.buckets[0]],
    })

    await userEvent.click(screen.getByRole('button', { name: 'By week' }))

    const headings = await screen.findAllByRole('heading', { level: 3 })
    expect(headings.map((h) => h.textContent)).toEqual(['Aug 17 – Aug 23', 'Aug 10 – Aug 16'])
  })

  it('lists the bucket evidence, its numbers and friction notes in the card', async () => {
    const qc = renderView()
    qc.setQueryData(['worklog', 'rollup', 'week'], ROLLUP)

    await userEvent.click(screen.getByRole('button', { name: 'By week' }))

    await waitFor(() => expect(screen.getByText('Rolled out the new queue')).toBeInTheDocument())

    const card = screen
      .getByRole('heading', { level: 3, name: 'Aug 17 – Aug 23' })
      .closest<HTMLElement>('.card')!
    expect(within(card).getByText('CI was flaky all week')).toBeInTheDocument()
    // The per-period numbers the table used to carry now sit on the card.
    expect(within(card).getByText('Energy').parentElement).toHaveTextContent('Energy 4.5')
    expect(within(card).getByText('Days').parentElement).toHaveTextContent('Days 2')
    // Also the category badge on the entry row below; the stats line comes first.
    expect(within(card).getAllByText('Shipped')[0].parentElement).toHaveTextContent('Shipped 1')
  })
})
