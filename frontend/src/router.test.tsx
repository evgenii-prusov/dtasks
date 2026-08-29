import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppRouter } from './router'
import type { Project, User } from './api/types'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function mockApi(user: User | null, projects: Project[] = []) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.includes('/api/auth/me')) {
      return user ? json(user) : json({ detail: 'Unauthorized' }, 401)
    }
    if (url.includes('/api/projects')) return json(projects)
    if (url.includes('/api/habits')) return json([])
    return json({ detail: 'Not found' }, 404)
  })
}

const inbox: Project = {
  id: 5,
  name: 'Inbox',
  group: 'Inbox',
  description: '',
  notes: '',
  position: -1,
  tasks: [],
  recurrences: [],
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createAppRouter(qc, createMemoryHistory({ initialEntries: [path] }))
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

afterEach(() => vi.restoreAllMocks())

describe('route guard', () => {
  it('redirects an anonymous visitor from / to /welcome', async () => {
    mockApi(null)
    const router = renderAt('/')

    expect(await screen.findByLabelText('Invite code')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/welcome'))
  })

  it('redirects an anonymous visitor from a nested route to /welcome', async () => {
    mockApi(null)
    const router = renderAt('/habits')

    expect(await screen.findByLabelText('Invite code')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/welcome'))
  })

  it('renders the app layout for an authenticated user', async () => {
    mockApi({ id: 1, email: 'user@example.com' })
    const router = renderAt('/')

    expect(await screen.findByText('Plan my day')).toBeInTheDocument()
    expect(screen.getByText('user@example.com')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('redirects an authenticated user away from /welcome', async () => {
    mockApi({ id: 1, email: 'user@example.com' })
    const router = renderAt('/welcome')

    expect(await screen.findByText('Plan my day')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})

describe('g i', () => {
  it('jumps to the Inbox, wherever it happens to live', async () => {
    mockApi({ id: 1, email: 'user@example.com' }, [inbox])
    const router = renderAt('/habits')

    expect(await screen.findByText('user@example.com')).toBeInTheDocument()

    await userEvent.keyboard('gi')

    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/5'))
  })

  it('stays put when the account has no Inbox yet', async () => {
    mockApi({ id: 1, email: 'user@example.com' }, [])
    const router = renderAt('/habits')

    expect(await screen.findByText('user@example.com')).toBeInTheDocument()

    await userEvent.keyboard('gi')

    expect(router.state.location.pathname).toBe('/habits')
  })
})
