import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Sidebar } from './Sidebar'
import type { Project } from '../api/types'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

function renderSidebar(projects: Project[] = []) {
  const qc = new QueryClient()
  qc.setQueryData(['projects'], projects)
  qc.setQueryData(['auth', 'me'], { id: 1, email: 'user@example.com' })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  render(<Sidebar />, { wrapper })
  return qc
}

beforeEach(() => {
  navigate.mockClear()
})
afterEach(() => vi.restoreAllMocks())

describe('Sidebar project groups', () => {
  it('shows the Work and Personal group headers even with no projects', () => {
    renderSidebar([])

    expect(screen.getByText('Work')).toBeInTheDocument()
    expect(screen.getByText('Personal')).toBeInTheDocument()
  })

  it('adds a project to the Work group and navigates to it', async () => {
    const created = {
      id: 42,
      name: 'Alpha',
      group: 'Work',
      description: '',
      notes: '',
      position: 0,
      tasks: [],
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify(created), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify([created]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    renderSidebar([])

    await userEvent.click(screen.getByTitle('Add project to Work'))
    await userEvent.type(screen.getByPlaceholderText('Project name…'), 'Alpha{Enter}')

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Alpha', group: 'Work' }),
        }),
      ),
    )
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/projects/$projectId',
        params: { projectId: '42' },
      }),
    )
  })

  it('adds a project to the Personal group', async () => {
    const created = {
      id: 43,
      name: 'Beta',
      group: 'Personal',
      description: '',
      notes: '',
      position: 0,
      tasks: [],
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify(created), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify([created]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    renderSidebar([])

    await userEvent.click(screen.getByTitle('Add project to Personal'))
    await userEvent.type(screen.getByPlaceholderText('Project name…'), 'Beta{Enter}')

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Beta', group: 'Personal' }),
        }),
      ),
    )
  })

  it('cancels the add-project input on Escape without calling the API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    renderSidebar([])

    await userEvent.click(screen.getByTitle('Add project to Work'))
    const input = screen.getByPlaceholderText('Project name…')
    await userEvent.type(input, 'Abandoned{Escape}')

    expect(screen.queryByPlaceholderText('Project name…')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/projects',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('surfaces an error and keeps the input open when the create request fails', async () => {
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ detail: 'boom' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    renderSidebar([])

    await userEvent.click(screen.getByTitle('Add project to Work'))
    await userEvent.type(screen.getByPlaceholderText('Project name…'), 'Alpha{Enter}')

    await waitFor(() => expect(window.alert).toHaveBeenCalled())
    expect(screen.getByPlaceholderText('Project name…')).toHaveValue('Alpha')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('reorders projects when clicking the up/down buttons', async () => {
    const projects = [
      {
        id: 101,
        name: 'Work Project A',
        group: 'Work',
        description: '',
        notes: '',
        position: 0,
        tasks: [],
      },
      {
        id: 102,
        name: 'Work Project B',
        group: 'Work',
        description: '',
        notes: '',
        position: 1,
        tasks: [],
      },
    ]

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (url === '/api/projects/102/reorder' && init?.method === 'POST') {
        const body = JSON.parse(init.body as string)
        if (body.direction === 'up') {
          return new Response(
            JSON.stringify([
              { ...projects[1], position: 0 },
              { ...projects[0], position: 1 },
            ]),
            { status: 201, headers: { 'content-type': 'application/json' } },
          )
        }
      }
      return new Response(JSON.stringify(projects), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    renderSidebar(projects)

    expect(screen.getByText('Work Project A')).toBeInTheDocument()
    expect(screen.getByText('Work Project B')).toBeInTheDocument()

    const upButtons = screen.getAllByTitle('Move project up')
    expect(upButtons[0]).toBeDisabled()
    expect(upButtons[1]).not.toBeDisabled()

    await userEvent.click(upButtons[1])

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects/102/reorder',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ direction: 'up' }),
        }),
      ),
    )
  })
})

describe('Sidebar language toggle', () => {
  it('switches the UI to Russian and back', async () => {
    renderSidebar([])
    expect(screen.getByText('Today')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Русский' }))
    expect(await screen.findByText('Сегодня')).toBeInTheDocument()
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
    expect(document.documentElement.lang).toBe('ru')
    expect(localStorage.getItem('dtask_lang')).toBe('ru')

    await userEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(await screen.findByText('Today')).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
  })
})

describe('Sidebar account', () => {
  it("shows the signed-in user's email", () => {
    renderSidebar([])

    expect(screen.getByText('user@example.com')).toBeInTheDocument()
  })

  it('logs out, clears cached data and navigates to /welcome', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }))
    const qc = renderSidebar([])

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/welcome' }))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(qc.getQueryData(['auth', 'me'])).toBeUndefined()
  })
})
