import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ConsentView } from './ConsentView'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function renderConsent(respond: (url: string, init?: RequestInit) => Response) {
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation((input, init) => Promise.resolve(respond(String(input), init)))
  const qc = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  render(<ConsentView requestId="req-1" />, { wrapper })
  return fetchMock
}

beforeEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: { href: '' } })
})
afterEach(() => vi.restoreAllMocks())

it('sends the browser back to Claude with the code when the user allows', async () => {
  const fetchMock = renderConsent((url, init) => {
    if (url === '/api/auth/me') return json({ id: 1, email: 'me@example.com' })
    if (init?.method === 'POST') return json({ redirect_url: 'https://claude.ai/cb?code=abc' })
    return json({ client_name: 'Claude' })
  })

  await userEvent.click(await screen.findByRole('button', { name: 'Allow' }))

  await waitFor(() => expect(window.location.href).toBe('https://claude.ai/cb?code=abc'))
  const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
  expect(JSON.parse(String(post?.[1]?.body))).toEqual({ approve: true })
})

it('explains an expired request instead of offering Allow', async () => {
  renderConsent((url) =>
    url === '/api/auth/me' ? json({ id: 1, email: 'me@example.com' }) : json({ detail: 'gone' }, 404),
  )

  expect(await screen.findByText(/expired or was already used/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Allow' })).not.toBeInTheDocument()
})
