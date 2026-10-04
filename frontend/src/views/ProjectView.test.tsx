import type { ComponentProps, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectView } from './ProjectView'
import type { Project } from '../api/types'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

const project: Project = {
  id: 7,
  name: 'Demo Project',
  group: 'Work',
  description: '',
  notes: '',
  position: 0,
  tasks: [
    {
      id: 1,
      project_id: 7,
      title: 'A task',
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
    },
  ],
  recurrences: [],
}

function renderView(
  shown: Project = project,
  props: Partial<ComponentProps<typeof ProjectView>> = {},
) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
  qc.setQueryData(['projects'], [shown])
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return render(<ProjectView project={shown} {...props} />, { wrapper })
}

beforeEach(() => {
  navigate.mockClear()
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
})
afterEach(() => vi.restoreAllMocks())

describe('ProjectView rename', () => {
  it('renames the project when the title is clicked and edited', async () => {
    renderView()

    await userEvent.click(screen.getByTitle('Click to rename'))
    const input = screen.getByDisplayValue('Demo Project')
    await userEvent.clear(input)
    await userEvent.type(input, 'New Name{Enter}')

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/projects/7',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'New Name' }),
        }),
      ),
    )
  })

  it('does not save when editing is cancelled with Escape', async () => {
    renderView()

    await userEvent.click(screen.getByTitle('Click to rename'))
    const input = screen.getByDisplayValue('Demo Project')
    await userEvent.type(input, ' changed{Escape}')

    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(screen.getByText('Demo Project')).toBeInTheDocument()
  })

  it('keeps the old name when the input is emptied', async () => {
    renderView()

    await userEvent.click(screen.getByTitle('Click to rename'))
    const input = screen.getByDisplayValue('Demo Project')
    await userEvent.clear(input)
    await userEvent.keyboard('{Enter}')

    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(screen.getByText('Demo Project')).toBeInTheDocument()
  })
})

describe('ProjectView completed tasks', () => {
  const [open] = project.tasks
  const finished = (id: number, title: string) => ({
    ...open,
    id,
    title,
    completed: true,
    completed_at: '2026-10-01T09:00:00Z',
  })
  const withDone: Project = {
    ...project,
    tasks: [open, finished(2, 'Washed the car'), finished(3, 'Booked the dentist')],
  }

  it('folds them away by default, leaving the open tasks in view', () => {
    renderView(withDone)

    expect(screen.getByText('A task')).toBeInTheDocument()
    expect(screen.getByText('Completed (2)')).toBeInTheDocument()
    expect(screen.queryByText('Washed the car')).not.toBeInTheDocument()
    expect(screen.queryByText('Booked the dentist')).not.toBeInTheDocument()
  })

  it('opens the whole list on request, and searches it', async () => {
    renderView(withDone)

    await userEvent.click(screen.getByRole('button', { name: /Show \(2\)/ }))
    expect(screen.getByText('Washed the car')).toBeInTheDocument()
    expect(screen.getByText('Booked the dentist')).toBeInTheDocument()

    await userEvent.type(screen.getByRole('textbox', { name: 'Search completed…' }), 'wash')
    expect(screen.getByText('Washed the car')).toBeInTheDocument()
    expect(screen.queryByText('Booked the dentist')).not.toBeInTheDocument()
  })

  it('opens onto a finished task a palette jump is aimed at', () => {
    renderView(withDone, { revealTaskId: 3 })

    expect(screen.getByLabelText('Booked the dentist')).toBeInTheDocument()
  })

  it('folds again when the page moves on to another project', async () => {
    const other: Project = {
      ...withDone,
      id: 8,
      name: 'Other Project',
      tasks: [{ ...finished(4, 'Paid the rent'), project_id: 8 }],
    }
    const { rerender } = renderView(withDone)
    await userEvent.click(screen.getByRole('button', { name: /Show \(2\)/ }))
    expect(screen.getByText('Washed the car')).toBeInTheDocument()

    // The router keeps one ProjectView mounted across /projects/:id changes.
    rerender(<ProjectView project={other} />)

    expect(screen.getByText('Completed (1)')).toBeInTheDocument()
    expect(screen.queryByText('Paid the rent')).not.toBeInTheDocument()
  })

  it('stays folded for a jump to a task that is still open', () => {
    renderView(withDone, { revealTaskId: 1 })

    expect(screen.getByText('A task')).toBeInTheDocument()
    expect(screen.queryByText('Washed the car')).not.toBeInTheDocument()
  })

  it('shows no completed card at all when nothing is finished', () => {
    renderView()

    expect(screen.queryByText(/^Completed/)).not.toBeInTheDocument()
  })
})

describe('ProjectView delete', () => {
  it('deletes the project and navigates home when confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderView()

    await userEvent.click(screen.getByTitle('Delete project'))

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/projects/7',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    )
    expect(navigate).toHaveBeenCalledWith({ to: '/' })
  })

  it('does nothing when the confirm dialog is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderView()

    await userEvent.click(screen.getByTitle('Delete project'))

    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })
})
