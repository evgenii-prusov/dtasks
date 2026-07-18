import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthProviders } from '../api/types'
import { WelcomeView } from './WelcomeView'

const navigate = vi.fn()
let mockSearch: { oauth_error?: string } = {}
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useSearch: () => mockSearch,
}))

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Mocks fetch so `/api/auth/providers` gets `providers` and everything else
 * gets `defaultBody`/`defaultStatus` — mirrors the two calls WelcomeView can
 * make (the mutation, and the always-on providers query). */
function mockFetch(
  providers: AuthProviders,
  defaultBody: unknown = {},
  defaultStatus = 200,
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url === '/api/auth/providers') return Promise.resolve(json(providers))
    return Promise.resolve(json(defaultBody, defaultStatus))
  })
}

function renderView() {
  const qc = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  render(<WelcomeView />, { wrapper })
}

async function fillSignup(email = 'new@example.com', password = 'password123', invite = 'secret') {
  await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.type(screen.getByLabelText('Invite code'), invite)
}

beforeEach(() => {
  navigate.mockClear()
  mockSearch = {}
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href: '' },
  })
})
afterEach(() => vi.restoreAllMocks())

describe('WelcomeView', () => {
  it('renders the signup form by default', () => {
    renderView()

    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByLabelText('Invite code')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument()
  })

  it('submits the entered signup values', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(json({ id: 1, email: 'new@example.com' }, 201)))
    renderView()

    await fillSignup()
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/signup',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'new@example.com',
            password: 'password123',
            invite_code: 'secret',
          }),
        }),
      ),
    )
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/' }))
  })

  it('shows the server error detail when signup is rejected', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(json({ detail: 'Invalid invite code' }, 403)),
    )
    renderView()

    await fillSignup('x@y.com', 'password123', 'wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Invalid invite code')).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('shows the duplicate-email detail on a 409', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(json({ detail: 'An account with this email already exists' }, 409)),
    )
    renderView()

    await fillSignup()
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(
      await screen.findByText('An account with this email already exists'),
    ).toBeInTheDocument()
  })

  it('toggles to the login form and submits credentials', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(json({ id: 1, email: 'user@example.com' })))
    renderView()

    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(screen.queryByLabelText('Invite code')).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
        }),
      ),
    )
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/' }))
  })

  it('shows the login error detail on bad credentials', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(json({ detail: 'Invalid email or password' }, 401)),
    )
    renderView()

    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('disables the submit button while the request is pending', async () => {
    let resolveFetch: (r: Response) => void = () => {}
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve
        }),
    )
    renderView()

    await fillSignup()
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(screen.getByRole('button', { name: /account/i })).toBeDisabled())
    resolveFetch(json({ id: 1, email: 'new@example.com' }, 201))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/' }))
  })

  describe('OAuth buttons', () => {
    it('renders a button only for each enabled provider', async () => {
      mockFetch({ google: true, github: false })
      renderView()

      expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Continue with GitHub' })).not.toBeInTheDocument()
    })

    it('hides the OAuth section entirely when no providers are enabled', async () => {
      const fetchMock = mockFetch({ google: false, github: false })
      renderView()

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith('/api/auth/providers', expect.anything()),
      )
      expect(screen.queryByRole('button', { name: /Continue with/ })).not.toBeInTheDocument()
    })

    it('navigates to the provider login URL in login mode', async () => {
      mockFetch({ google: true, github: true })
      renderView()

      await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
      const button = await screen.findByRole('button', { name: 'Continue with Google' })
      await userEvent.click(button)

      expect(window.location.href).toBe('/api/auth/oauth/google/login')
    })

    it('blocks navigation and shows an inline error in signup mode with an empty invite code', async () => {
      mockFetch({ google: true, github: true })
      renderView()

      const button = await screen.findByRole('button', { name: 'Continue with GitHub' })
      await userEvent.click(button)

      expect(await screen.findByText('Enter your invite code first')).toBeInTheDocument()
      expect(window.location.href).toBe('')
    })

    it('appends the invite code and navigates in signup mode', async () => {
      mockFetch({ google: true, github: true })
      renderView()

      await userEvent.type(screen.getByLabelText('Invite code'), 'my code')
      const button = await screen.findByRole('button', { name: 'Continue with GitHub' })
      await userEvent.click(button)

      expect(window.location.href).toBe('/api/auth/oauth/github/login?invite_code=my%20code')
    })
  })

  describe('OAuth error banner', () => {
    it('renders the localized message for a known oauth_error code and strips the URL param', async () => {
      mockSearch = { oauth_error: 'invalid_invite' }
      mockFetch({ google: false, github: false })
      renderView()

      expect(await screen.findByText('Invalid invite code')).toBeInTheDocument()
      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith({ to: '/welcome', search: {}, replace: true }),
      )
    })

    it('falls back to the generic error for an unrecognized oauth_error code', async () => {
      mockSearch = { oauth_error: 'something_unexpected' }
      mockFetch({ google: false, github: false })
      renderView()

      expect(
        await screen.findByText('Something went wrong. Please try again.'),
      ).toBeInTheDocument()
    })

    it('does not show a banner when there is no oauth_error param', () => {
      mockSearch = {}
      mockFetch({ google: false, github: false })
      renderView()

      expect(navigate).not.toHaveBeenCalled()
    })
  })
})
