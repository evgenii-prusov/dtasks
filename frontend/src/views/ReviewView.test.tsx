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

function finished(id: number, projectId: number, title: string): Task {
  return { ...task(id, projectId, title), completed: true, completed_at: '2026-10-01T09:00:00Z' }
}

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

describe('ReviewView completed tasks', () => {
  /** Alpha with one finished task of its own, so every phase has a list to fold. */
  const alpha = { ...project(1, 'Alpha'), tasks: [task(10, 1, 'Alpha task'), finished(11, 1, 'Alpha shipped')] }
  const inbox = inboxProject([
    task(90, 9, 'Parked idea'),
    finished(91, 9, 'Booked the dentist'),
    finished(92, 9, 'Sent the tax form'),
  ])

  it('folds them away by default, leaving the open tasks in view', () => {
    renderView([alpha, inbox])

    expect(screen.getByText('Parked idea')).toBeInTheDocument()
    expect(screen.getByText('Completed (2)')).toBeInTheDocument()
    expect(screen.queryByText('Booked the dentist')).not.toBeInTheDocument()
    expect(screen.queryByText('Sent the tax form')).not.toBeInTheDocument()
  })

  it('opens the whole list on request, and searches it', async () => {
    renderView([alpha, inbox])

    await userEvent.click(screen.getByRole('button', { name: /Show \(2\)/ }))
    expect(screen.getByText('Booked the dentist')).toBeInTheDocument()
    expect(screen.getByText('Sent the tax form')).toBeInTheDocument()

    await userEvent.type(screen.getByRole('textbox', { name: 'Search completed…' }), 'tax')
    expect(screen.getByText('Sent the tax form')).toBeInTheDocument()
    expect(screen.queryByText('Booked the dentist')).not.toBeInTheDocument()
  })

  it('starts every phase folded, whatever the last one was left as', async () => {
    renderView([alpha, inbox])

    await userEvent.click(screen.getByRole('button', { name: /Show \(2\)/ }))
    expect(screen.getByText('Booked the dentist')).toBeInTheDocument()

    await userEvent.keyboard('{ArrowRight}')
    expect(currentProject()).toContain('Alpha')
    expect(screen.getByText('Completed (1)')).toBeInTheDocument()
    expect(screen.queryByText('Alpha shipped')).not.toBeInTheDocument()

    // And back again: the Inbox does not remember it was open.
    await userEvent.click(screen.getByRole('button', { name: /Prev/ }))
    expect(currentProject()).toContain('Inbox')
    expect(screen.queryByText('Booked the dentist')).not.toBeInTheDocument()
  })

  it('adds no second heading, which the phase title is read from', () => {
    renderView([alpha, inbox])

    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1)
  })

  it('leaves the ArrowRight hotkey alone until the search field is focused', async () => {
    renderView([alpha, inbox])
    await userEvent.click(screen.getByRole('button', { name: /Show \(2\)/ }))

    await userEvent.click(screen.getByRole('textbox', { name: 'Search completed…' }))
    await userEvent.keyboard('{ArrowRight}')
    expect(currentProject()).toContain('Inbox')

    // Escape clears nothing here, so it just hands the keyboard back.
    await userEvent.keyboard('{Escape}')
    await userEvent.keyboard('{ArrowRight}')
    expect(currentProject()).toContain('Alpha')
  })
})
