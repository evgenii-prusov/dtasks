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
})
