import { Fragment, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Task } from '../api/types'
import { Ic } from './Icon'

/**
 * A project's finished tasks. They only ever accumulate -- a daily recurring
 * task adds one a day -- so the list starts folded, and once open it can be
 * narrowed by title.
 *
 * `variant` says where it sits: Project gives it a card of its own, Review
 * tucks it under the open tasks in the card the two share.
 */
export function CompletedTasks({
  tasks,
  variant,
  renderTask,
  revealTaskId,
}: {
  tasks: Task[]
  variant: 'card' | 'section'
  renderTask: (task: Task) => ReactNode
  /** A task the caller is about to focus. If it is finished, the list opens for it. */
  revealTaskId?: number
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [seenReveal, setSeenReveal] = useState<number>()

  // The palette can jump straight to a finished task, and the caller focuses
  // that row as soon as this commit lands -- so the list has to be open, and the
  // row unfiltered, in the same render. An effect would be one render too late.
  // Keyed on the change, so folding the list again afterwards sticks.
  if (revealTaskId !== seenReveal) {
    setSeenReveal(revealTaskId)
    if (revealTaskId !== undefined && tasks.some((x) => x.id === revealTaskId)) {
      setOpen(true)
      setQuery('')
    }
  }

  // Folding forgets the search, so a list opened again later is never
  // silently short.
  const toggle = () => {
    setOpen((o) => !o)
    setQuery('')
  }

  const needle = query.trim().toLowerCase()
  const shown = needle ? tasks.filter((x) => x.title.toLowerCase().includes(needle)) : tasks
  const count = needle
    ? t('common.countOf', { shown: shown.length, total: tasks.length })
    : tasks.length
  const label = `${t('common.completed')} (${count})`

  const toggleButton = (
    <button type="button" className="btn btn-g btn-s" aria-expanded={open} onClick={toggle}>
      <Ic n={open ? 'chevron-up' : 'chevron-down'} s={12} />
      {open ? t('common.hideCompleted') : t('common.showCompleted', { count: tasks.length })}
    </button>
  )

  const body = open && (
    <>
      <div className={`px-4 pt-1.5 pb-2.5 ${variant === 'card' ? 'border-b border-line' : ''}`}>
        <div className="relative">
          <span className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-ink-3">
            <Ic n="search" s={13} />
          </span>
          <input
            className="input pl-[30px] pr-7"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return
              // Clear first; with nothing left to clear, hand the keyboard back to
              // the page -- a focused field switches the single-letter hotkeys off.
              e.preventDefault()
              if (query) setQuery('')
              else e.currentTarget.blur()
            }}
            placeholder={t('common.searchCompleted')}
            aria-label={t('common.searchCompleted')}
          />
          {query && (
            <button
              type="button"
              className="absolute right-[8px] top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
              onClick={() => setQuery('')}
              tabIndex={-1}
              aria-label={t('common.clearSearch')}
            >
              <Ic n="x" s={12} />
            </button>
          )}
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="px-4 py-3 text-xs text-ink-3">
          {t('common.searchCompletedNoResults', { query: query.trim() })}
        </div>
      ) : (
        shown.map((task) => <Fragment key={task.id}>{renderTask(task)}</Fragment>)
      )}
    </>
  )

  if (variant === 'card') {
    return (
      <div className="card">
        <div className={`card-head ${open ? '' : 'border-b-0'}`}>
          <h3 className="text-ink-3">{label}</h3>
          {toggleButton}
        </div>
        {body}
      </div>
    )
  }

  return (
    <div className="border-b border-line">
      <div className="flex items-center justify-between px-4 pt-2.5 pb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[.07em] text-ink-3">{label}</span>
        {toggleButton}
      </div>
      {body}
    </div>
  )
}
