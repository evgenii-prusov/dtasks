import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  HOTKEYS,
  HOTKEY_GROUP_ORDER,
  type HotkeyGroup,
  type LabelKey,
} from '../lib/hotkeys/bindings'
import { KbdList } from './Kbd'
import { Ic } from './Icon'

const GROUP_LABEL_KEYS: Record<HotkeyGroup, LabelKey> = {
  navigation: 'hotkeys.groupNavigation',
  tasks: 'hotkeys.groupTasks',
  general: 'hotkeys.groupGeneral',
}

/**
 * The shortcut list, generated from the binding table so it can never drift
 * from what the dispatcher actually does.
 */
export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => {
      if (previous && document.contains(previous)) previous.focus()
    }
  }, [])

  const entries = Object.values(HOTKEYS)

  return (
    <>
      <div className="overlay-backdrop" aria-hidden onClick={onClose} />
      <div
        ref={panelRef}
        className="overlay-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
          // Keep Tab inside the dialog — the close button is the only stop.
          if (e.key === 'Tab') e.preventDefault()
        }}
      >
        <div className="overlay-head">
          <span className="overlay-title" id="shortcuts-title">
            {t('hotkeys.title')}
          </span>
          <button
            ref={closeRef}
            className="btn btn-g btn-s"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <Ic n="x" s={12} />
          </button>
        </div>
        <div className="overlay-body">
          {HOTKEY_GROUP_ORDER.map((group) => (
            <div key={group}>
              <div className="kbd-group-label">{t(GROUP_LABEL_KEYS[group])}</div>
              {entries
                .filter((def) => def.group === group)
                .map((def) => (
                  <div key={def.labelKey} className="kbd-row">
                    <span>{t(def.labelKey)}</span>
                    <KbdList chords={def.chords} />
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
