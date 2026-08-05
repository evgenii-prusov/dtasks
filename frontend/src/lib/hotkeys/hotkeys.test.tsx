import { StrictMode, type ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HotkeyProvider } from './HotkeyProvider'
import { useHotkey, type UseHotkeyOptions } from './useHotkey'
import { SEQUENCE_TIMEOUT_MS } from './bindings'

function Probe({
  chords,
  onTrigger,
  options,
}: {
  chords: string | string[]
  onTrigger: () => void | boolean
  options?: UseHotkeyOptions
}) {
  useHotkey(chords, onTrigger, options)
  return null
}

function Fields() {
  return (
    <div>
      <input placeholder="text field" />
      <textarea placeholder="notes field" />
      <div data-hotkeys-off>
        <button type="button">form button</button>
      </div>
    </div>
  )
}

function renderWithProvider(ui: ReactNode) {
  return render(
    <HotkeyProvider>
      {ui}
      <Fields />
    </HotkeyProvider>,
  )
}

afterEach(() => vi.useRealTimers())

describe('useHotkey', () => {
  it('fires on its chord', async () => {
    const onTrigger = vi.fn()
    renderWithProvider(<Probe chords="n" onTrigger={onTrigger} />)

    await userEvent.keyboard('n')

    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('does not fire while typing in an input or textarea', async () => {
    const onTrigger = vi.fn()
    renderWithProvider(<Probe chords="n" onTrigger={onTrigger} />)

    await userEvent.type(screen.getByPlaceholderText('text field'), 'n')
    await userEvent.type(screen.getByPlaceholderText('notes field'), 'n')

    expect(onTrigger).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('text field')).toHaveValue('n')
  })

  it('does not fire from a button inside a data-hotkeys-off subtree', async () => {
    const onTrigger = vi.fn()
    renderWithProvider(<Probe chords="n" onTrigger={onTrigger} />)

    screen.getByRole('button', { name: 'form button' }).focus()
    await userEvent.keyboard('n')

    expect(onTrigger).not.toHaveBeenCalled()
  })

  it('fires inside an input when allowInInput is set', async () => {
    const onTrigger = vi.fn()
    renderWithProvider(
      <Probe chords="mod+k" onTrigger={onTrigger} options={{ allowInInput: true }} />,
    )

    screen.getByPlaceholderText('text field').focus()
    await userEvent.keyboard('{Control>}k{/Control}')

    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('matches the physical key rather than the typed character', () => {
    const onTrigger = vi.fn()
    renderWithProvider(<Probe chords="n" onTrigger={onTrigger} />)

    // userEvent cannot fake a keyboard layout, so dispatch directly.
    fireEvent.keyDown(document, { code: 'KeyN', key: 'т' })

    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('treats Shift as part of the chord', async () => {
    const onTrigger = vi.fn()
    renderWithProvider(<Probe chords="n" onTrigger={onTrigger} />)

    await userEvent.keyboard('{Shift>}n{/Shift}')

    expect(onTrigger).not.toHaveBeenCalled()
  })

  it('ignores modified keypresses for an unmodified chord', async () => {
    const onTrigger = vi.fn()
    renderWithProvider(<Probe chords="n" onTrigger={onTrigger} />)

    await userEvent.keyboard('{Control>}n{/Control}')
    await userEvent.keyboard('{Meta>}n{/Meta}')
    await userEvent.keyboard('{Alt>}n{/Alt}')

    expect(onTrigger).not.toHaveBeenCalled()
  })

  it('does not fire when disabled, and stops firing after unmount', async () => {
    const onTrigger = vi.fn()
    const { unmount } = renderWithProvider(
      <Probe chords="n" onTrigger={onTrigger} options={{ enabled: false }} />,
    )
    await userEvent.keyboard('n')
    expect(onTrigger).not.toHaveBeenCalled()

    unmount()
    await userEvent.keyboard('n')
    expect(onTrigger).not.toHaveBeenCalled()
  })

  it('runs one handler per keypress when two components bind the same chord', async () => {
    const first = vi.fn()
    const second = vi.fn()
    renderWithProvider(
      <>
        <Probe chords="n" onTrigger={first} />
        <Probe chords="n" onTrigger={second} />
      </>,
    )

    await userEvent.keyboard('n')

    expect(first.mock.calls.length + second.mock.calls.length).toBe(1)
  })

  it('gives a higher layer precedence over a lower one', async () => {
    const global = vi.fn()
    const page = vi.fn()
    renderWithProvider(
      <>
        <Probe chords="n" onTrigger={global} options={{ layer: 'global' }} />
        <Probe chords="n" onTrigger={page} options={{ layer: 'page' }} />
      </>,
    )

    await userEvent.keyboard('n')

    expect(page).toHaveBeenCalledTimes(1)
    expect(global).not.toHaveBeenCalled()
  })

  it('falls through to the next binding when a handler returns false', async () => {
    const declining = vi.fn(() => false)
    const fallback = vi.fn()
    renderWithProvider(
      <>
        <Probe chords="n" onTrigger={fallback} options={{ layer: 'global' }} />
        <Probe chords="n" onTrigger={declining} options={{ layer: 'page' }} />
      </>,
    )

    await userEvent.keyboard('n')

    expect(declining).toHaveBeenCalledTimes(1)
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  it('registers once under StrictMode', async () => {
    const onTrigger = vi.fn()
    render(
      <StrictMode>
        <HotkeyProvider>
          <Probe chords="n" onTrigger={onTrigger} />
        </HotkeyProvider>
      </StrictMode>,
    )

    await userEvent.keyboard('n')

    expect(onTrigger).toHaveBeenCalledTimes(1)
  })
})

describe('two-key sequences', () => {
  it('fires on the full sequence', async () => {
    const onTrigger = vi.fn()
    renderWithProvider(<Probe chords="g p" onTrigger={onTrigger} />)

    await userEvent.keyboard('gp')

    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('does not fire the second key on its own', async () => {
    const seq = vi.fn()
    const single = vi.fn()
    renderWithProvider(
      <>
        <Probe chords="g p" onTrigger={seq} />
        <Probe chords="p" onTrigger={single} />
      </>,
    )

    await userEvent.keyboard('gp')

    expect(seq).toHaveBeenCalledTimes(1)
    expect(single).not.toHaveBeenCalled()
  })

  it('expires the prefix after the timeout', () => {
    vi.useFakeTimers()
    const onTrigger = vi.fn()
    renderWithProvider(<Probe chords="g p" onTrigger={onTrigger} />)

    fireEvent.keyDown(document, { code: 'KeyG', key: 'g' })
    vi.advanceTimersByTime(SEQUENCE_TIMEOUT_MS + 1)
    fireEvent.keyDown(document, { code: 'KeyP', key: 'p' })

    expect(onTrigger).not.toHaveBeenCalled()
  })

  it('falls through to a single-key binding when the sequence does not match', async () => {
    const seq = vi.fn()
    const single = vi.fn()
    renderWithProvider(
      <>
        <Probe chords="g p" onTrigger={seq} />
        <Probe chords="n" onTrigger={single} />
      </>,
    )

    await userEvent.keyboard('gn')

    expect(seq).not.toHaveBeenCalled()
    expect(single).toHaveBeenCalledTimes(1)
  })

  it('does not arm a prefix while typing', async () => {
    const onTrigger = vi.fn()
    renderWithProvider(<Probe chords="g p" onTrigger={onTrigger} />)

    const input = screen.getByPlaceholderText('text field')
    await userEvent.type(input, 'gp')

    expect(onTrigger).not.toHaveBeenCalled()
    expect(input).toHaveValue('gp')
  })
})
