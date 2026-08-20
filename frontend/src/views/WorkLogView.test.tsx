import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkLogView } from './WorkLogView'
import { trailingRange } from '../lib/worklog'
import { todayISO } from '../lib/dates'
import type { Project, Task, WorkLogEntry, WorkLogRollup } from '../api/types'

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

describe('WorkLogView rollup tabs', () => {
  it('fetches and renders the weekly rollup when the tab is selected', async () => {
    const qc = renderView()
    qc.setQueryData(['worklog', 'rollup', 'week'], ROLLUP)

    await userEvent.click(screen.getByRole('button', { name: 'By week' }))

    const table = await screen.findByRole('table')
    const row = within(table).getByText('Aug 17 – Aug 23').closest('tr')!
    // period, total, then shipped / operational / glue / learning, with-impact,
    // days, energy, friction. Total sits second so it survives the horizontal
    // scroll this ten-column table needs in the 880px content column.
    expect(within(row).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      'Aug 17 – Aug 23',
      '2',
      '1',
      '—',
      '1',
      '—',
      '1',
      '2',
      '4.5',
      '2.0',
    ])
  })

  it('lists the bucket evidence and friction notes below the table', async () => {
    const qc = renderView()
    qc.setQueryData(['worklog', 'rollup', 'week'], ROLLUP)

    await userEvent.click(screen.getByRole('button', { name: 'By week' }))

    await waitFor(() => expect(screen.getByText('Rolled out the new queue')).toBeInTheDocument())
    expect(screen.getByText('CI was flaky all week')).toBeInTheDocument()
  })
})
