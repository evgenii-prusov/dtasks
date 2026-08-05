import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flush, resetAnalytics } from '../analytics'
import { HotkeyProvider } from './HotkeyProvider'
import { useHotkey, type UseHotkeyOptions } from './useHotkey'

/**
 * The dispatcher is the single place every global/page/overlay shortcut passes
 * through, so these assertions stand in for the whole keyboard layer.
 */

function Probe({
  chords,
  options,
  onTrigger = () => {},
}: {
  chords: string | string[]
  options?: UseHotkeyOptions
  onTrigger?: () => void | boolean
}) {
  useHotkey(chords, onTrigger, options)
  return null
}

function renderWithProvider(ui: ReactNode) {
  return render(
    <HotkeyProvider>
      {ui}
      <input placeholder="text field" />
    </HotkeyProvider>,
  )
}

let fetchMock: ReturnType<typeof vi.fn>

async function recorded() {
  await flush()
  return fetchMock.mock.calls.flatMap((call) => JSON.parse(call[1].body).events)
}

beforeEach(() => {
  resetAnalytics()
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetAnalytics()
})

describe('hotkey usage tracking', () => {
  it('records the shortcut that fired, by name', async () => {
    renderWithProvider(<Probe chords="g p" options={{ name: 'goPlan' }} />)
    await userEvent.keyboard('gp')

    const events = await recorded()
    expect(events).toHaveLength(1)
    expect(events[0].name).toBe('hotkey.use')
    expect(events[0].props).toMatchObject({ name: 'goPlan', chord: 'g p' })
  })

  it('always attributes a shortcut to the keyboard', async () => {
    // Even if a stray pointer event came first, a chord is keyboard by
    // definition -- otherwise the migration ratio would undercount itself.
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    renderWithProvider(<Probe chords="v" options={{ name: 'togglePlanTab' }} />)
    await userEvent.keyboard('v')

    expect((await recorded())[0].input).toBe('keyboard')
  })

  it('records which layer claimed the key, so shadowing is visible', async () => {
    renderWithProvider(
      <>
        <Probe chords="n" options={{ layer: 'global', name: 'newTask' }} />
        <Probe chords="n" options={{ layer: 'page', name: 'newTask' }} />
      </>,
    )
    await userEvent.keyboard('n')

    const events = await recorded()
    expect(events).toHaveLength(1)
    expect(events[0].props.layer).toBe('page')
  })

  it('records a miss when a real shortcut is pressed inside a text field', async () => {
    // The friction signal: the user reached for the keyboard and got nothing,
    // which is what forces a fall back to the mouse.
    const { getByPlaceholderText } = renderWithProvider(
      <Probe chords="n" options={{ name: 'newTask' }} />,
    )
    await userEvent.click(getByPlaceholderText('text field'))
    await userEvent.keyboard('n')

    const events = await recorded()
    expect(events.map((e) => e.name)).toContain('hotkey.miss')
    const miss = events.find((e) => e.name === 'hotkey.miss')
    expect(miss.props).toMatchObject({ chord: 'n', blocked: true })
  })

  it('records a miss when no binding claims a known shortcut', async () => {
    renderWithProvider(<Probe chords="v" options={{ name: 'togglePlanTab' }} />)
    // `x` is a real shortcut, but nothing is bound to it on this page.
    await userEvent.keyboard('x')

    const events = await recorded()
    expect(events).toHaveLength(1)
    expect(events[0].name).toBe('hotkey.miss')
    expect(events[0].props).toMatchObject({ chord: 'x', blocked: false })
  })

  it('ignores ordinary typing that was never a shortcut', async () => {
    renderWithProvider(<Probe chords="v" options={{ name: 'togglePlanTab' }} />)
    // `q` is bound to nothing anywhere; recording it would be noise, not friction.
    await userEvent.keyboard('q')

    expect(await recorded()).toHaveLength(0)
  })

  it('records nothing extra when a binding declines the key', async () => {
    renderWithProvider(<Probe chords="v" options={{ name: 'togglePlanTab' }} onTrigger={() => false} />)
    await userEvent.keyboard('v')

    const events = await recorded()
    // Declined, so it counts as a miss rather than a use.
    expect(events.map((e) => e.name)).toEqual(['hotkey.miss'])
  })
})
