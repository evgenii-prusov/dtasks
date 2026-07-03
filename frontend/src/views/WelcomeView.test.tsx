import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WelcomeView } from './WelcomeView'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
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

beforeEach(() => navigate.mockClear())
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
      .mockResolvedValue(json({ id: 1, email: 'new@example.com' }, 201))
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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ detail: 'Invalid invite code' }, 403))
    renderView()

    await fillSignup('x@y.com', 'password123', 'wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Invalid invite code')).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('shows the duplicate-email detail on a 409', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ detail: 'An account with this email already exists' }, 409),
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
      .mockResolvedValue(json({ id: 1, email: 'user@example.com' }))
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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ detail: 'Invalid email or password' }, 401),
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
})
