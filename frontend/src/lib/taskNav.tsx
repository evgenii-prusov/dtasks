import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { HOTKEYS } from './hotkeys/bindings'
import { useHotkey } from './hotkeys/useHotkey'

export interface TaskNavApi {
  /** Callback ref: pass the row element, or null on unmount. */
  register: (taskId: number, el: HTMLElement | null) => void
  /** Focus a specific row. Returns false when it is not on screen. */
  focus: (taskId: number) => boolean
  /** Move the active row by `delta`. Returns false when there are no rows. */
  move: (delta: number) => boolean
  setActive: (taskId: number | null) => void
  /**
   * Declare that focus should land on a neighbour when `taskId` disappears,
   * even if focus has already been lost — `window.confirm` blanks
   * `document.activeElement`, so the usual "did it have focus" check can't see it.
   */
  requestFocusAfterRemoval: (taskId: number) => void
}

const TaskNavContext = createContext<TaskNavApi | null>(null)

const noopApi: TaskNavApi = {
  register: () => {},
  focus: () => false,
  move: () => false,
  setActive: () => {},
  requestFocusAfterRemoval: () => {},
}

/**
 * Tracks which task row is "current" across every view.
 *
 * Rows self-register, and their order is derived from the DOM at keypress time
 * via `compareDocumentPosition` rather than maintained. That means one
 * implementation spans Today's four sections, Plan's per-project cards and
 * search results, Project's open/completed lists and Review — with no view
 * having to hand over an ordered array it would have to keep in sync.
 */
export function TaskNavProvider({ children }: { children: ReactNode }) {
  const nodes = useRef(new Map<number, HTMLElement>())
  const activeId = useRef<number | null>(null)
  const listeners = useRef(new Set<() => void>())
  /** Last computed order, so a removed row can still name its neighbours. */
  const lastOrder = useRef<number[]>([])
  const focusAfterRemoval = useRef<number | null>(null)

  const emit = useCallback(() => {
    for (const listener of listeners.current) listener()
  }, [])

  const setActive = useCallback(
    (taskId: number | null) => {
      if (activeId.current === taskId) return
      activeId.current = taskId
      emit()
    },
    [emit],
  )

  const orderedIds = useCallback(() => {
    const entries = [...nodes.current.entries()]
    entries.sort(([, a], [, b]) =>
      // eslint-disable-next-line no-bitwise
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    )
    lastOrder.current = entries.map(([id]) => id)
    return lastOrder.current
  }, [])

  const focus = useCallback(
    (taskId: number) => {
      const node = nodes.current.get(taskId)
      if (!node) return false
      node.focus()
      node.scrollIntoView({ block: 'nearest' })
      setActive(taskId)
      return true
    },
    [setActive],
  )

  const unregister = useCallback(
    (taskId: number) => {
      const node = nodes.current.get(taskId)
      const hadFocus =
        !!node && (document.activeElement === node || node.contains(document.activeElement))
      const wanted = focusAfterRemoval.current === taskId
      if (wanted) focusAfterRemoval.current = null

      nodes.current.delete(taskId)
      if (activeId.current !== taskId) return

      // Prefer the next row, fall back to the previous one.
      const order = lastOrder.current
      const from = order.indexOf(taskId)
      let next: number | null = null
      for (let i = from + 1; i < order.length && next === null; i++) {
        if (nodes.current.has(order[i])) next = order[i]
      }
      for (let i = from - 1; i >= 0 && next === null; i--) {
        if (nodes.current.has(order[i])) next = order[i]
      }

      setActive(next)
      // Only chase focus if this row actually had it. Without that check,
      // typing in Plan's search box — which unmounts every row — would yank
      // the caret out of the input on the first keystroke.
      if (next !== null && (hadFocus || wanted)) {
        queueMicrotask(() => {
          nodes.current.get(next)?.focus()
        })
      }
    },
    [setActive],
  )

  const register = useCallback(
    (taskId: number, el: HTMLElement | null) => {
      if (el) nodes.current.set(taskId, el)
      else unregister(taskId)
    },
    [unregister],
  )

  const move = useCallback(
    (delta: number) => {
      const order = orderedIds()
      if (order.length === 0) return false

      const current = activeId.current
      const from = current === null ? -1 : order.indexOf(current)
      if (from === -1) return focus(order[0])

      const to = Math.min(order.length - 1, Math.max(0, from + delta))
      return focus(order[to])
    },
    [orderedIds, focus],
  )

  const requestFocusAfterRemoval = useCallback((taskId: number) => {
    focusAfterRemoval.current = taskId
  }, [])

  const api = useMemo<TaskNavApi>(
    () => ({ register, focus, move, setActive, requestFocusAfterRemoval }),
    [register, focus, move, setActive, requestFocusAfterRemoval],
  )

  const subscribe = useCallback((listener: () => void) => {
    listeners.current.add(listener)
    return () => listeners.current.delete(listener)
  }, [])

  const store = useMemo(
    () => ({ subscribe, getActive: () => activeId.current }),
    [subscribe],
  )

  return (
    <TaskNavContext.Provider value={api}>
      <TaskNavStoreContext.Provider value={store}>
        <TaskNavHotkeys />
        {children}
      </TaskNavStoreContext.Provider>
    </TaskNavContext.Provider>
  )
}

interface TaskNavStore {
  subscribe: (listener: () => void) => () => void
  getActive: () => number | null
}

const TaskNavStoreContext = createContext<TaskNavStore | null>(null)

/** j/k and the arrow keys, registered once for the whole app. */
function TaskNavHotkeys() {
  const nav = useTaskNav()
  // Declining (returning false) when there are no rows leaves the arrow keys
  // to the browser, so the page still scrolls.
  useHotkey(HOTKEYS.rowNext.chords, () => nav.move(1), { layer: 'global' })
  useHotkey(HOTKEYS.rowPrev.chords, () => nav.move(-1), { layer: 'global' })
  return null
}

export function useTaskNav(): TaskNavApi {
  return useContext(TaskNavContext) ?? noopApi
}

/**
 * Subscribes a single row to its own active state, so moving the highlight
 * re-renders only the two rows involved rather than the whole list.
 */
export function useIsActiveRow(taskId: number): boolean {
  const store = useContext(TaskNavStoreContext)
  return useSyncExternalStore(
    store?.subscribe ?? (() => () => {}),
    () => store?.getActive() === taskId,
    () => false,
  )
}
