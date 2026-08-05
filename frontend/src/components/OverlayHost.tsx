import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { track } from '../lib/analytics'
import { HOTKEYS } from '../lib/hotkeys/bindings'
import { useHotkeyApi } from '../lib/hotkeys/HotkeyProvider'
import { useHotkey } from '../lib/hotkeys/useHotkey'
import { ShortcutsHelp } from './ShortcutsHelp'
import { CommandPalette } from './CommandPalette'

interface OverlayControls {
  openPalette: () => void
  openHelp: () => void
}

const OverlayContext = createContext<OverlayControls>({ openPalette: () => {}, openHelp: () => {} })

/** Lets ordinary UI (a sidebar button, a menu item) open what a chord opens. */
export function useOverlays(): OverlayControls {
  return useContext(OverlayContext)
}

/**
 * Owns every app-wide overlay. While one is open it holds the hotkey layer's
 * overlay lock, which suppresses page and global bindings — so no other
 * component needs to know an overlay exists.
 */
export function OverlayHost({ children }: { children: ReactNode }) {
  const [helpOpen, setHelpOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const api = useHotkeyApi()

  // `via` separates the two chords from a click, so it is visible whether the
  // palette is being reached by keyboard at all.
  const openPalette = (via: string) => () => {
    track('palette.open', { via })
    setPaletteOpen(true)
  }
  const openHelp = (via: string) => () => {
    // Opening help repeatedly means the shortcuts are not sticking.
    track('help.open', { via })
    setHelpOpen(true)
  }

  useHotkey(HOTKEYS.help.chords, openHelp('hotkey'), { layer: 'global', name: 'help' })
  // Cmd/Ctrl+K reaches the palette even from inside a text field; a bare `/`
  // must not, or it could never be typed.
  useHotkey(HOTKEYS.palette.inputChords, openPalette('mod+k'), {
    layer: 'global',
    allowInInput: true,
    name: 'palette',
  })
  useHotkey(
    HOTKEYS.palette.chords.filter((c) => !HOTKEYS.palette.inputChords.includes(c)),
    openPalette('slash'),
    { layer: 'global', name: 'palette' },
  )

  const anyOpen = helpOpen || paletteOpen
  useEffect(() => {
    if (!anyOpen) return
    return api.pushOverlay()
  }, [anyOpen, api])

  return (
    <OverlayContext.Provider value={{ openPalette: openPalette('click'), openHelp: openHelp('click') }}>
      {children}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
    </OverlayContext.Provider>
  )
}
