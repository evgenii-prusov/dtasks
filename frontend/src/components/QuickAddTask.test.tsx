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
  },
  {
    id: 2,
    name: '...',
    group: 'Personal',
    description: 'Default project for Personal tasks.',
    notes: '',
    position: 1,
    tasks: [],
  },
  {
    id: 3,
    name: 'Real Work Project',
    group: 'Work',
    description: '',
    notes: '',
    position: 2,
    tasks: [],
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
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument()
  })

  it('adds task to a specific project directly', async () => {
    renderQuickAddTask()
    
    await userEvent.type(screen.getByPlaceholderText('Quick add task…'), 'Task for Real Work')
    await userEvent.selectOptions(screen.getByRole('combobox'), '3')
    await userEvent.click(screen.getByRole('button', { name: /add/i }))

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/projects/3/tasks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'Task for Real Work', recurring: false }),
        }),
      ),
    )
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
          body: JSON.stringify({ title: 'One-off Task', recurring: false }),
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
          body: JSON.stringify({ title: 'Personal One-off', recurring: false }),
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
          body: JSON.stringify({ title: 'Task title', recurring: false }),
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
          body: JSON.stringify({ title: 'Build feature', recurring: false }),
        }),
      ),
    )
  })
})

