import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  HOTKEYS,
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

const SHORTCUT_COLUMNS: HotkeyGroup[][] = [
  ['navigation', 'general'],
  ['tasks'],
]

/**
 * The shortcut list, generated from the binding table so it can never drift
 * from what the dispatcher actually does.
 */
export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => {
      if (previous && document.contains(previous)) previous.focus()
    }
  }, [])

  const entries = Object.values(HOTKEYS)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }

    if (e.key === 'Tab') {
      // Keep focus inside dialog
      return
    }

    const body = bodyRef.current
    if (!body) return

    const SCROLL_STEP = 48
    const PAGE_STEP = body.clientHeight * 0.8

    switch (e.key) {
      case 'ArrowDown':
      case 'j':
      case 'J':
        e.preventDefault()
        e.stopPropagation()
        body.scrollBy({ top: SCROLL_STEP, behavior: 'smooth' })
        break
      case 'ArrowUp':
      case 'k':
      case 'K':
        e.preventDefault()
        e.stopPropagation()
        body.scrollBy({ top: -SCROLL_STEP, behavior: 'smooth' })
        break
      case 'PageDown':
        e.preventDefault()
        e.stopPropagation()
        body.scrollBy({ top: PAGE_STEP, behavior: 'smooth' })
        break
      case 'PageUp':
        e.preventDefault()
        e.stopPropagation()
        body.scrollBy({ top: -PAGE_STEP, behavior: 'smooth' })
        break
      case ' ':
        if (e.shiftKey) {
          e.preventDefault()
          e.stopPropagation()
          body.scrollBy({ top: -PAGE_STEP, behavior: 'smooth' })
        } else if (
          e.target === panelRef.current ||
          body.contains(e.target as Node)
        ) {
          e.preventDefault()
          e.stopPropagation()
          body.scrollBy({ top: PAGE_STEP, behavior: 'smooth' })
        }
        break
      case 'Home':
        e.preventDefault()
        e.stopPropagation()
        body.scrollTo({ top: 0, behavior: 'smooth' })
        break
      case 'End':
        e.preventDefault()
        e.stopPropagation()
        body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' })
        break
    }
  }

  return (
    <>
      <div className="overlay-backdrop" aria-hidden onClick={onClose} />
      <div
        ref={panelRef}
        className="overlay-panel overlay-panel-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="overlay-head">
          <span className="overlay-title" id="shortcuts-title">
            {t('hotkeys.title')}
          </span>
          <button
            className="btn btn-g btn-s"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <Ic n="x" s={12} />
          </button>
        </div>
        <div ref={bodyRef} className="overlay-body shortcuts-grid">
          {SHORTCUT_COLUMNS.map((columnGroups, colIdx) => (
            <div key={colIdx} className="shortcuts-column">
              {columnGroups.map((group) => (
                <div key={group} className="shortcuts-group">
                  <div className="kbd-group-label">
                    {t(GROUP_LABEL_KEYS[group])}
                  </div>
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
          ))}
        </div>
      </div>
    </>
  )
}
