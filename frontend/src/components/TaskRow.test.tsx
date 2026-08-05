import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskRow } from './TaskRow'
import type { Task } from '../api/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

const task: Task = {
  id: 1,
  project_id: 7,
  title: 'A task',
  notes: 'Existing notes',
  complexity: 'low',
  assigned_today: false,
  assigned_week: false,
  must_have: false,
  is_green: false,
  completed: false,
  completed_at: null,
  position: 0,
  recurrence_rule_id: null,
  occurrence_date: null,
}

function renderRow() {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
  qc.setQueryData(['projects'], [])
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  render(<TaskRow task={task} editable checkable />, { wrapper })
  return document.querySelector('[data-task-row]') as HTMLElement
}

/** Opens the inline editor the way the keyboard user does: focus row, Enter. */
async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  const row = renderRow()
  row.focus()
  await user.keyboard('{Enter}')
  return {
    title: screen.getByLabelText('common.title') as HTMLInputElement,
    notes: screen.getByLabelText('common.notes') as HTMLTextAreaElement,
  }
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
})
afterEach(() => vi.restoreAllMocks())

describe('TaskRow inline editing', () => {
  it('opens on Enter with the title focused and selected', async () => {
    const user = userEvent.setup()
    const { title } = await openEditor(user)

    expect(document.activeElement).toBe(title)
    expect(title.value).toBe('A task')
    expect(title.selectionStart).toBe(0)
    expect(title.selectionEnd).toBe('A task'.length)
  })

  it('renames the task when Enter is pressed in the title', async () => {
    const user = userEvent.setup()
    await openEditor(user)

    await user.keyboard('Renamed{Enter}')

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/tasks/1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"title":"Renamed"'),
        }),
      ),
    )
  })

  it('jumps between the title and the description with Cmd/Ctrl+arrows', async () => {
    const user = userEvent.setup()
    const { title, notes } = await openEditor(user)

    await user.keyboard('{Meta>}{ArrowDown}{/Meta}')
    expect(document.activeElement).toBe(notes)
    // Caret lands after the existing text, ready to keep writing.
    expect(notes.selectionStart).toBe('Existing notes'.length)

    await user.keyboard('{Control>}{ArrowUp}{/Control}')
    expect(document.activeElement).toBe(title)
    expect(title.selectionStart).toBe('A task'.length)
  })

  it('opens straight in the description when the jump chord starts the edit', async () => {
    const user = userEvent.setup()
    const row = renderRow()
    row.focus()

    await user.keyboard('{Meta>}{ArrowDown}{/Meta}')

    const notes = screen.getByLabelText('common.notes') as HTMLTextAreaElement
    expect(document.activeElement).toBe(notes)
    expect(notes.selectionStart).toBe('Existing notes'.length)
  })

  it('does not save when jumping to the description', async () => {
    const user = userEvent.setup()
    await openEditor(user)

    await user.keyboard('{Meta>}{ArrowDown}{/Meta}')

    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(screen.getByLabelText('common.notes')).toBeInTheDocument()
  })
})
