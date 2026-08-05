import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { track } from '../analytics'
import { ALL_CHORDS, SEQUENCE_PREFIXES, SEQUENCE_TIMEOUT_MS } from './bindings'
import {
  eventToAliasChord,
  eventToChord,
  isHotkeysOff,
  isModifierKey,
  isTypingTarget,
} from './keyEvent'

export type HotkeyLayer = 'global' | 'page' | 'overlay'

const LAYER_RANK: Record<HotkeyLayer, number> = { global: 10, page: 20, overlay: 30 }

export interface HotkeyRegistration {
  chords: string[]
  /** Return false to decline the key, letting a lower binding or the browser have it. */
  handler: () => void | boolean
  layer: HotkeyLayer
  allowInInput: boolean
  enabled: boolean
  /**
   * Which shortcut this is, for usage tracking. Carried on the registration
   * rather than looked up from the chord because chords are ambiguous --
   * `enter`, `escape` and `arrowdown` each appear in several bindings, and only
   * the winning registration knows which layer claimed the key.
   */
  name?: string
}

interface HotkeyApi {
  register: (id: string, registration: HotkeyRegistration) => void
  unregister: (id: string) => void
  /** Suppresses every binding below the overlay layer until the returned function runs. */
  pushOverlay: () => () => void
  hasPendingPrefix: () => boolean
}

const HotkeyApiContext = createContext<HotkeyApi | null>(null)
const HotkeyOverlayContext = createContext(false)

const noopApi: HotkeyApi = {
  register: () => {},
  unregister: () => {},
  pushOverlay: () => () => {},
  hasPendingPrefix: () => false,
}

/**
 * Owns the app's single `keydown` listener. Components register bindings
 * through `useHotkey`; this decides which one wins.
 *
 * Precedence is by layer (overlay > page > global), then by registration
 * recency within a layer — so a view that binds `n` for its own add-form beats
 * a global fallback without either side coordinating.
 */
export function HotkeyProvider({ children }: { children: ReactNode }) {
  const bindings = useRef(new Map<string, HotkeyRegistration & { seq: number }>())
  const seqCounter = useRef(0)
  const pendingPrefix = useRef<string | null>(null)
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A counter, not a boolean: StrictMode double-mounts must net out to one.
  const overlayDepth = useRef(0)
  const [overlayOpen, setOverlayOpen] = useState(false)

  const clearPending = useCallback(() => {
    pendingPrefix.current = null
    if (pendingTimer.current) {
      clearTimeout(pendingTimer.current)
      pendingTimer.current = null
    }
  }, [])

  const hasPendingPrefix = useCallback(() => {
    return pendingPrefix.current !== null
  }, [])

  const register = useCallback((id: string, registration: HotkeyRegistration) => {
    const existing = bindings.current.get(id)
    bindings.current.set(id, {
      ...registration,
      seq: existing?.seq ?? ++seqCounter.current,
    })
  }, [])

  const unregister = useCallback((id: string) => {
    bindings.current.delete(id)
  }, [])

  const pushOverlay = useCallback(() => {
    overlayDepth.current += 1
    setOverlayOpen(true)
    let released = false
    return () => {
      if (released) return
      released = true
      overlayDepth.current = Math.max(0, overlayDepth.current - 1)
      setOverlayOpen(overlayDepth.current > 0)
    }
  }, [])

  const api = useMemo<HotkeyApi>(
    () => ({ register, unregister, pushOverlay, hasPendingPrefix }),
    [register, unregister, pushOverlay, hasPendingPrefix],
  )

  useEffect(() => {
    /** Runs the best matching binding. Returns true when one handled the key. */
    const dispatch = (chord: string, blocked: boolean): boolean => {
      const minRank = overlayDepth.current > 0 ? LAYER_RANK.overlay : 0
      const matches = [...bindings.current.values()]
        .filter(
          (b) =>
            b.enabled &&
            LAYER_RANK[b.layer] >= minRank &&
            b.chords.includes(chord) &&
            (b.allowInInput || !blocked),
        )
        .sort((a, b) => LAYER_RANK[b.layer] - LAYER_RANK[a.layer] || b.seq - a.seq)

      for (const binding of matches) {
        if (binding.handler() !== false) {
          // One place covers every global/page/overlay shortcut in the app.
          // `layer` shows when a view's binding shadowed a global one, which is
          // the signal for shortcuts quietly colliding.
          track('hotkey.use', { name: binding.name ?? null, chord, layer: binding.layer }, 'keyboard')
          return true
        }
      }
      return false
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (isModifierKey(e) || e.defaultPrevented || e.isComposing) return

      const chord = eventToChord(e)
      if (!chord) return

      // Typing into a field, or inside a subtree that opted out: only bindings
      // that explicitly allow it (Cmd+K, Escape) may fire.
      const blocked = isTypingTarget(e.target) || isHotkeysOff(e.target)

      const prefix = pendingPrefix.current
      if (prefix) {
        clearPending()
        if (dispatch(`${prefix} ${chord}`, blocked)) {
          e.preventDefault()
          return
        }
        // No such sequence — fall through and treat this key on its own, so
        // a stray `g` doesn't swallow the next shortcut.
      }

      const bare = !e.metaKey && !e.ctrlKey && !e.altKey
      if (bare && !blocked && !prefix && SEQUENCE_PREFIXES.has(chord)) {
        pendingPrefix.current = chord
        pendingTimer.current = setTimeout(clearPending, SEQUENCE_TIMEOUT_MS)
        e.preventDefault()
        return
      }

      if (chord === 'escape') clearPending()

      const alias = eventToAliasChord(e)
      if (dispatch(chord, blocked) || (alias && dispatch(alias, blocked))) {
        e.preventDefault()
        return
      }

      // A real shortcut that did nothing. `blocked` means focus was in a text
      // field, which is the common case: the user reached for the keyboard and
      // had to fall back to the mouse. That fallback is the concrete obstacle
      // to going keyboard-only, so it is worth more than any success count.
      if (ALL_CHORDS.has(chord)) {
        track('hotkey.miss', { chord, blocked }, 'keyboard')
      }
    }

    const onBlur = () => clearPending()

    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onBlur)
      clearPending()
    }
  }, [clearPending])

  return (
    <HotkeyApiContext.Provider value={api}>
      <HotkeyOverlayContext.Provider value={overlayOpen}>{children}</HotkeyOverlayContext.Provider>
    </HotkeyApiContext.Provider>
  )
}

/**
 * Falls back to a no-op registry when there is no provider, so components can
 * still be rendered bare in unit tests. Mirrors `useShowUndoToast`.
 */
export function useHotkeyApi(): HotkeyApi {
  return useContext(HotkeyApiContext) ?? noopApi
}

/** True while a command palette or help overlay is open. */
export function useOverlayOpen(): boolean {
  return useContext(HotkeyOverlayContext)
}
