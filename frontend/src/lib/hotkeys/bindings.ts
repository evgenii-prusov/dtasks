/**
 * The canonical shortcut table. The dispatcher registers from it, the help
 * overlay renders from it, and the command palette reads chord badges from it —
 * so the three cannot drift apart.
 */

import type { ParseKeys } from 'i18next'

export type HotkeyGroup = 'navigation' | 'tasks' | 'general'

/** A key that exists in the translation catalogs, checked at compile time. */
export type LabelKey = ParseKeys

export interface HotkeyDef {
  /** Normalized chords, as produced by `eventToChord`. */
  chords: string[]
  /** i18n key for the human-readable action name. */
  labelKey: LabelKey
  group: HotkeyGroup
  /**
   * Handled by a focused element's own onKeyDown rather than the global
   * dispatcher. Listed here for the help overlay, never registered.
   */
  local?: boolean
  /**
   * Subset of `chords` that still fire while a text field has focus. Modifier
   * combos qualify; a bare `/` must not, or it could never be typed.
   */
  inputChords?: string[]
}

export const HOTKEYS = {
  // ── Navigation ────────────────────────────────────────────────
  goInbox: { chords: ['g i'], labelKey: 'hotkeys.goInbox', group: 'navigation' },
  goToday: { chords: ['g t'], labelKey: 'hotkeys.goToday', group: 'navigation' },
  goPlan: { chords: ['g p'], labelKey: 'hotkeys.goPlan', group: 'navigation' },
  goReview: { chords: ['g r'], labelKey: 'hotkeys.goReview', group: 'navigation' },
  goHabits: { chords: ['g h'], labelKey: 'hotkeys.goHabits', group: 'navigation' },
  goReport: { chords: ['g o'], labelKey: 'hotkeys.goReport', group: 'navigation' },
  goWorkLog: { chords: ['g l'], labelKey: 'hotkeys.goWorkLog', group: 'navigation' },
  togglePlanTab: { chords: ['v'], labelKey: 'hotkeys.togglePlanTab', group: 'navigation' },
  reviewNextProject: {
    chords: ['arrowright'],
    labelKey: 'hotkeys.reviewNextProject',
    group: 'navigation',
  },

  // ── Tasks ─────────────────────────────────────────────────────
  newTask: { chords: ['n'], labelKey: 'hotkeys.newTask', group: 'tasks' },
  rowNext: { chords: ['j', 'arrowdown'], labelKey: 'hotkeys.rowNext', group: 'tasks' },
  rowPrev: { chords: ['k', 'arrowup'], labelKey: 'hotkeys.rowPrev', group: 'tasks' },
  rowEdit: { chords: ['enter'], labelKey: 'hotkeys.rowEdit', group: 'tasks', local: true },
  rowComplete: { chords: ['x', 'space'], labelKey: 'hotkeys.rowComplete', group: 'tasks', local: true },
  rowToday: { chords: ['t'], labelKey: 'hotkeys.rowToday', group: 'tasks', local: true },
  rowWeek: { chords: ['w'], labelKey: 'hotkeys.rowWeek', group: 'tasks', local: true },
  rowMust: { chords: ['m'], labelKey: 'hotkeys.rowMust', group: 'tasks', local: true },
  rowGreen: { chords: ['l'], labelKey: 'hotkeys.rowGreen', group: 'tasks', local: true },
  rowEditNotes: {
    chords: ['mod+arrowdown'],
    labelKey: 'hotkeys.rowEditNotes',
    group: 'tasks',
    local: true,
  },
  rowEditTitle: {
    chords: ['mod+arrowup'],
    labelKey: 'hotkeys.rowEditTitle',
    group: 'tasks',
    local: true,
  },
  rowEditSeries: { chords: ['e'], labelKey: 'hotkeys.rowEditSeries', group: 'tasks', local: true },
  rowMoveUp: { chords: ['['], labelKey: 'hotkeys.rowMoveUp', group: 'tasks', local: true },
  rowMoveDown: { chords: [']'], labelKey: 'hotkeys.rowMoveDown', group: 'tasks', local: true },
  rowDelete: { chords: ['delete', 'backspace'], labelKey: 'hotkeys.rowDelete', group: 'tasks', local: true },

  // ── General ───────────────────────────────────────────────────
  palette: {
    chords: ['mod+k', '/'],
    inputChords: ['mod+k'],
    labelKey: 'hotkeys.palette',
    group: 'general',
  },
  help: { chords: ['shift+/'], labelKey: 'hotkeys.help', group: 'general' },
  close: { chords: ['escape'], labelKey: 'hotkeys.close', group: 'general', local: true },
} satisfies Record<string, HotkeyDef>

export type HotkeyName = keyof typeof HOTKEYS

export const HOTKEY_GROUP_ORDER: HotkeyGroup[] = ['navigation', 'tasks', 'general']

/**
 * Every chord the app binds anywhere, including the `local` ones a focused
 * element handles itself. Used to tell a shortcut that failed to fire from an
 * ordinary keystroke that was never a shortcut at all -- only the former is
 * worth recording as friction.
 */
export const ALL_CHORDS: ReadonlySet<string> = new Set(
  Object.values(HOTKEYS).flatMap((def) => def.chords),
)

/** First tokens of multi-key chords, e.g. `g`. */
export const SEQUENCE_PREFIXES: ReadonlySet<string> = new Set(
  Object.values(HOTKEYS)
    .flatMap((def) => def.chords)
    .filter((chord) => chord.includes(' '))
    .map((chord) => chord.split(' ')[0]),
)

/** Milliseconds to wait for the second key of a sequence before giving up. */
export const SEQUENCE_TIMEOUT_MS = 1200

if (import.meta.env?.DEV) {
  // A prefix key cannot also be a standalone shortcut — the dispatcher would
  // have to guess which one the user meant.
  for (const [name, def] of Object.entries(HOTKEYS)) {
    for (const chord of def.chords) {
      if (!chord.includes(' ') && SEQUENCE_PREFIXES.has(chord)) {
        throw new Error(
          `Hotkey "${name}" binds "${chord}", which is reserved as a sequence prefix.`,
        )
      }
    }
  }
}
