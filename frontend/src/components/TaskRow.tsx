import { useState, type ReactNode } from 'react'
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
  const [expanded, setExpanded] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes || '')
  const [complexity, setComplexity] = useState<Complexity>(task.complexity)
  const [isGreen, setIsGreen] = useState(task.is_green)

  const startEdit = () => {
    setTitle(task.title)
    setNotes(task.notes || '')
    setComplexity(task.complexity)
    setIsGreen(task.is_green)
    setExpanded(false)
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

  const hasActions = right || reorderable || deletable

  return (
    <div className={`task-row flex-wrap ${task.is_green ? 'green' : ''}`}>
      {checkable && (
        <div
          className={`cb ${task.completed ? 'done' : ''}`}
          onClick={() => updateTask.mutate({ id: task.id, patch: { completed: !task.completed } })}
        />
      )}
      <div
        className={`min-w-0 flex-1 ${editable ? 'cursor-text' : hasActions ? 'cursor-pointer' : ''}`}
        onClick={
          editable
            ? startEdit
            : hasActions
              ? () => setExpanded((v) => !v)
              : undefined
        }
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
      {/* Action buttons: always visible on md+, tap-to-expand on mobile */}
      <div className={`${expanded ? 'flex' : 'hidden'} w-full items-center gap-1.5 flex-wrap md:flex md:w-auto`}>
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
    </div>
  )
}
