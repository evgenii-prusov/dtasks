/**
 * Renders a normalized chord (`mod+k`, `g p`, `arrowdown`) as keycaps.
 * Sequences are shown as separate caps in order: `g p` → [G] [P].
 */

const TOKEN_LABELS: Record<string, string> = {
  mod: navigator.platform?.toLowerCase().includes('mac') ? '⌘' : 'Ctrl',
  shift: '⇧',
  alt: navigator.platform?.toLowerCase().includes('mac') ? '⌥' : 'Alt',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  enter: '↵',
  escape: 'Esc',
  space: 'Space',
  backspace: '⌫',
  delete: 'Del',
  tab: 'Tab',
}

function label(token: string): string {
  return TOKEN_LABELS[token] ?? (token.length === 1 ? token.toUpperCase() : token)
}

/** Chords better shown as the character they produce than as their parts. */
const CHORD_ALIASES: Record<string, string> = { 'shift+/': '?' }

/** Splits `mod+shift+k` into its display caps. */
function caps(chord: string): string[] {
  const alias = CHORD_ALIASES[chord]
  if (alias) return [alias]
  return chord.split('+').map(label)
}

export function Kbd({ chord }: { chord: string }) {
  return (
    <>
      {chord.split(' ').map((step, i) => (
        <kbd key={`${step}-${i}`} className="kbd">
          {caps(step).join(' ')}
        </kbd>
      ))}
    </>
  )
}

/** All chords for one action, separated by "or". */
export function KbdList({ chords }: { chords: readonly string[] }) {
  return (
    <span className="kbd-keys">
      {chords.map((chord, i) => (
        <span key={chord} className="kbd-keys">
          {i > 0 && <span className="text-[10px] text-ink-3">/</span>}
          <Kbd chord={chord} />
        </span>
      ))}
    </span>
  )
}
