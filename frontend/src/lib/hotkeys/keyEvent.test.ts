import { describe, expect, it } from 'vitest'
import { eventToAliasChord, eventToChord, isHotkeysOff, isModifierKey, isTypingTarget } from './keyEvent'

function ev(init: Partial<KeyboardEventInit> & { code?: string; key?: string }): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: '', ...init })
}

describe('eventToChord', () => {
  it.each([
    [{ code: 'KeyN', key: 'n' }, 'n'],
    [{ code: 'KeyG', key: 'g' }, 'g'],
    [{ code: 'Digit7', key: '7' }, '7'],
    [{ code: 'Slash', key: '/' }, '/'],
    [{ code: 'BracketLeft', key: '[' }, '['],
    [{ code: 'Space', key: ' ' }, 'space'],
    [{ code: 'Escape', key: 'Escape' }, 'escape'],
    [{ code: 'ArrowDown', key: 'ArrowDown' }, 'arrowdown'],
    [{ code: 'Delete', key: 'Delete' }, 'delete'],
    [{ code: 'NumpadEnter', key: 'Enter' }, 'enter'],
  ])('maps %o to %s', (init, expected) => {
    expect(eventToChord(ev(init))).toBe(expected)
  })

  it('reads the physical key, not the typed character', () => {
    // Russian layout: the `n` key produces "т".
    expect(eventToChord(ev({ code: 'KeyN', key: 'т' }))).toBe('n')
  })

  it('falls back to key when the code is unknown', () => {
    expect(eventToChord(ev({ code: '', key: 'F13' }))).toBe('f13')
  })

  it('collapses Meta and Control into one `mod` token', () => {
    expect(eventToChord(ev({ code: 'KeyK', key: 'k', metaKey: true }))).toBe('mod+k')
    expect(eventToChord(ev({ code: 'KeyK', key: 'k', ctrlKey: true }))).toBe('mod+k')
  })

  it('orders modifiers deterministically', () => {
    const chord = eventToChord(ev({ code: 'KeyK', key: 'k', ctrlKey: true, altKey: true, shiftKey: true }))
    expect(chord).toBe('mod+alt+shift+k')
  })

  it('treats Shift as part of the chord', () => {
    expect(eventToChord(ev({ code: 'KeyN', key: 'N', shiftKey: true }))).toBe('shift+n')
  })

  it('returns null for bare modifier keydowns', () => {
    expect(eventToChord(ev({ code: 'ShiftLeft', key: 'Shift' }))).toBeNull()
    expect(isModifierKey(ev({ code: 'MetaLeft', key: 'Meta' }))).toBe(true)
  })
})

describe('eventToAliasChord', () => {
  it('maps a typed "?" to shift+/ regardless of which physical key made it', () => {
    // ЙЦУКЕН: "?" is Shift+7.
    expect(eventToAliasChord(ev({ code: 'Digit7', key: '?', shiftKey: true }))).toBe('shift+/')
  })

  it('is null for ordinary keys', () => {
    expect(eventToAliasChord(ev({ code: 'KeyN', key: 'n' }))).toBeNull()
  })
})

describe('isTypingTarget', () => {
  it.each(['INPUT', 'TEXTAREA', 'SELECT'])('is true for %s', (tag) => {
    expect(isTypingTarget(document.createElement(tag))).toBe(true)
  })

  it('is true for contenteditable', () => {
    const el = document.createElement('div')
    el.contentEditable = 'true'
    // jsdom does not derive isContentEditable from the attribute.
    Object.defineProperty(el, 'isContentEditable', { value: true })
    expect(isTypingTarget(el)).toBe(true)
  })

  it('is false for a button and for null', () => {
    expect(isTypingTarget(document.createElement('button'))).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})

describe('isHotkeysOff', () => {
  it('is true for a descendant of an opted-out subtree', () => {
    const form = document.createElement('div')
    form.setAttribute('data-hotkeys-off', '')
    const button = document.createElement('button')
    form.appendChild(button)
    expect(isHotkeysOff(button)).toBe(true)
  })

  it('is false outside one', () => {
    expect(isHotkeysOff(document.createElement('button'))).toBe(false)
  })
})
