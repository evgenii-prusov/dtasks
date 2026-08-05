/**
 * Pure key-event helpers. No React, no module state — everything here is a
 * function of the event, so it can be table-tested.
 *
 * Chords are normalized strings like `n`, `mod+k`, `shift+/`, `arrowdown`.
 * Letters and digits are read from `event.code` rather than `event.key` so a
 * shortcut stays on the same *physical* key under a non-Latin layout — the app
 * ships a Russian catalog, where the `n` key types "т".
 */

/** Keydowns for these fire on their own and must never start or break a chord. */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta'])

const CODE_TOKENS: Record<string, string> = {
  Slash: '/',
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Period: '.',
  Semicolon: ';',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  Space: 'space',
  Enter: 'enter',
  NumpadEnter: 'enter',
  Escape: 'escape',
  Tab: 'tab',
  Backspace: 'backspace',
  Delete: 'delete',
  ArrowUp: 'arrowup',
  ArrowDown: 'arrowdown',
  ArrowLeft: 'arrowleft',
  ArrowRight: 'arrowright',
  Home: 'home',
  End: 'end',
}

function codeToToken(code: string): string | null {
  if (CODE_TOKENS[code]) return CODE_TOKENS[code]
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^Numpad[0-9]$/.test(code)) return code.slice(6)
  return null
}

export function isModifierKey(e: KeyboardEvent): boolean {
  return MODIFIER_KEYS.has(e.key)
}

/**
 * Normalized chord for an event, or null when the event carries no usable key
 * (a bare modifier, or a key we cannot name).
 *
 * `mod` collapses Meta and Control into one token so a single binding covers
 * both macOS and Windows/Linux.
 */
export function eventToChord(e: KeyboardEvent): string | null {
  if (isModifierKey(e)) return null

  const token = codeToToken(e.code) ?? (e.key ? e.key.toLowerCase() : null)
  if (!token) return null

  let chord = ''
  if (e.metaKey || e.ctrlKey) chord += 'mod+'
  if (e.altKey) chord += 'alt+'
  if (e.shiftKey) chord += 'shift+'
  return chord + token
}

/**
 * Alternate chord for the same event, used only for punctuation that moves
 * between layouts. `?` is Shift+/ on QWERTY but Shift+7 on ЙЦУКЕН, so a
 * binding on `shift+/` also needs to match whatever physical key produced "?".
 */
export function eventToAliasChord(e: KeyboardEvent): string | null {
  if (isModifierKey(e) || !e.key || e.key.length !== 1) return null
  if (e.metaKey || e.ctrlKey || e.altKey) return null
  const printable = e.key.toLowerCase()
  if (printable === '?') return 'shift+/'
  return null
}

/** True when the event target is a field the user is typing into. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * True when the target sits inside a subtree that opted out of hotkeys, so a
 * focused *button* inside an open form cannot trigger row or page shortcuts.
 */
export function isHotkeysOff(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('[data-hotkeys-off]') !== null
}
