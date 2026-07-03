import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectView } from './ProjectView'
import type { Project } from '../api/types'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

const project: Project = {
  id: 7,
  name: 'Demo Project',
  group: 'Work',
  description: '',
  notes: '',
  position: 0,
  tasks: [
    {
      id: 1,
      project_id: 7,
      title: 'A task',
      notes: '',
      complexity: 'low',
      recurring: false,
      assigned_today: false,
      assigned_week: false,
      must_have: false,
      completed: false,
      position: 0,
    },
  ],
}

function renderView() {
  const qc = new QueryClient()
  qc.setQueryData(['projects'], [project])
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  render(<ProjectView project={project} />, { wrapper })
}

beforeEach(() => {
  navigate.mockClear()
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
})
afterEach(() => vi.restoreAllMocks())

describe('ProjectView delete', () => {
  it('deletes the project and navigates home when confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderView()

    await userEvent.click(screen.getByTitle('Delete project'))

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/projects/7',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    )
    expect(navigate).toHaveBeenCalledWith({ to: '/' })
  })

  it('does nothing when the confirm dialog is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderView()

    await userEvent.click(screen.getByTitle('Delete project'))

    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })
})
