import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
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

  const openPalette = () => setPaletteOpen(true)
  const openHelp = () => setHelpOpen(true)

  useHotkey(HOTKEYS.help.chords, openHelp, { layer: 'global' })
  // Cmd/Ctrl+K reaches the palette even from inside a text field; a bare `/`
  // must not, or it could never be typed.
  useHotkey(HOTKEYS.palette.inputChords, openPalette, { layer: 'global', allowInInput: true })
  useHotkey(
    HOTKEYS.palette.chords.filter((c) => !HOTKEYS.palette.inputChords.includes(c)),
    openPalette,
    { layer: 'global' },
  )

  const anyOpen = helpOpen || paletteOpen
  useEffect(() => {
    if (!anyOpen) return
    return api.pushOverlay()
  }, [anyOpen, api])

  return (
    <OverlayContext.Provider value={{ openPalette, openHelp }}>
      {children}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
    </OverlayContext.Provider>
  )
}
