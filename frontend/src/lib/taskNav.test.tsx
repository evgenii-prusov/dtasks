import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppRouter } from '../router'
import type { Project, Task, User } from '../api/types'

const user = { id: 1, email: 'k@example.com' } as User

function task(id: number, title: string, over: Partial<Task> = {}): Task {
  return {
    id,
    project_id: 7,
    title,
    completed: false,
    complexity: 'low',
    notes: '',
    is_green: false,
    assigned_today: false,
    assigned_week: false,
    must_have: false,
    position: id,
    ...over,
  } as Task
}

/** Two tasks on Today and two in the backlog, so j/k must cross sections. */
function makeProjects(): Project[] {
  return [
    {
      id: 7,
      name: 'Platform',
      group: 'Work',
      description: '',
      notes: '',
      position: 0,
      recurrences: [],
      tasks: [
        task(1, 'Must fix the build', { must_have: true, assigned_today: true }),
        task(2, 'Review the RFC', { assigned_today: true }),
        task(3, 'Update the changelog', { assigned_week: true }),
        task(4, 'Backlog item'),
      ],
    },
  ] as unknown as Project[]
}

const patches: { url: string; body: unknown }[] = []
let state: Project[] = []

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function renderApp(path = '/') {
  state = makeProjects()
  // Stateful, so a completed task stays completed when the list refetches.
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const taskId = Number(url.match(/\/api\/tasks\/(\d+)/)?.[1])

    if (init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body))
      patches.push({ url, body })
      for (const p of state) {
        const found = p.tasks.find((t) => t.id === taskId)
        if (found) Object.assign(found, body)
      }
      return json({ ok: true })
    }
    if (init?.method === 'DELETE') {
      patches.push({ url, body: null })
      for (const p of state) p.tasks = p.tasks.filter((t) => t.id !== taskId)
      return json({ ok: true })
    }
    if (url.includes('/api/auth/me')) return json(user)
    if (url.includes('/api/projects')) return json(state)
    if (url.includes('/api/habits')) return json([])
    return json({ detail: 'Not found' }, 404)
  })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createAppRouter(qc, createMemoryHistory({ initialEntries: [path] }))
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const activeRowId = () => document.activeElement?.getAttribute('data-task-row')

beforeEach(() => {
  patches.length = 0
})
afterEach(() => vi.restoreAllMocks())

describe('task row navigation', () => {
  it('focuses the first row on j and walks across section boundaries', async () => {
    renderApp('/')
    await screen.findByText('Must fix the build')

    await userEvent.keyboard('j')
    expect(activeRowId()).toBe('1')

    // Row 2 is in the same section, row 3 is in "This Week".
    await userEvent.keyboard('j')
    expect(activeRowId()).toBe('2')
    await userEvent.keyboard('j')
    expect(activeRowId()).toBe('3')

    await userEvent.keyboard('k')
    expect(activeRowId()).toBe('2')
  })

  it('clamps at the ends rather than wrapping', async () => {
    renderApp('/')
    await screen.findByText('Must fix the build')

    await userEvent.keyboard('jk')
    expect(activeRowId()).toBe('1')

    await userEvent.keyboard('kkk')
    expect(activeRowId()).toBe('1')
  })

  it('works with the arrow keys too', async () => {
    renderApp('/')
    await screen.findByText('Must fix the build')

    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(activeRowId()).toBe('2')
  })

  it('opens the inline editor on Enter and returns focus on Escape', async () => {
    renderApp('/')
    await screen.findByText('Must fix the build')

    await userEvent.keyboard('j{Enter}')
    const input = await screen.findByDisplayValue('Must fix the build')

    await userEvent.type(input, '{Escape}')
    await waitFor(() => expect(activeRowId()).toBe('1'))
  })

  it('completes the focused row with x and moves to the next one', async () => {
    renderApp('/')
    await screen.findByText('Must fix the build')

    await userEvent.keyboard('jx')

    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0].url).toContain('/api/tasks/1')
    expect(patches[0].body).toMatchObject({ completed: true })
    // Row 1 leaves the open list, so the highlight advances rather than vanishing.
    await waitFor(() => expect(activeRowId()).toBe('2'))
  })

  it('schedules with t and w, keeping the two mutually exclusive', async () => {
    // Plan lists every open task, including the unscheduled backlog item that
    // Today deliberately hides.
    renderApp('/plan')
    await screen.findByText('Backlog item')

    await userEvent.keyboard('jjjj')
    expect(activeRowId()).toBe('4')
    await userEvent.keyboard('w')

    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0].body).toMatchObject({ assigned_week: true, assigned_today: false })
  })

  it('deletes on Delete only after the confirm is accepted', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderApp('/')
    await screen.findByText('Must fix the build')

    await userEvent.keyboard('j{Delete}')
    expect(confirmSpy).toHaveBeenCalled()
    expect(patches).toHaveLength(0)

    confirmSpy.mockReturnValue(true)
    await userEvent.keyboard('{Delete}')
    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0].url).toContain('/api/tasks/1')
  })

  it('does not steal the caret when a search unmounts every row', async () => {
    renderApp('/plan')
    await screen.findByText('Must fix the build')

    await userEvent.keyboard('j')
    expect(activeRowId()).toBe('1')

    const search = screen.getByPlaceholderText('Search tasks…')
    await userEvent.click(search)
    await userEvent.type(search, 'zzz')

    // Typing filtered every row away; focus must stay in the input.
    expect(document.activeElement).toBe(search)
    expect(search).toHaveValue('zzz')
  })

  it('leaves row keys inert while the palette is open', async () => {
    renderApp('/')
    await screen.findByText('Must fix the build')
    await userEvent.keyboard('j')
    expect(activeRowId()).toBe('1')

    await userEvent.keyboard('{Control>}k{/Control}')
    await screen.findByRole('combobox')
    await userEvent.keyboard('j')

    // The palette owns focus, so the row never sees the key.
    expect(activeRowId()).toBeNull()
    expect(patches).toHaveLength(0)
  })
})
