import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HabitsView } from './HabitsView'
import type { Habit } from '../api/types'

function renderView(habits: Habit[] = []) {
  const qc = new QueryClient()
  qc.setQueryData(['habits'], habits)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  render(<HabitsView />, { wrapper })
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    if (init?.method === 'POST') {
      return new Response(
        JSON.stringify({ id: 9, name: 'Read', subtitle: '', position: 0, log: {} }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      )
    }
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
})
afterEach(() => vi.restoreAllMocks())

describe('HabitsView add habit scroll-into-view', () => {
  it('scrolls the newly created habit into view once it appears in the list', async () => {
    const created = { id: 9, name: 'Read', subtitle: '', position: 1, log: {} }
    let habitsAfterCreate: unknown[] = [{ id: 1, name: 'Existing', subtitle: '', position: 0, log: {} }]
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      if (init?.method === 'POST') {
        habitsAfterCreate = [...habitsAfterCreate, created]
        return new Response(JSON.stringify(created), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify(habitsAfterCreate), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    const scrollIntoViewMock = vi.fn()
    vi.stubGlobal('Element', Element)
    Element.prototype.scrollIntoView = scrollIntoViewMock

    renderView(habitsAfterCreate as Habit[])

    await userEvent.click(screen.getByText('Add'))
    await userEvent.type(screen.getByPlaceholderText('Habit name…'), 'Read')
    await userEvent.click(screen.getByText('Add habit'))

    await waitFor(() => expect(screen.getByText('Read')).toBeInTheDocument())
    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalled())
  })
})

describe('HabitsView add habit', () => {
  it('shows and hides the add-habit form via the toggle button', async () => {
    renderView()

    expect(screen.queryByPlaceholderText('Habit name…')).not.toBeInTheDocument()

    await userEvent.click(screen.getByText('Add'))
    expect(screen.getByPlaceholderText('Habit name…')).toBeInTheDocument()

    await userEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByPlaceholderText('Habit name…')).not.toBeInTheDocument()
  })

  it('submits the new habit name and POSTs it', async () => {
    renderView()

    await userEvent.click(screen.getByText('Add'))
    await userEvent.type(screen.getByPlaceholderText('Habit name…'), 'Read')
    await userEvent.click(screen.getByText('Add habit'))

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/habits',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })
})
