/**
 * Tracks whether the user is currently driving the app with the keyboard or a
 * pointer, so every recorded action can say which.
 *
 * This exists to answer one question: is the user migrating from mouse to
 * keyboard? Counting hotkey presses alone cannot answer it -- without an
 * equally faithful count of the mouse path there is no denominator, and
 * keyboard usage would appear to climb whenever instrumentation coverage did.
 * Stamping a modality onto *every* action turns it into a ratio.
 *
 * The heuristic is "most recent input wins", the same one browsers use for
 * `:focus-visible`. It holds here because DTask's mutations are optimistic and
 * fire within milliseconds of the interaction that caused them.
 */

export type InputModality = 'keyboard' | 'mouse' | 'touch' | 'pen' | 'unknown'

/**
 * How long an input event keeps explaining subsequent actions. Anything later
 * than this had no human gesture behind it -- a timer, a refetch, a lazily
 * generated recurrence -- and is honestly reported as `unknown` rather than
 * being misattributed to whatever the user last touched.
 */
const ATTRIBUTION_WINDOW_MS = 2000

let lastModality: InputModality = 'unknown'
let lastAt = 0
let installed = false

/** Maps a PointerEvent's pointerType, so a phone tap is never counted as a mouse. */
function fromPointerType(pointerType: string): InputModality {
  if (pointerType === 'touch') return 'touch'
  if (pointerType === 'pen') return 'pen'
  return 'mouse'
}

function record(modality: InputModality) {
  lastModality = modality
  lastAt = Date.now()
}

/** The modality behind whatever is happening right now. */
export function currentModality(): InputModality {
  if (Date.now() - lastAt > ATTRIBUTION_WINDOW_MS) return 'unknown'
  return lastModality
}

export function installInputModalityTracking(target: Document = document): () => void {
  if (installed) return () => {}
  installed = true

  const onKeyDown = () => record('keyboard')
  const onPointerDown = (e: Event) => {
    const pointerType = (e as PointerEvent).pointerType
    record(pointerType ? fromPointerType(pointerType) : 'mouse')
  }

  // Capture phase: a handler that stops propagation must not hide the gesture.
  target.addEventListener('keydown', onKeyDown, true)
  target.addEventListener('pointerdown', onPointerDown, true)

  return () => {
    target.removeEventListener('keydown', onKeyDown, true)
    target.removeEventListener('pointerdown', onPointerDown, true)
    installed = false
  }
}

/** Test seam: forget any recorded gesture. */
export function resetInputModality() {
  lastModality = 'unknown'
  lastAt = 0
}
