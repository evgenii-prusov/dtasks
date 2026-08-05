import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppRouter } from '../router'
import type { Project, User } from '../api/types'

const user = { id: 1, email: 'k@example.com' } as User

const projects = [
  {
    id: 1,
    name: '...',
    group: 'Work',
    description: '',
    notes: '',
    position: 0,
    recurrences: [],
    tasks: [],
  },
  {
    id: 7,
    name: 'Platform migration',
    group: 'Work',
    description: '',
    notes: '',
    position: 1,
    recurrences: [],
    tasks: [
      {
        id: 42,
        project_id: 7,
        title: 'Draft the rollout plan',
        completed: false,
        complexity: 'low',
        notes: '',
        is_green: false,
        assigned_today: false,
        assigned_week: false,
        must_have: false,
        position: 0,
      },
      {
        id: 43,
        project_id: 7,
        title: 'Archive the old runbook',
        completed: true,
        complexity: 'low',
        notes: '',
        is_green: false,
        assigned_today: false,
        assigned_week: false,
        must_have: false,
        position: 1,
      },
    ],
  },
] as unknown as Project[]

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function renderApp(path = '/') {
  const posted: { url: string; body: unknown }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    if (init?.method === 'POST') {
      posted.push({ url, body: JSON.parse(String(init.body)) })
      return json({ id: 99, title: 'created' }, 201)
    }
    if (url.includes('/api/auth/me')) return json(user)
    if (url.includes('/api/projects')) return json(projects)
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
  return { router, posted }
}

async function openPalette() {
  await userEvent.keyboard('{Control>}k{/Control}')
  return screen.findByRole('combobox')
}

afterEach(() => vi.restoreAllMocks())

describe('CommandPalette', () => {
  it('opens on Ctrl+K and closes on Escape, restoring focus', async () => {
    renderApp('/')
    await openPalette()

    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument())
  })

  it('opens on a bare slash', async () => {
    renderApp('/')
    await userEvent.keyboard('/')
    expect(await screen.findByRole('combobox')).toBeInTheDocument()
  })

  it('lists pages before matching tasks', async () => {
    renderApp('/')
    const input = await openPalette()
    await userEvent.type(input, 'plan')

    const labels = screen.getAllByRole('option').map((o) => o.textContent)
    expect(labels[0]).toContain('Plan')
    expect(labels.some((l) => l?.includes('Draft the rollout plan'))).toBe(true)
  })

  it('finds a project and navigates to it on Enter', async () => {
    const { router } = renderApp('/')
    const input = await openPalette()
    await userEvent.type(input, 'Platform')
    await userEvent.keyboard('{Enter}')

    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/7'))
  })

  it('deep-links a task jump with the task id', async () => {
    const { router } = renderApp('/')
    const input = await openPalette()
    await userEvent.type(input, 'rollout')
    // First result is the task; the query matches no page or project.
    await userEvent.keyboard('{Enter}')

    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/7'))
    expect(router.state.location.search).toEqual({ task: 42 })
  })

  it('ranks completed tasks below open ones', async () => {
    renderApp('/')
    const input = await openPalette()
    await userEvent.type(input, 'the')

    const options = screen.getAllByRole('option').map((o) => o.textContent ?? '')
    const draft = options.findIndex((l) => l.includes('Draft the rollout plan'))
    const archived = options.findIndex((l) => l.includes('Archive the old runbook'))
    expect(draft).toBeGreaterThanOrEqual(0)
    expect(archived).toBeGreaterThan(draft)
  })

  it('moves the active option with the arrow keys', async () => {
    renderApp('/')
    const input = await openPalette()

    const first = screen.getAllByRole('option')[0]
    expect(first).toHaveAttribute('aria-selected', 'true')

    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', 'cmdk-opt-1')

    // Clamped at the top rather than wrapping to the end.
    await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}')
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('creates a task directly when already inside a project', async () => {
    const { posted } = renderApp('/projects/7')
    const input = await openPalette()
    await userEvent.type(input, 'Send the summary')

    const createOption = screen.getByText(/Create task/)
    await userEvent.click(createOption)

    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0].url).toContain('/api/projects/7/tasks')
    expect(posted[0].body).toMatchObject({ title: 'Send the summary' })
  })

  it('routes an ambiguous create through Today rather than guessing a project', async () => {
    const { router, posted } = renderApp('/report')
    const input = await openPalette()
    await userEvent.type(input, 'Something unfiled')
    await userEvent.click(screen.getByText(/Create task/))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(posted).toHaveLength(0)
    // QuickAddTask picks the text up so its Work/Personal prompt can run.
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Quick add task…')).toHaveValue('Something unfiled'),
    )
  })

  it('does not open from a bare slash typed into a text field', async () => {
    renderApp('/')
    const quickAdd = await screen.findByPlaceholderText('Quick add task…')
    await userEvent.type(quickAdd, 'a/b')

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(quickAdd).toHaveValue('a/b')
  })
})
