import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CompletedTasks } from './CompletedTasks'
import type { Task } from '../api/types'

function done(id: number, title: string): Task {
  return {
    id,
    project_id: 1,
    title,
    notes: '',
    complexity: 'low',
    assigned_today: false,
    assigned_week: false,
    must_have: false,
    is_green: false,
    completed: true,
    completed_at: '2026-10-01T09:00:00Z',
    position: id,
    recurrence_rule_id: null,
    occurrence_date: null,
  }
}

// A daily recurring task leaves one finished copy per day, so repeats are the
// normal case, not an edge.
const tasks = [
  done(1, 'Проверить ближайшие термины на Fuhrerschein'),
  done(2, 'Вернуть посылку в DHL'),
  done(3, 'Проверить ближайшие термины на Fuhrerschein'),
  done(4, 'Сходить в EDEKA'),
]

type Props = Partial<ComponentProps<typeof CompletedTasks>>

function list(props: Props = {}) {
  return (
    <CompletedTasks
      tasks={tasks}
      variant="card"
      renderTask={(task) => <div data-testid="row">{task.title}</div>}
      {...props}
    />
  )
}

const rows = () => screen.queryAllByTestId('row')
const toggle = () => screen.getByRole('button', { name: /^(Show|Hide)/ })
const search = () => screen.queryByRole('textbox', { name: 'Search completed…' })

describe('CompletedTasks folding', () => {
  it('starts folded: a count and a way to open it, but no rows', () => {
    render(list())

    expect(screen.getByText('Completed (4)')).toBeInTheDocument()
    expect(toggle()).toHaveTextContent('Show (4)')
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(rows()).toHaveLength(0)
    expect(search()).not.toBeInTheDocument()
  })

  it('opens to the full list, and folds again', async () => {
    render(list())

    await userEvent.click(toggle())
    expect(rows()).toHaveLength(4)
    expect(toggle()).toHaveTextContent('Hide')
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(search()).toBeInTheDocument()

    await userEvent.click(toggle())
    expect(rows()).toHaveLength(0)
    expect(search()).not.toBeInTheDocument()
  })

  it('forgets the search when it folds, so it never reopens silently short', async () => {
    render(list())

    await userEvent.click(toggle())
    await userEvent.type(search()!, 'edeka')
    expect(rows()).toHaveLength(1)

    await userEvent.click(toggle())
    await userEvent.click(toggle())
    expect(search()).toHaveValue('')
    expect(rows()).toHaveLength(4)
  })
})

describe('CompletedTasks search', () => {
  it('narrows by title and shows how much of the whole it kept', async () => {
    render(list())
    await userEvent.click(toggle())

    await userEvent.type(search()!, 'fuhrer')

    expect(rows().map((r) => r.textContent)).toEqual([
      'Проверить ближайшие термины на Fuhrerschein',
      'Проверить ближайшие термины на Fuhrerschein',
    ])
    expect(screen.getByText('Completed (2 of 4)')).toBeInTheDocument()
  })

  it('ignores case, in either script, and the whitespace around the query', async () => {
    render(list())
    await userEvent.click(toggle())

    await userEvent.type(search()!, '  ПОСЫЛКУ ')
    expect(rows().map((r) => r.textContent)).toEqual(['Вернуть посылку в DHL'])

    await userEvent.clear(search()!)
    await userEvent.type(search()!, 'EdEkA')
    expect(rows().map((r) => r.textContent)).toEqual(['Сходить в EDEKA'])
  })

  it('says so when nothing matches, instead of showing an empty card', async () => {
    render(list())
    await userEvent.click(toggle())

    await userEvent.type(search()!, ' zzz ')

    expect(rows()).toHaveLength(0)
    expect(screen.getByText('No completed tasks match "zzz"')).toBeInTheDocument()
    expect(screen.getByText('Completed (0 of 4)')).toBeInTheDocument()
  })

  it('empties from the clear button', async () => {
    render(list())
    await userEvent.click(toggle())
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()

    await userEvent.type(search()!, 'edeka')
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))

    expect(search()).toHaveValue('')
    expect(rows()).toHaveLength(4)
  })

  it('answers Escape by clearing first, then handing the keyboard back', async () => {
    render(list())
    await userEvent.click(toggle())
    const field = search()!

    await userEvent.type(field, 'edeka')
    await userEvent.keyboard('{Escape}')
    expect(field).toHaveValue('')
    expect(field).toHaveFocus()

    // A focused field switches the single-letter hotkeys off; Escape is the way out.
    await userEvent.keyboard('{Escape}')
    expect(field).not.toHaveFocus()
  })
})

describe('CompletedTasks reveal', () => {
  it('opens for a finished task that is about to be focused', () => {
    render(list({ revealTaskId: 4 }))

    expect(rows()).toHaveLength(4)
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
  })

  it('opens for a jump that arrives after it has mounted', () => {
    const { rerender } = render(list())
    expect(rows()).toHaveLength(0)

    rerender(list({ revealTaskId: 4 }))
    expect(rows()).toHaveLength(4)
  })

  it('shows the task even if a search was hiding it', async () => {
    const { rerender } = render(list())
    await userEvent.click(toggle())
    await userEvent.type(search()!, 'dhl')
    expect(rows()).toHaveLength(1)

    rerender(list({ revealTaskId: 4 }))

    expect(search()).toHaveValue('')
    expect(rows()).toHaveLength(4)
  })

  it('stays folded for a task it does not hold', () => {
    render(list({ revealTaskId: 999 }))

    expect(rows()).toHaveLength(0)
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('lets the user fold it again, and opens again for the next jump', async () => {
    const { rerender } = render(list({ revealTaskId: 2 }))
    expect(rows()).toHaveLength(4)

    // The jump's param is still on the URL for a moment; folding must stick.
    await userEvent.click(toggle())
    rerender(list({ revealTaskId: 2 }))
    expect(rows()).toHaveLength(0)

    // Once it is stripped, jumping to the same task again counts as a new jump.
    rerender(list({ revealTaskId: undefined }))
    rerender(list({ revealTaskId: 2 }))
    expect(rows()).toHaveLength(4)
  })
})

describe('CompletedTasks variants', () => {
  it('gives the card its own heading', () => {
    render(list({ variant: 'card' }))

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Completed (4)')
  })

  it('adds no heading to the section, which sits in a card that already has one', () => {
    // Review tells its phases apart by the one level-3 heading in its card.
    render(list({ variant: 'section' }))

    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.getByText('Completed (4)')).toBeInTheDocument()
  })
})
