import { useEffect, useId, useRef } from 'react'
import { useHotkeyApi, type HotkeyLayer } from './HotkeyProvider'

export interface UseHotkeyOptions {
  /** When false the binding is not registered at all. */
  enabled?: boolean
  layer?: HotkeyLayer
  /** Allow the binding to fire while a text field has focus (Cmd+K, Escape). */
  allowInInput?: boolean
}

/**
 * Binds one or more chords to a handler for as long as the component is mounted.
 *
 * The handler is held in a ref, so an inline arrow function does not cause a
 * re-registration on every render. Return `false` from it to decline the key.
 */
export function useHotkey(
  chords: string | string[],
  handler: () => void | boolean,
  { enabled = true, layer = 'page', allowInInput = false }: UseHotkeyOptions = {},
) {
  const id = useId()
  const api = useHotkeyApi()
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  const chordKey = Array.isArray(chords) ? chords.join('|') : chords

  useEffect(() => {
    if (!enabled) return
    api.register(id, {
      chords: chordKey.split('|'),
      handler: () => handlerRef.current(),
      layer,
      allowInInput,
      enabled: true,
    })
    return () => api.unregister(id)
  }, [api, id, chordKey, layer, allowInInput, enabled])
}
