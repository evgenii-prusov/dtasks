import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppRouter } from '../../router'
import type { User } from '../../api/types'
import { HOTKEYS } from './bindings'
import en from '../../i18n/en.json'

const user: User = { id: 1, email: 'k@example.com' } as User

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function renderApp(path = '/') {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.includes('/api/auth/me')) return json(user)
    if (url.includes('/api/projects')) return json([])
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

afterEach(() => vi.restoreAllMocks())

describe('g-sequence page jumps', () => {
  it('navigates to each page', async () => {
    const router = renderApp('/')
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))

    await userEvent.keyboard('gp')
    await waitFor(() => expect(router.state.location.pathname).toBe('/plan'))

    await userEvent.keyboard('gh')
    await waitFor(() => expect(router.state.location.pathname).toBe('/habits'))

    await userEvent.keyboard('go')
    await waitFor(() => expect(router.state.location.pathname).toBe('/report'))

    await userEvent.keyboard('gt')
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('ignores a prefix followed by an unbound key', async () => {
    const router = renderApp('/')
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))

    await userEvent.keyboard('gz')

    expect(router.state.location.pathname).toBe('/')
  })
})

describe('shortcuts help', () => {
  it('opens on ? and closes on Escape', async () => {
    renderApp('/')

    await userEvent.keyboard('?')
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAccessibleName('Keyboard shortcuts')

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('lists every declared binding, so the help cannot drift from the table', async () => {
    renderApp('/')

    await userEvent.keyboard('?')
    const dialog = await screen.findByRole('dialog')

    for (const def of Object.values(HOTKEYS)) {
      expect(dialog).toHaveTextContent(en.hotkeys[def.labelKey.split('.')[1] as never])
    }
  })

  it('suppresses page navigation while open', async () => {
    const router = renderApp('/')
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))

    await userEvent.keyboard('?')
    await screen.findByRole('dialog')
    await userEvent.keyboard('gp')

    expect(router.state.location.pathname).toBe('/')
  })
})
