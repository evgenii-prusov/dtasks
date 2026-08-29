import { useNavigate } from '@tanstack/react-router'
import { useProjects } from '../../api/hooks'
import { isInboxProject } from '../../api/types'
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

  // The Inbox is a project route rather than a fixed path, so this one jump
  // needs the project itself. Nothing to jump to until it loads, and the
  // binding stays unregistered until then rather than swallowing the chord.
  const { data: projects = [] } = useProjects()
  const inbox = projects.find(isInboxProject)
  useHotkey(
    HOTKEYS.goInbox.chords,
    () => {
      if (!inbox) return
      setNavCause('hotkey')
      navigate({ to: '/projects/$projectId', params: { projectId: String(inbox.id) } })
    },
    { layer: 'global', name: 'goInbox', enabled: inbox !== undefined },
  )

  useHotkey(HOTKEYS.goToday.chords, go('/'), { layer: 'global', name: 'goToday' })
  useHotkey(HOTKEYS.goPlan.chords, go('/plan'), { layer: 'global', name: 'goPlan' })
  useHotkey(HOTKEYS.goReview.chords, go('/review'), { layer: 'global', name: 'goReview' })
  useHotkey(HOTKEYS.goHabits.chords, go('/habits'), { layer: 'global', name: 'goHabits' })
  useHotkey(HOTKEYS.goReport.chords, go('/report'), { layer: 'global', name: 'goReport' })
  useHotkey(HOTKEYS.goWorkLog.chords, go('/worklog'), { layer: 'global', name: 'goWorkLog' })
}
