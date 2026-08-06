import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { mustHaveCount } from '../api/hooks'
import { useDeleteRecurrence } from '../api/hooks'
import { useDeleteTask } from '../api/hooks'
import { useProjects } from '../api/hooks'
import { useReorderTask } from '../api/hooks'
import { useUpdateRecurrence } from '../api/hooks'
import { useUpdateTask } from '../api/hooks'
import type { Complexity, Project, Task } from '../api/types'
import { track } from '../lib/analytics'
import { weekdayShortLabels } from '../lib/dates'
import { describeRecurrence, maskToWeekdays, weekdaysToMask } from '../lib/recurrence'
import { useIsActiveRow, useTaskNav } from '../lib/taskNav'
import { isTypingTarget } from '../lib/hotkeys/keyEvent'
import { useHotkeyApi } from '../lib/hotkeys/HotkeyProvider'
import { Ic } from './Icon'
import { useShowUndoToast } from './UndoToast'

export function TaskRow({
  task,
  project,
  showProject,
  checkable = false,
  editable = false,
  reorderable = false,
  isFirst = false,
  isLast = false,
  deletable = false,
  right,
  allProjects,
}: {
  task: Task
  project?: Project
  showProject?: boolean
  checkable?: boolean
  editable?: boolean
  reorderable?: boolean
  isFirst?: boolean
  isLast?: boolean
  deletable?: boolean
  right?: ReactNode
  allProjects?: Project[]
}) {
  const { t, i18n } = useTranslation()
  const updateTask = useUpdateTask()
  const reorderTask = useReorderTask()
  const deleteTask = useDeleteTask()
  const updateRecurrence = useUpdateRecurrence()
  const deleteRecurrence = useDeleteRecurrence()
  const showUndo = useShowUndoToast()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes || '')
  const [complexity, setComplexity] = useState<Complexity>(task.complexity)
  const [isGreen, setIsGreen] = useState(task.is_green)
  const [assignedToday, setAssignedToday] = useState(task.assigned_today)
  const [assignedWeek, setAssignedWeek] = useState(task.assigned_week)
  const [selectedProjectId, setSelectedProjectId] = useState(task.project_id)
  const [swiped, setSwiped] = useState(false)

  const rule = project?.recurrences.find((r) => r.id === task.recurrence_rule_id)
  const [editingSeries, setEditingSeries] = useState(false)
  const [seriesTitle, setSeriesTitle] = useState('')
  const [seriesComplexity, setSeriesComplexity] = useState<Complexity>('low')
  const [seriesIsGreen, setSeriesIsGreen] = useState(false)
  const [seriesWeekdays, setSeriesWeekdays] = useState(new Set<number>())

  const touchStartX = useRef<number | null>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  /** Set when the editor is opened by the description chord rather than Enter. */
  const openInNotes = useRef(false)
  const nav = useTaskNav()
  const hotkeyApi = useHotkeyApi()
  const isActive = useIsActiveRow(task.id)

  // One ref feeding both the swipe outside-click check and the nav registry.
  // Must be stable: an inline callback ref is torn down and re-attached on
  // every render, which would look like the row being removed and re-added.
  const setRowRef = useCallback(
    (el: HTMLDivElement | null) => {
      rowRef.current = el
      nav.register(task.id, el)
    },
    [nav, task.id],
  )

  // Saving or cancelling an inline edit should hand focus back to the row.
  const wasEditing = useRef(false)
  useEffect(() => {
    if (wasEditing.current && !editing && !editingSeries) nav.focus(task.id)
    wasEditing.current = editing || editingSeries
  }, [editing, editingSeries, nav, task.id])

  // Opening the editor puts the caret in the title with the text selected, so
  // Enter → type → Enter is a complete rename without touching the mouse.
  // Opened by the description chord instead, it starts in the notes field.
  useEffect(() => {
    if (!editing) return
    if (openInNotes.current) {
      openInNotes.current = false
      caretToEnd(notesRef.current)
      return
    }
    const el = titleRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [editing])

  // Escape key handler while editing task
  useEffect(() => {
    if (!editing) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault()
        e.stopPropagation()
        setEditing(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editing])

  // Escape key handler while editing series
  useEffect(() => {
    if (!editingSeries) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault()
        e.stopPropagation()
        setEditingSeries(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editingSeries])

  // Close swipe when tapping outside
  useEffect(() => {
    if (!swiped) return
    const handler = (e: MouseEvent | TouchEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setSwiped(false)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [swiped])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (dx < -40) {
      setSwiped(true)
    } else if (dx > 10) {
      setSwiped(false)
    }
  }

  const actionsWidth = actionsRef.current?.offsetWidth ?? 160

  const startEdit = () => {
    setSwiped(false)
    setTitle(task.title)
    setNotes(task.notes || '')
    setComplexity(task.complexity)
    setIsGreen(task.is_green)
    setAssignedToday(task.assigned_today)
    setAssignedWeek(task.assigned_week)
    setSelectedProjectId(task.project_id)
    setEditing(true)
  }
  const save = () => {
    const patch: Parameters<typeof updateTask.mutate>[0]['patch'] = {
      title: title.trim() || task.title,
      notes,
      complexity,
      is_green: isGreen,
      assigned_today: assignedToday,
      assigned_week: assignedWeek,
    }
    if (selectedProjectId !== task.project_id) patch.project_id = selectedProjectId
    updateTask.mutate({ id: task.id, patch })
    setEditing(false)
  }
  const cancel = () => setEditing(false)

  /**
   * Cmd/Ctrl+↓ and Cmd/Ctrl+↑ move between the title and the description while
   * the editor is open. Bare Enter belongs to save, and Tab has to keep walking
   * the whole form, so the jump needs a chord of its own.
   */
  const caretToEnd = (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }
  const isFieldJump = (e: React.KeyboardEvent, key: 'ArrowDown' | 'ArrowUp') =>
    e.key === key && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey
  /** True when the key was a jump between the two fields. */
  const handleFieldJump = (e: React.KeyboardEvent) => {
    const target = isFieldJump(e, 'ArrowDown')
      ? notesRef.current
      : isFieldJump(e, 'ArrowUp')
        ? titleRef.current
        : null
    if (!target) return false
    e.preventDefault()
    e.stopPropagation()
    caretToEnd(target)
    return true
  }

  const remove = () => {
    // Declare the intent first: confirm() blanks document.activeElement, so
    // the registry cannot otherwise tell this row was the focused one.
    nav.requestFocusAfterRemoval(task.id)
    if (confirm(t('task.confirmDelete', { title: task.title }))) deleteTask.mutate(task.id)
  }

  const toggleComplete = () => {
    const completing = !task.completed
    updateTask.mutate({ id: task.id, patch: { completed: completing } })
    if (completing) {
      nav.requestFocusAfterRemoval(task.id)
      showUndo(task.title, () => updateTask.mutate({ id: task.id, patch: { completed: false } }))
    }
  }

  const schedule = (when: 'today' | 'week') => {
    updateTask.mutate({
      id: task.id,
      patch:
        when === 'today'
          ? { assigned_today: !task.assigned_today, assigned_week: false }
          : { assigned_week: !task.assigned_week, assigned_today: false },
    })
  }

  const { data: projects = [] } = useProjects()
  const mustCount = mustHaveCount(projects)

  const toggleGreen = () => {
    updateTask.mutate({ id: task.id, patch: { is_green: !task.is_green } })
  }

  const toggleMust = () => {
    const isMustToday = task.must_have && task.assigned_today
    if (isMustToday) {
      updateTask.mutate({ id: task.id, patch: { must_have: false } })
    } else {
      if (mustCount >= 2) {
        alert(t('plan.mustLimit', { count: 2 }))
        return
      }
      updateTask.mutate({
        id: task.id,
        patch: { must_have: true, assigned_today: true, assigned_week: false },
      })
    }
  }

  /**
   * Row-level shortcuts. This handler only exists on the non-editing render,
   * so the inline edit forms below are immune to it without extra guards.
   */
  const onRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isTypingTarget(e.target)) return

    // The one chord the row answers: the key that reaches the description from
    // inside the editor also opens the editor there.
    if (editable && isFieldJump(e, 'ArrowDown')) {
      e.preventDefault()
      e.stopPropagation()
      track('hotkey.use', { name: 'rowEditNotes', chord: 'mod+arrowdown', layer: 'row' }, 'keyboard')
      openInNotes.current = true
      startEdit()
      return
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (hotkeyApi.hasPendingPrefix()) return

    // Every branch below routes through here, so one call instruments all the
    // bare row shortcuts. They are dispatched locally and never reach
    // HotkeyProvider, which is why they need their own tracking to count
    // toward keyboard usage.
    const handled = () => {
      e.preventDefault()
      e.stopPropagation()
      track('hotkey.use', { name: null, chord: e.key.toLowerCase(), layer: 'row' }, 'keyboard')
    }

    switch (e.key) {
      case 'j':
      case 'ArrowDown':
        handled()
        nav.move(1)
        return
      case 'k':
      case 'ArrowUp':
        handled()
        nav.move(-1)
        return
      case 'Enter':
        if (!editable) return
        handled()
        startEdit()
        return
      case 'e':
        if (!editable || !rule) return
        handled()
        startEditSeries()
        return
      case 'x':
      case ' ':
        if (!checkable) return
        handled()
        toggleComplete()
        return
      case 't':
        handled()
        schedule('today')
        return
      case 'w':
        handled()
        schedule('week')
        return
      case 'm':
        handled()
        toggleMust()
        return
      case 'l':
        handled()
        toggleGreen()
        return
      case '[':
        if (!reorderable || isFirst) return
        handled()
        reorderTask.mutate({ id: task.id, direction: 'up' })
        return
      case ']':
        if (!reorderable || isLast) return
        handled()
        reorderTask.mutate({ id: task.id, direction: 'down' })
        return
      case 'Delete':
      case 'Backspace':
        if (!deletable) return
        handled()
        remove()
        return
    }
  }

  const startEditSeries = () => {
    if (!rule) return
    setSwiped(false)
    setSeriesTitle(rule.title)
    setSeriesComplexity(rule.complexity)
    setSeriesIsGreen(rule.is_green)
    setSeriesWeekdays(new Set(maskToWeekdays(rule.weekdays)))
    setEditingSeries(true)
  }
  const saveSeries = () => {
    if (!rule || seriesWeekdays.size === 0) return
    updateRecurrence.mutate({
      id: rule.id,
      patch: {
        title: seriesTitle.trim() || rule.title,
        complexity: seriesComplexity,
        is_green: seriesIsGreen,
        weekdays: weekdaysToMask(seriesWeekdays),
      },
    })
    setEditingSeries(false)
  }
  const cancelSeries = () => setEditingSeries(false)
  const stopRepeating = () => {
    if (!rule) return
    if (confirm(t('task.confirmStopRepeating', { title: rule.title }))) {
      deleteRecurrence.mutate(rule.id)
      setEditingSeries(false)
    }
  }
  const toggleSeriesWeekday = (day: number) => {
    setSeriesWeekdays((prev) => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  if (editingSeries && rule) {
    return (
      <div
        ref={setRowRef}
        className={`task-row items-start ${task.is_green ? 'green' : ''}`}
        data-hotkeys-off
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || e.key === 'Esc') {
            e.preventDefault()
            e.stopPropagation()
            cancelSeries()
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            saveSeries()
          }
        }}
      >
        {checkable && <div className="cb mt-[3px]" />}
        <div className="min-w-0 flex-1">
          <div className="mb-[5px] text-[11px] font-semibold text-ink-3">
            {t('task.editSeriesTitle')}
          </div>
          <input
            className="input mb-[5px] px-2 py-[5px] text-[13px]"
            value={seriesTitle}
            onChange={(e) => setSeriesTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' || e.key === 'Esc') {
                e.preventDefault()
                e.stopPropagation()
                cancelSeries()
              } else if (e.key === 'Enter') {
                e.preventDefault()
                saveSeries()
              }
            }}
            autoFocus
          />
          <div className="mb-1.5 flex flex-wrap items-center gap-1">
            {weekdayShortLabels(i18n.language).map((label, day) => (
              <button
                key={day}
                type="button"
                className={`asgn gap-1 ${seriesWeekdays.has(day) ? 'on' : ''}`}
                onClick={() => toggleSeriesWeekday(day)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <select
              className="sel"
              value={seriesComplexity}
              onChange={(e) => setSeriesComplexity(e.target.value as Complexity)}
            >
              <option value="low">{t('common.lowComplexity')}</option>
              <option value="high">{t('common.highComplexity')}</option>
            </select>
            <button
              className={`asgn gap-1 ${seriesIsGreen ? 'green-on' : ''}`}
              onClick={() => setSeriesIsGreen((g) => !g)}
              title={t('task.greenTooltip')}
            >
              <Ic n="leaf" s={11} /> {t('task.greenToggle')}
            </button>
            <div className="flex-1" />
            <button className="btn btn-g btn-danger btn-s" onClick={stopRepeating}>
              {t('task.stopRepeating')}
            </button>
            <button className="btn btn-g btn-s" onClick={cancelSeries}>
              {t('common.cancel')}
            </button>
            <button className="btn btn-p btn-s" onClick={saveSeries}>
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (editable && editing) {
    return (
      <div
        // Registered like the read-only row: an editor that dropped out of the
        // nav registry would read as a deleted row and hand the active state,
        // and the focus, to a neighbour.
        ref={setRowRef}
        className={`task-row items-start ${task.is_green ? 'green' : ''}`}
        data-hotkeys-off
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || e.key === 'Esc') {
            e.preventDefault()
            e.stopPropagation()
            cancel()
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            e.stopPropagation()
            save()
          }
        }}
      >
        {checkable && <div className="cb mt-[3px]" />}
        <div className="min-w-0 flex-1">
          <input
            ref={titleRef}
            className="input mb-[5px] px-2 py-[5px] text-[13px]"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label={t('common.title')}
            onKeyDown={(e) => {
              if (e.key === 'Escape' || e.key === 'Esc') {
                e.preventDefault()
                e.stopPropagation()
                cancel()
              } else if (handleFieldJump(e)) {
                return
              } else if (e.key === 'Enter') {
                e.preventDefault()
                e.stopPropagation()
                save()
              }
            }}
          />
          <textarea
            ref={notesRef}
            className="input textarea mb-1.5 min-h-11 text-xs"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            aria-label={t('common.notes')}
            onKeyDown={(e) => {
              if (e.key === 'Escape' || e.key === 'Esc') {
                e.preventDefault()
                e.stopPropagation()
                cancel()
              } else if (handleFieldJump(e)) {
                return
              } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                e.stopPropagation()
                save()
              }
            }}
            placeholder={t('task.notesPlaceholder')}
          />
          <div className="flex items-center gap-1.5">
            <select
              className="sel"
              value={complexity}
              onChange={(e) => setComplexity(e.target.value as Complexity)}
            >
              <option value="low">{t('common.lowComplexity')}</option>
              <option value="high">{t('common.highComplexity')}</option>
            </select>
            <button
              className={`asgn gap-1 ${isGreen ? 'green-on' : ''}`}
              onClick={() => setIsGreen((g) => !g)}
              title={t('task.greenTooltip')}
            >
              <Ic n="leaf" s={11} /> {t('task.greenToggle')}
            </button>
            <button
              className={`asgn gap-1 ${assignedToday ? 'on' : ''}`}
              onClick={() => {
                setAssignedToday((v) => !v)
                if (!assignedToday) setAssignedWeek(false)
              }}
            >
              {assignedToday ? '✓' : '+'} {t('task.scheduleToday')}
            </button>
            <button
              className={`asgn gap-1 ${assignedWeek ? 'on' : ''}`}
              onClick={() => {
                setAssignedWeek((v) => !v)
                if (!assignedWeek) setAssignedToday(false)
              }}
            >
              {assignedWeek ? '✓' : '+'} {t('task.scheduleWeek')}
            </button>
            <div className="flex-1" />
            <button className="btn btn-g btn-s" onClick={cancel}>
              {t('common.cancel')}
            </button>
            <button className="btn btn-p btn-s" onClick={save}>
              {t('common.save')}
            </button>
          </div>
          {allProjects && allProjects.length > 1 && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="text-[11px] text-ink-3">{t('task.moveToProject')}:</span>
              <select
                className="sel text-[11px]"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(Number(e.target.value))}
              >
                {Object.entries(
                  allProjects.reduce<Record<string, Project[]>>((acc, p) => {
                    ;(acc[p.group] ??= []).push(p)
                    return acc
                  }, {}),
                ).map(([group, projects]) => (
                  <optgroup key={group} label={group}>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Whether there are swipe-only actions (reorder / delete)
  const hasSwipeActions = reorderable || deletable

  return (
    <div
      ref={setRowRef}
      className={`task-row relative overflow-hidden ${task.is_green ? 'green' : ''}`}
      data-task-row={task.id}
      data-active={isActive || undefined}
      // Roving tabindex: only the current row is a tab stop.
      tabIndex={isActive ? 0 : -1}
      aria-label={task.title}
      onFocus={() => nav.setActive(task.id)}
      onKeyDown={onRowKeyDown}
      onTouchStart={hasSwipeActions ? handleTouchStart : undefined}
      onTouchEnd={hasSwipeActions ? handleTouchEnd : undefined}
    >
      {/* Main content — shifts left when swiped on mobile */}
      <div
        className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 transition-transform duration-200 md:contents"
        style={
          hasSwipeActions
            ? { transform: swiped ? `translateX(-${actionsWidth}px)` : 'translateX(0)' }
            : undefined
        }
      >
        {checkable && (
          <div className={`cb ${task.completed ? 'done' : ''}`} onClick={toggleComplete} />
        )}
        <div
          className={`min-w-0 flex-1 ${editable ? 'cursor-text' : ''}`}
          onClick={editable ? startEdit : undefined}
          title={editable ? t('task.clickToEdit') : undefined}
        >
          <div className={`t-title ${task.completed ? 'done' : ''}`}>
            {task.is_green && (
              <span
                className="mr-1 inline-flex align-[-1px]"
                style={{ color: 'var(--green)' }}
                title={t('task.greenTooltip')}
              >
                <Ic n="leaf" s={12} />
              </span>
            )}
            {editable && rule && (
              <span
                className="mr-1 inline-flex cursor-pointer align-[-1px] text-ink-3 hover:text-ink-1"
                title={t('task.recurringBadgeTooltip', {
                  schedule: describeRecurrence(rule.weekdays, t, i18n.language),
                })}
                onClick={(e) => {
                  e.stopPropagation()
                  startEditSeries()
                }}
              >
                ↺
              </span>
            )}
            {task.title}
          </div>
          <div className="t-meta">
            {showProject && project && <span className="badge b-proj">{project.name}</span>}
            <span className={`badge ${task.complexity === 'high' ? 'b-high' : 'b-low'}`}>
              {task.complexity === 'high' ? t('task.complexityHigh') : t('task.complexityLow')}
            </span>
            {task.assigned_today && <span className="badge b-today">{t('task.scheduleToday')}</span>}
            {task.assigned_week && <span className="badge b-week">{t('task.scheduleWeek')}</span>}
            {task.notes && <span className="text-[10px] text-ink-3">· {t('task.noteBadge')}</span>}
          </div>
        </div>

        {/* Right slot: always visible at every screen width */}
        {right !== undefined && <div className="flex shrink-0 items-center">{right}</div>}
      </div>

      {/* Swipe-revealed panel: reorder and delete only */}
      {hasSwipeActions && (
        <div
          ref={actionsRef}
          className={[
            'absolute right-0 top-0 flex h-full translate-x-full items-center gap-1.5 bg-inherit transition-transform duration-200',
            'md:static md:translate-x-0 md:bg-transparent',
            swiped ? '!translate-x-0' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {reorderable && (
            <div className="flex shrink-0 flex-col gap-px">
              <button
                className="btn btn-g px-[5px] py-px text-[9px] leading-none"
                disabled={isFirst}
                onClick={() => reorderTask.mutate({ id: task.id, direction: 'up' })}
                title={t('task.moveUp')}
              >
                ▲
              </button>
              <button
                className="btn btn-g px-[5px] py-px text-[9px] leading-none"
                disabled={isLast}
                onClick={() => reorderTask.mutate({ id: task.id, direction: 'down' })}
                title={t('task.moveDown')}
              >
                ▼
              </button>
            </div>
          )}
          {deletable && (
            <button
              className="btn btn-g btn-danger shrink-0 px-[6px] py-[5px]"
              onClick={remove}
              title={t('task.deleteTooltip')}
            >
              <Ic n="trash" s={12} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
