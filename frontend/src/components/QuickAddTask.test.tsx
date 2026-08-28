import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuickAddTask } from './QuickAddTask'
import type { Project } from '../api/types'

const projects: Project[] = [
  {
    id: 4,
    name: 'Inbox',
    group: 'Inbox',
    description: 'Unsorted ideas. Park them here, decide later.',
    notes: '',
    position: -1,
    tasks: [],
    recurrences: [],
  },
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

  it('files a task with no project in the Inbox, without asking Work or Personal', async () => {
    renderQuickAddTask()

    await userEvent.type(screen.getByPlaceholderText('Quick add task…'), 'One-off Task')
    // Parking an idea asks nothing -- no Work/Personal choice stands in the way.
    expect(screen.queryByText(/Work or Personal/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /add/i }))

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/projects/4/tasks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'One-off Task' }),
        }),
      ),
    )
  })

  it('says where an unfiled task will land', async () => {
    renderQuickAddTask()

    await userEvent.type(screen.getByPlaceholderText('Quick add task…'), 'Half an idea')
    expect(screen.getByText('No project? It goes to the Inbox.')).toBeInTheDocument()
  })

  it('files under the Inbox when #inbox is typed out', async () => {
    renderQuickAddTask()

    await userEvent.type(screen.getByPlaceholderText('Quick add task…'), 'Read that paper #inbox')
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/projects/4/tasks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'Read that paper' }),
        }),
      ),
    )
    // The Inbox is never mistaken for a project that needs creating.
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      '/api/projects',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('assigns task to the Personal default when it is picked from the dropdown', async () => {
    renderQuickAddTask()

    await userEvent.type(screen.getByPlaceholderText('Quick add task…'), 'Personal One-off #pers')
    await userEvent.click(screen.getByRole('button', { name: /Personal \(Default\)/i }))
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))

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

  it('submits straight away when # alone is typed and a project is selected via keyboard', async () => {
    renderQuickAddTask()

    const input = screen.getByPlaceholderText('Quick add task…')
    // Type # with no letters — autocomplete shows the defaults, then user projects
    await userEvent.type(input, 'Buy groceries #')

    expect(screen.getByRole('button', { name: /Real Work Project/i })).toBeInTheDocument()

    // Arrow past the three server-managed destinations to the user project, then
    // Enter: should select it AND submit
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}')

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

  it('leads the # dropdown with the Inbox, then the Work and Personal defaults', async () => {
    renderQuickAddTask()

    await userEvent.type(screen.getByPlaceholderText('Quick add task…'), 'Buy groceries #')

    const options = screen
      .getAllByRole('button')
      .map((b) => b.textContent ?? '')
      .filter((text) => /Inbox|\(Default\)|Real Work Project/.test(text))
    expect(options).toEqual([
      expect.stringContaining('Inbox'),
      expect.stringContaining('Work (Default)'),
      expect.stringContaining('Personal (Default)'),
      expect.stringContaining('Real Work Project'),
    ])
  })

  it('files in the Inbox when # is followed by Enter', async () => {
    renderQuickAddTask()

    await userEvent.type(screen.getByPlaceholderText('Quick add task…'), 'Buy groceries #')
    await userEvent.keyboard('{Enter}')

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/projects/4/tasks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'Buy groceries' }),
        }),
      ),
    )
  })

  it('filters the defaults by name, so #pers picks the Personal default', async () => {
    renderQuickAddTask()

    await userEvent.type(screen.getByPlaceholderText('Quick add task…'), 'Call mum #pers')

    expect(screen.getByRole('button', { name: /Personal \(Default\)/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Work \(Default\)/i })).not.toBeInTheDocument()

    await userEvent.keyboard('{Enter}')

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/projects/2/tasks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'Call mum' }),
        }),
      ),
    )
  })

  it('treats a typed-out #Work as the Work default rather than a new project', async () => {
    renderQuickAddTask()

    await userEvent.type(screen.getByPlaceholderText('Quick add task…'), 'Write report #Work')
    // Submit without touching the dropdown
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/projects/1/tasks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'Write report' }),
        }),
      ),
    )
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      '/api/projects',
      expect.objectContaining({ method: 'POST' }),
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


