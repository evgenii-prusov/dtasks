import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuickAddTask } from './QuickAddTask'
import type { Project } from '../api/types'

const projects: Project[] = [
  {
    id: 1,
    name: '...',
    group: 'Work',
    description: 'Default project for Work tasks.',
    notes: '',
    position: 0,
    tasks: [],
    recurrences: [],
  },
  {
    id: 2,
    name: '...',
    group: 'Personal',
    description: 'Default project for Personal tasks.',
    notes: '',
    position: 1,
    tasks: [],
    recurrences: [],
  },
  {
    id: 3,
    name: 'Real Work Project',
    group: 'Work',
    description: '',
    notes: '',
    position: 2,
    tasks: [],
    recurrences: [],
  },
]

function renderQuickAddTask(projs: Project[] = projects) {
  const qc = new QueryClient()
  qc.setQueryData(['projects'], projs)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  render(<QuickAddTask />, { wrapper })
  return qc
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    const urlStr = url.toString()
    if (urlStr.endsWith('/api/projects') && options?.method === 'POST') {
      const body = JSON.parse(options.body as string)
      return new Response(
        JSON.stringify({ id: 99, name: body.name, group: body.group, tasks: [] }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      )
    }
    if (urlStr.includes('/api/projects') && !urlStr.includes('/tasks')) {
      return new Response(JSON.stringify(projects), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ id: 100, title: 'New Task' }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    })
  })
})
afterEach(() => vi.restoreAllMocks())

describe('QuickAddTask', () => {
  it('renders elements correctly', () => {
    renderQuickAddTask()
    expect(screen.getByPlaceholderText('Quick add task…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument()
  })

  it('shows group confirmation prompt when no project is chosen', async () => {
    renderQuickAddTask()

    await userEvent.type(screen.getByPlaceholderText('Quick add task…'), 'One-off Task')
    await userEvent.click(screen.getByRole('button', { name: /add/i }))

    // Prompt should be visible
    expect(screen.getByText('Is this for Work or Personal?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /work/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /personal/i })).toBeInTheDocument()

    // Click Work to assign to the Work default project (id = 1)
    await userEvent.click(screen.getByRole('button', { name: /work/i }))

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/projects/1/tasks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'One-off Task' }),
        }),
      ),
    )
  })

  it('assigns task to Personal default project when Personal is selected in prompt', async () => {
    renderQuickAddTask()

    await userEvent.type(screen.getByPlaceholderText('Quick add task…'), 'Personal One-off')
    await userEvent.click(screen.getByRole('button', { name: /add/i }))
    await userEvent.click(screen.getByRole('button', { name: /personal/i }))

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/projects/2/tasks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'Personal One-off' }),
        }),
      ),
    )
  })

  it('shows autocomplete dropdown when # is typed and matches existing project', async () => {
    renderQuickAddTask()

    const input = screen.getByPlaceholderText('Quick add task…')
    await userEvent.type(input, 'Task title #Real')

    const optionBtn = screen.getByRole('button', { name: /Real Work Project/i })
    expect(optionBtn).toBeInTheDocument()

    // Select option via click
    await userEvent.click(optionBtn)

    // Form submit
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/projects/3/tasks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'Task title' }),
        }),
      ),
    )
  })

  it('assigns task via partial #tag match when submitting without clicking autocomplete option', async () => {
    renderQuickAddTask()

    const input = screen.getByPlaceholderText('Quick add task…')
    // "Real" is a partial match for "Real Work Project" (id=3)
    await userEvent.type(input, 'Buy milk #Real')

    // Autocomplete shows the match
    expect(screen.getByRole('button', { name: /Real Work Project/i })).toBeInTheDocument()

    // Submit WITHOUT clicking the autocomplete option — click Add directly
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/projects/3/tasks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'Buy milk' }),
        }),
      ),
    )
  })

  it('selects project and submits task in one Enter press via keyboard autocomplete', async () => {
    renderQuickAddTask()

    const input = screen.getByPlaceholderText('Quick add task…')
    await userEvent.type(input, 'Task title #Real')

    // Autocomplete shows with "Real Work Project" at index 0 (highlighted)
    expect(screen.getByRole('button', { name: /Real Work Project/i })).toBeInTheDocument()

    // Single Enter: should select the project AND submit the task
    await userEvent.keyboard('{Enter}')

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/projects/3/tasks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'Task title' }),
        }),
      ),
    )
  })

  it('submits without Work/Personal prompt when # alone is typed and project selected via keyboard', async () => {
    renderQuickAddTask()

    const input = screen.getByPlaceholderText('Quick add task…')
    // Type # with no letters — autocomplete shows all user projects
    await userEvent.type(input, 'Buy groceries #')

    expect(screen.getByRole('button', { name: /Real Work Project/i })).toBeInTheDocument()

    // Press Enter — should select the highlighted project and submit, NOT show the Work/Personal prompt
    await userEvent.keyboard('{Enter}')

    expect(screen.queryByText('Is this for Work or Personal?')).not.toBeInTheDocument()

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/projects/3/tasks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'Buy groceries' }),
        }),
      ),
    )
  })

  it('creates a new project automatically when #tag does not match any existing project', async () => {
    renderQuickAddTask()

    const input = screen.getByPlaceholderText('Quick add task…')
    await userEvent.type(input, 'Build feature #NewSecretProject')

    expect(screen.getByText(/Create project "NewSecretProject"/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /add/i }))

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/projects',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'NewSecretProject', group: 'Work' }),
        }),
      ),
    )

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/projects/99/tasks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'Build feature' }),
        }),
      ),
    )
  })

  it('posts to /api/projects/:id/recurrences when repeat toggle is active', async () => {
    renderQuickAddTask()

    const input = screen.getByPlaceholderText('Quick add task…')
    await userEvent.type(input, 'Daily Sync #Real')

    const optionBtn = screen.getByRole('button', { name: /Real Work Project/i })
    await userEvent.click(optionBtn)

    // Enable repeat toggle
    const repeatBtn = screen.getByRole('button', { name: /repeat/i })
    await userEvent.click(repeatBtn)

    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/projects/3/recurrences',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'Daily Sync', weekdays: 127 }),
        }),
      ),
    )
  })
})


