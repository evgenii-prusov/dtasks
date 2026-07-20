import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface ToastState {
  id: number
  title: string
  onUndo: () => void
}

interface UndoToastContextValue {
  showUndo: (title: string, onUndo: () => void) => void
}

const UndoToastContext = createContext<UndoToastContextValue | null>(null)

const VISIBLE_MS = 3500
const FADE_MS = 600

export function UndoToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [toast, setToast] = useState<ToastState | null>(null)
  const [fading, setFading] = useState(false)
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = () => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current)
    if (removeTimer.current) clearTimeout(removeTimer.current)
  }

  useEffect(() => clearTimers, [])

  const startDismiss = useCallback(() => {
    setFading(true)
    removeTimer.current = setTimeout(() => {
      setToast(null)
      setFading(false)
    }, FADE_MS)
  }, [])

  const showUndo = useCallback((title: string, onUndo: () => void) => {
    clearTimers()
    setFading(false)
    setToast({ id: Date.now(), title, onUndo })
    fadeTimer.current = setTimeout(startDismiss, VISIBLE_MS)
  }, [startDismiss])

  const handleUndo = () => {
    if (!toast) return
    clearTimers()
    toast.onUndo()
    startDismiss()
  }

  return (
    <UndoToastContext.Provider value={{ showUndo }}>
      {children}
      {toast && (
        <div className={`undo-toast${fading ? ' fading' : ''}`} key={toast.id}>
          <span className="undo-toast-msg">
            {t('task.doneToast', { title: toast.title })}
          </span>
          <button className="undo-toast-btn" onClick={handleUndo}>
            {t('common.undo')}
          </button>
        </div>
      )}
    </UndoToastContext.Provider>
  )
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = (_title: string, _onUndo: () => void) => {}

export function useShowUndoToast(): (title: string, onUndo: () => void) => void {
  const ctx = useContext(UndoToastContext)
  return ctx?.showUndo ?? noop
}
