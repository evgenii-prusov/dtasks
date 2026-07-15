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
    setEditing(true)
  }
  const save = () => {
    updateTask.mutate({
      id: task.id,
      patch: { title: title.trim() || task.title, notes, complexity, is_green: isGreen },
    })
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
        </div>
      </div>
    )
  }

  // Whether there are any action elements for the swipe strip
  const hasActions = right !== undefined || reorderable || deletable

  return (
    <div
      ref={rowRef}
      className={`task-row relative overflow-hidden ${task.is_green ? 'green' : ''}`}
      onTouchStart={hasActions ? handleTouchStart : undefined}
      onTouchEnd={hasActions ? handleTouchEnd : undefined}
    >
      {/* Main content — shifts left when swiped on mobile */}
      <div
        className="flex min-w-0 flex-1 items-center gap-1.5 transition-transform duration-200 md:contents"
        style={
          hasActions
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
      </div>

      {/* Actions: swipe-revealed on mobile, inline on md+ */}
      {hasActions && (
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
          {right}
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
