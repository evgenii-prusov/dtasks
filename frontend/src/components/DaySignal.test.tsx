import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DaySignal } from './DaySignal'
import type { WorkLogDay } from '../api/types'

const DAY: WorkLogDay = { day: '2026-10-05', energy: 0, friction: 0, note: '' }

/** Stands in for the query cache: each change is applied to `day` straight away,
 * the way the optimistic update would, and reported to `onSave`. */
function Harness({ initial = DAY, onSave }: { initial?: WorkLogDay; onSave: (day: WorkLogDay) => void }) {
  const [day, setDay] = useState(initial)
  return (
    <DaySignal
      day={day}
      onChange={(next) => {
        onSave(next)
        setDay(next)
      }}
    />
  )
}

const note = () => screen.getByLabelText('Note')
const saveButton = () => screen.getByRole('button', { name: 'Save note' })
const status = () => screen.getByRole('status')
const rate = (scale: 'Energy' | 'Friction', value: string) =>
  within(screen.getByRole('group', { name: scale })).getByRole('button', { name: value })

describe('DaySignal', () => {
  it('says what the card is for and labels the note box', () => {
    render(<Harness onSave={vi.fn()} />)

    expect(screen.getByText(/how the day felt, not what you did/i)).toBeInTheDocument()
    // A label, not just a placeholder: the placeholder is gone once you type.
    expect(note().tagName).toBe('TEXTAREA')
    expect(note()).toHaveAttribute('placeholder', 'What got in the way?')
  })

  it('shows the Save button from the start, with nothing to do until the note changes', async () => {
    const onSave = vi.fn()
    render(<Harness onSave={onSave} />)

    expect(saveButton()).toBeDisabled()
    expect(status()).toBeEmptyDOMElement()

    // Focusing the box and leaving it untouched must not send a save.
    await userEvent.click(note())
    await userEvent.click(screen.getByText('How was today?'))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('saves the note from the button, and the status moves from unsaved to saved', async () => {
    const onSave = vi.fn()
    render(<Harness onSave={onSave} />)

    await userEvent.type(note(), 'Third review loop')
    expect(status()).toHaveTextContent('Unsaved changes')
    expect(saveButton()).toBeEnabled()

    await userEvent.click(saveButton())

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith({ ...DAY, note: 'Third review loop' })
    expect(status()).toHaveTextContent('Saved')
    expect(saveButton()).toBeDisabled()
  })

  it('saves once per press, even while the first save has not come back yet', async () => {
    // A parent that never applies the change models the gap between sending a
    // save and the cache catching up. If pressing the button blurred the box
    // first, the on-blur save and the click would both fire inside that gap.
    const onChange = vi.fn()
    render(<DaySignal day={DAY} onChange={onChange} />)

    await userEvent.type(note(), 'Third review loop')
    await userEvent.click(saveButton())

    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('saves when focus leaves the box, so a half-finished note is not lost', async () => {
    const onSave = vi.fn()
    render(<Harness onSave={onSave} />)

    await userEvent.type(note(), 'Typed, then moved on')
    await userEvent.click(screen.getByText('How was today?'))

    expect(onSave).toHaveBeenCalledWith({ ...DAY, note: 'Typed, then moved on' })
    expect(status()).toHaveTextContent('Saved')
  })

  it('lets a saved note be cleared', async () => {
    const onSave = vi.fn()
    render(<Harness initial={{ ...DAY, note: 'Old note' }} onSave={onSave} />)

    expect(status()).toHaveTextContent('Saved')
    await userEvent.clear(note())
    expect(status()).toHaveTextContent('Unsaved changes')
    await userEvent.click(saveButton())

    expect(onSave).toHaveBeenCalledWith({ ...DAY, note: '' })
  })

  it('saves a rating the moment it is tapped, carrying any note still being typed', async () => {
    const onSave = vi.fn()
    render(<Harness onSave={onSave} />)

    await userEvent.type(note(), 'Pending')
    await userEvent.click(rate('Energy', '3'))

    expect(onSave).toHaveBeenLastCalledWith({ ...DAY, energy: 3, note: 'Pending' })
    expect(rate('Energy', '3')).toHaveAttribute('aria-pressed', 'true')
  })

  it('clears a rating when the chosen value is tapped again', async () => {
    const onSave = vi.fn()
    render(<Harness initial={{ ...DAY, friction: 4 }} onSave={onSave} />)

    await userEvent.click(rate('Friction', '4'))

    expect(onSave).toHaveBeenLastCalledWith({ ...DAY, friction: 0 })
    expect(rate('Friction', '4')).toHaveAttribute('aria-pressed', 'false')
  })

  it('follows the row to another day instead of carrying the draft over', async () => {
    const { rerender } = render(<DaySignal day={{ ...DAY, note: 'Monday' }} onChange={vi.fn()} />)
    await userEvent.type(note(), ' draft')

    rerender(
      <DaySignal day={{ day: '2026-10-06', energy: 0, friction: 0, note: 'Tuesday' }} onChange={vi.fn()} />,
    )

    expect(note()).toHaveValue('Tuesday')
    expect(status()).toHaveTextContent('Saved')
  })
})
