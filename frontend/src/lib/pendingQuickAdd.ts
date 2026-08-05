import { useSyncExternalStore } from 'react'

/**
 * A one-shot handoff of typed text from the command palette to QuickAddTask.
 *
 * The palette can create a task directly when the target project is
 * unambiguous. When it isn't, it parks the text here and navigates to Today,
 * where QuickAddTask picks it up — so the `#tag` autocomplete, project
 * auto-creation and Work/Personal prompt keep living in exactly one place.
 */
let pending: string | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setPendingQuickAdd(text: string) {
  pending = text
  emit()
}

export function clearPendingQuickAdd() {
  if (pending === null) return
  pending = null
  emit()
}

export function usePendingQuickAdd(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => pending,
    () => null,
  )
}
