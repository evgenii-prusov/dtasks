import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  currentModality,
  installInputModalityTracking,
  resetInputModality,
} from './inputModality'

/** jsdom has no PointerEvent; a typed KeyboardEvent-style stub is enough here. */
function pointerDown(pointerType: string) {
  const e = new Event('pointerdown', { bubbles: true })
  Object.defineProperty(e, 'pointerType', { value: pointerType })
  document.dispatchEvent(e)
}

function keyDown() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }))
}

describe('input modality', () => {
  let uninstall: () => void

  beforeEach(() => {
    resetInputModality()
    uninstall = installInputModalityTracking()
  })

  afterEach(() => {
    uninstall()
    resetInputModality()
    vi.useRealTimers()
  })

  it('is unknown before any interaction', () => {
    expect(currentModality()).toBe('unknown')
  })

  it('reports keyboard after a keypress', () => {
    keyDown()
    expect(currentModality()).toBe('keyboard')
  })

  it('reports mouse after a mouse pointer', () => {
    pointerDown('mouse')
    expect(currentModality()).toBe('mouse')
  })

  it('distinguishes touch from mouse', () => {
    // Phone taps must not inflate the mouse side of the migration ratio.
    pointerDown('touch')
    expect(currentModality()).toBe('touch')
  })

  it('distinguishes pen from mouse', () => {
    pointerDown('pen')
    expect(currentModality()).toBe('pen')
  })

  it('lets the most recent input win', () => {
    pointerDown('mouse')
    keyDown()
    expect(currentModality()).toBe('keyboard')
    pointerDown('mouse')
    expect(currentModality()).toBe('mouse')
  })

  it('decays to unknown once no gesture is recent', () => {
    // Work that happens long after the last gesture had no human behind it and
    // must not be attributed to whatever the user last touched.
    vi.useFakeTimers()
    keyDown()
    expect(currentModality()).toBe('keyboard')
    vi.advanceTimersByTime(5000)
    expect(currentModality()).toBe('unknown')
  })

  it('sees gestures even when a handler stops propagation', () => {
    const swallow = (e: Event) => e.stopPropagation()
    document.body.addEventListener('keydown', swallow)
    const input = document.createElement('input')
    document.body.appendChild(input)

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    expect(currentModality()).toBe('keyboard')

    document.body.removeEventListener('keydown', swallow)
    input.remove()
  })
})
