import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import type { McpGrant } from '../api/types'
import { ConnectedAppsView } from './ConnectedAppsView'

const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

afterEach(() => vi.restoreAllMocks())

it('disconnects an app', async () => {
  let grants: McpGrant[] = [
    { id: 7, client_name: 'Claude', created_at: '2026-11-20T10:00:00Z', last_used_at: null },
  ]
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    if (init?.method === 'DELETE' && String(input) === '/api/mcp/grants/7') {
      grants = []
      return Promise.resolve(json(undefined, 204))
    }
    return Promise.resolve(json(grants))
  })
  const qc = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  render(<ConnectedAppsView />, { wrapper })

  await userEvent.click(await screen.findByRole('button', { name: 'Disconnect' }))

  await waitFor(() => expect(screen.getByText('No apps connected yet.')).toBeInTheDocument())
  expect(screen.queryByText('Claude')).not.toBeInTheDocument()
})
