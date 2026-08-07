import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TodayView } from './TodayView'
import type { Project, Task } from '../api/types'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}))

function task(id: number, title: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    project_id: 7,
    title,
    notes: '',
    complexity: 'low',
    assigned_today: true,
    assigned_week: false,
    must_have: false,
    is_green: false,
    completed: false,
    completed_at: null,
    position: id,
    recurrence_rule_id: null,
    occurrence_date: null,
    ...extra,
  }
}

const project: Project = {
  id: 7,
  name: 'Demo Project',
  group: 'Work',
  description: '',
  notes: '',
  position: 0,
  tasks: [
    task(1, 'Plain one'),
    task(2, 'Green one', { is_green: true }),
    task(3, 'Plain two'),
    task(4, 'Green two', { is_green: true }),
    task(5, 'Week plain', { assigned_today: false, assigned_week: true }),
    task(6, 'Week green', { assigned_today: false, assigned_week: true, is_green: true }),
  ],
  recurrences: [],
}

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
  qc.setQueryData(['projects'], [project])
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  render(<TodayView />, { wrapper })
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
})
afterEach(() => vi.restoreAllMocks())

describe('TodayView ordering', () => {
  it('lists green tasks first in each section, keeping the rest in order', () => {
    renderView()

    const titles = ['Plain one', 'Green one', 'Plain two', 'Green two', 'Week plain', 'Week green']
    const order = titles
      .map((title) => ({ title, el: screen.getByText(title) }))
      .sort((a, b) =>
        a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      )
      .map(({ title }) => title)

    expect(order).toEqual([
      'Green one',
      'Green two',
      'Plain one',
      'Plain two',
      'Week green',
      'Week plain',
    ])
  })
})
