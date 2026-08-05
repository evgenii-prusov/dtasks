import { useNavigate } from '@tanstack/react-router'
import { setNavCause } from '../analytics'
import { HOTKEYS } from './bindings'
import { useHotkey } from './useHotkey'

/**
 * App-wide page jumps. Registered once by the layout at the `global` layer, so
 * any view can shadow a chord with a `page`-layer binding of its own.
 */
export function useGlobalHotkeys() {
  const navigate = useNavigate()
  const go = (to: string) => () => {
    setNavCause('hotkey')
    navigate({ to })
  }

  useHotkey(HOTKEYS.goToday.chords, go('/'), { layer: 'global', name: 'goToday' })
  useHotkey(HOTKEYS.goPlan.chords, go('/plan'), { layer: 'global', name: 'goPlan' })
  useHotkey(HOTKEYS.goReview.chords, go('/review'), { layer: 'global', name: 'goReview' })
  useHotkey(HOTKEYS.goHabits.chords, go('/habits'), { layer: 'global', name: 'goHabits' })
  useHotkey(HOTKEYS.goReport.chords, go('/report'), { layer: 'global', name: 'goReport' })
}
