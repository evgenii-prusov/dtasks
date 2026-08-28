import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReviewView } from './ReviewView'
import { HotkeyProvider } from '../lib/hotkeys/HotkeyProvider'
import type { Project, Task } from '../api/types'

function task(id: number, projectId: number, title: string): Task {
  return {
    id,
    project_id: projectId,
    title,
    notes: '',
    complexity: 'low',
    assigned_today: false,
    assigned_week: false,
    must_have: false,
    is_green: false,
    completed: false,
    completed_at: null,
    position: 0,
    recurrence_rule_id: null,
    occurrence_date: null,
  }
}

function project(id: number, name: string): Project {
  return {
    id,
    name,
    group: 'Work',
    description: '',
    notes: '',
    position: id,
    tasks: [task(id * 10, id, `${name} task`)],
    recurrences: [],
  }
}

const projects = [project(1, 'Alpha'), project(2, 'Beta'), project(3, 'Gamma')]

/** The Inbox as the server sends it: its own group, one project, sorted first. */
function inboxProject(tasks: Task[]): Project {
  return {
    id: 9,
    name: 'Inbox',
    group: 'Inbox',
    description: '',
    notes: '',
    position: -1,
    tasks,
    recurrences: [],
  }
}

function renderView(list: Project[] = projects) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
  qc.setQueryData(['projects'], list)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <HotkeyProvider>{children}</HotkeyProvider>
    </QueryClientProvider>
  )
  render(<ReviewView />, { wrapper })
}

/** The name in the card head, i.e. the project currently under review. */
function currentProject() {
  return screen.getByRole('heading', { level: 3 }).textContent
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
})
afterEach(() => vi.restoreAllMocks())

describe('ReviewView next-project hotkey', () => {
  it('advances to the next project on ArrowRight', async () => {
    renderView()
    expect(currentProject()).toContain('Alpha')

    await userEvent.keyboard('{ArrowRight}')
    expect(currentProject()).toContain('Beta')

    await userEvent.keyboard('{ArrowRight}')
    expect(currentProject()).toContain('Gamma')
  })

  it('finishes the review session on ArrowRight when on the last project', async () => {
    renderView()

    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(currentProject()).toContain('Gamma')

    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByText('Session complete!')).toBeInTheDocument()
  })

  it('renders Finish button on last project and completes session on click', async () => {
    renderView()

    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(screen.getByRole('button', { name: /Finish/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Finish/i }))
    expect(screen.getByText('Session complete!')).toBeInTheDocument()
  })

  it('does not advance while a text field has focus', async () => {
    renderView()

    await userEvent.click(screen.getByPlaceholderText(/Project notes/))
    await userEvent.keyboard('{ArrowRight}')

    expect(currentProject()).toContain('Alpha')
  })
})

describe('ReviewView Inbox phase', () => {
  it('opens on the Inbox, even when the server lists it last', async () => {
    renderView([...projects, inboxProject([task(90, 9, 'Parked idea')])])

    expect(currentProject()).toContain('Inbox')
    expect(screen.getByText('Inbox · 1 to sort')).toBeInTheDocument()
    expect(screen.getByText('Parked idea')).toBeInTheDocument()

    // And the projects follow it, in their own order.
    await userEvent.keyboard('{ArrowRight}')
    expect(currentProject()).toContain('Alpha')
  })

  it('offers a project to file each parked task into', async () => {
    renderView([...projects, inboxProject([task(90, 9, 'Parked idea')])])

    const fileTo = screen.getByRole('combobox', { name: 'File to…' })
    // Every real project is a destination; the Inbox is not one of them.
    expect(
      [...fileTo.querySelectorAll('option')].map((o) => o.textContent),
    ).toEqual(['File to…', 'Alpha', 'Beta', 'Gamma'])

    await userEvent.selectOptions(fileTo, '2')

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/tasks/90',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ project_id: 2 }),
        }),
      ),
    )
  })

  it('says so when there is nothing parked, rather than skipping the phase', () => {
    renderView([...projects, inboxProject([])])

    expect(currentProject()).toContain('Inbox')
    expect(screen.getByText('Inbox zero ✓')).toBeInTheDocument()
  })

  it('leaves the project phases untouched when there is no Inbox', () => {
    renderView()

    expect(currentProject()).toContain('Alpha')
    expect(screen.queryByRole('combobox', { name: 'File to…' })).not.toBeInTheDocument()
  })
})
