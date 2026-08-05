import { useNavigate } from '@tanstack/react-router'
import { HOTKEYS } from './bindings'
import { useHotkey } from './useHotkey'

/**
 * App-wide page jumps. Registered once by the layout at the `global` layer, so
 * any view can shadow a chord with a `page`-layer binding of its own.
 */
export function useGlobalHotkeys() {
  const navigate = useNavigate()
  const go = (to: string) => () => {
    navigate({ to })
  }

  useHotkey(HOTKEYS.goToday.chords, go('/'), { layer: 'global' })
  useHotkey(HOTKEYS.goPlan.chords, go('/plan'), { layer: 'global' })
  useHotkey(HOTKEYS.goReview.chords, go('/review'), { layer: 'global' })
  useHotkey(HOTKEYS.goHabits.chords, go('/habits'), { layer: 'global' })
  useHotkey(HOTKEYS.goReport.chords, go('/report'), { layer: 'global' })
}
