import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useDeleteTask, useReorderTask, useUpdateTask } from '../api/hooks'
import type { Complexity, Project, Task } from '../api/types'
import { Ic } from './Icon'

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
  const { t } = useTranslation()
  const updateTask = useUpdateTask()
  const reorderTask = useReorderTask()
  const deleteTask = useDeleteTask()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes || '')
  const [complexity, setComplexity] = useState<Complexity>(task.complexity)
  const [isGreen, setIsGreen] = useState(task.is_green)
  const [recurring, setRecurring] = useState(task.recurring)
  const [selectedProjectId, setSelectedProjectId] = useState(task.project_id)
  const [swiped, setSwiped] = useState(false)

  const touchStartX = useRef<number | null>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)

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
    setRecurring(task.recurring)
    setSelectedProjectId(task.project_id)
    setEditing(true)
  }
  const save = () => {
    const patch: Parameters<typeof updateTask.mutate>[0]['patch'] = {
      title: title.trim() || task.title,
      notes,
      complexity,
      is_green: isGreen,
      recurring,
    }
    if (selectedProjectId !== task.project_id) patch.project_id = selectedProjectId
    updateTask.mutate({ id: task.id, patch })
    setEditing(false)
  }
  const cancel = () => setEditing(false)
  const remove = () => {
    if (confirm(t('task.confirmDelete', { title: task.title }))) deleteTask.mutate(task.id)
  }

  if (editable && editing) {
    return (
      <div className={`task-row items-start ${task.is_green ? 'green' : ''}`}>
        {checkable && <div className="cb mt-[3px]" />}
        <div className="min-w-0 flex-1">
          <input
            className="input mb-[5px] px-2 py-[5px] text-[13px]"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            autoFocus
          />
          <textarea
            className="input textarea mb-1.5 min-h-11 text-xs"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
            <label className="flex cursor-pointer items-center gap-1 text-xs text-ink-2">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                style={{ accentColor: 'var(--accent)' }}
              />
              {t('task.recurringCheckbox')}
            </label>
            <button
              className={`asgn gap-1 ${isGreen ? 'green-on' : ''}`}
              onClick={() => setIsGreen((g) => !g)}
              title={t('task.greenTooltip')}
            >
              <Ic n="leaf" s={11} /> {t('task.greenToggle')}
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
      ref={rowRef}
      className={`task-row relative overflow-hidden ${task.is_green ? 'green' : ''}`}
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
          <div
            className={`cb ${task.completed ? 'done' : ''}`}
            onClick={() => updateTask.mutate({ id: task.id, patch: { completed: !task.completed } })}
          />
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
            {task.title}
          </div>
          <div className="t-meta">
            {showProject && project && <span className="badge b-proj">{project.name}</span>}
            <span className={`badge ${task.complexity === 'high' ? 'b-high' : 'b-low'}`}>
              {task.complexity === 'high' ? t('task.complexityHigh') : t('task.complexityLow')}
            </span>
            {task.recurring && <span className="badge b-rec">{t('task.recurringBadge')}</span>}
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
