import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuickAddTask } from './QuickAddTask'
import type { Project } from '../api/types'

// Enough user projects that the menu overflows its max-h-48 box.
const projects: Project[] = [
  { id: 4, name: 'Inbox', group: 'Inbox', description: '', notes: '', position: -1, tasks: [], recurrences: [] },
  { id: 1, name: '...', group: 'Work', description: '', notes: '', position: 0, tasks: [], recurrences: [] },
  { id: 2, name: '...', group: 'Personal', description: '', notes: '', position: 1, tasks: [], recurrences: [] },
  ...Array.from({ length: 12 }, (_, i) => ({
    id: 10 + i,
    name: `Proj ${String(i + 1).padStart(2, '0')}`,
    group: 'Work',
    description: '',
    notes: '',
    position: 2 + i,
    tasks: [],
    recurrences: [],
  })),
]

function renderQuickAdd() {
  const qc = new QueryClient()
  qc.setQueryData(['projects'], projects)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  render(<QuickAddTask />, { wrapper })
}

// Opens the # menu on the quick-add input and returns the menu container.
async function openMenu() {
  const input = screen.getByPlaceholderText('Quick add task…')
  await userEvent.type(input, 'Buy milk #')
  const first = screen.getByRole('button', { name: /Inbox/ })
  return { input, menu: first.parentElement as HTMLElement }
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    new Response(JSON.stringify(projects), { status: 200, headers: { 'content-type': 'application/json' } }),
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
})

describe('ProjectTagMenu', () => {
  it('stays open when the list itself is scrolled', async () => {
    renderQuickAdd()
    const { menu } = await openMenu()

    menu.scrollTop = 200
    fireEvent.scroll(menu)

    expect(screen.getByRole('button', { name: /Proj 01/ })).toBeInTheDocument()
  })

  it('closes when the page scrolls underneath it', async () => {
    renderQuickAdd()
    await openMenu()

    fireEvent.scroll(window)

    expect(screen.queryByRole('button', { name: /Proj 01/ })).not.toBeInTheDocument()
  })

  it('scrolls the highlighted row into view as the arrow keys move', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    renderQuickAdd()
    const { input } = await openMenu()
    scrollIntoView.mockClear()

    await userEvent.type(input, '{arrowdown}{arrowdown}{arrowdown}')

    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' })
  })
})
