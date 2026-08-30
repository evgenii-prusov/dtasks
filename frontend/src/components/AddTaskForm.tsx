import { useRef, useState, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjects } from '../api/hooks'
import {
  isDefaultProject,
  isInboxProject,
  type Complexity,
  type RecurrenceRuleCreate,
  type TaskCreate,
} from '../api/types'
import { weekdayShortLabels } from '../lib/dates'
import { weekdaysToMask } from '../lib/recurrence'
import { Ic } from './Icon'
import { useProjectTagMenu } from './ProjectTagMenu'

export function AddTaskForm({
  onAdd,
  onAddRecurring,
  onCancel,
  titleRef,
}: {
  /**
   * `projectId` is set when a `#tag` named a project other than the one being
   * added to -- the parent files the task there instead.
   */
  onAdd: (task: TaskCreate, projectId?: number) => void
  onAddRecurring?: (rule: RecurrenceRuleCreate, projectId?: number) => void
  onCancel: () => void
  /** Lets the parent re-focus the title field, e.g. from the new-task hotkey. */
  titleRef?: Ref<HTMLInputElement>
}) {
  const { t, i18n } = useTranslation()
  const { data: projects = [] } = useProjects()
  const [title, setTitle] = useState('')
  const [complexity, setComplexity] = useState<Complexity>('low')
  const [isGreen, setIsGreen] = useState(false)
  const [notes, setNotes] = useState('')
  const [assignedToday, setAssignedToday] = useState(false)
  const [assignedWeek, setAssignedWeek] = useState(false)
  const [repeating, setRepeating] = useState(false)
  const [weekdays, setWeekdays] = useState(new Set<number>([0, 1, 2, 3, 4, 5, 6]))
  // Set by a `#tag`: file this one elsewhere than the project being added to.
  const [projectId, setProjectId] = useState<number | undefined>(undefined)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const tagMenu = useProjectTagMenu({
    value: title,
    onValueChange: setTitle,
    onPick: (project) => {
      setProjectId(project.id)
      inputRef.current?.focus()
    },
  })

  const target = projects.find((p) => p.id === projectId)
  const targetLabel = target
    ? isInboxProject(target)
      ? t('inbox.title')
      : isDefaultProject(target)
        ? t('quickAdd.noProject')
        : target.name
    : null

  const toggleWeekday = (day: number) => {
    setWeekdays((prev) => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  const submit = () => {
    if (!title.trim()) return
    if (repeating && onAddRecurring) {
      if (weekdays.size === 0) return
      onAddRecurring(
        {
          title: title.trim(),
          weekdays: weekdaysToMask(weekdays),
          complexity,
          notes,
          is_green: isGreen,
        },
        projectId,
      )
      return
    }
    onAdd(
      {
        title: title.trim(),
        complexity,
        notes,
        is_green: isGreen,
        assigned_today: assignedToday,
        assigned_week: assignedWeek,
      },
      projectId,
    )
  }

  return (
    <div
      className="add-form"
      data-hotkeys-off
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
    >
      <input
        ref={(el) => {
          inputRef.current = el
          tagMenu.anchorRef.current = el
          if (typeof titleRef === 'function') titleRef(el)
          else if (titleRef) titleRef.current = el
        }}
        className="input mb-[7px]"
        placeholder={t('task.titlePlaceholder')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          // The menu answers Enter and the arrows while it is open.
          if (tagMenu.onKeyDown(e)) return
          if (e.key === 'Enter') submit()
        }}
        autoFocus
      />
      {tagMenu.menu}
      {targetLabel && (
        <div className="mb-[7px] flex items-center gap-1.5 text-[11px] text-ink-2">
          <span className="text-ink-3">{t('quickAdd.projectLabel')}:</span>
          <span className="font-medium text-accent">{targetLabel}</span>
          <button
            type="button"
            className="text-ink-3 hover:text-ink"
            onClick={() => setProjectId(undefined)}
            title={t('common.cancel')}
          >
            <Ic n="x" s={10} />
          </button>
        </div>
      )}
      <textarea
        className="input textarea mb-[7px] min-h-12"
        placeholder={t('task.notesOptionalPlaceholder')}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-[7px]">
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
        {!repeating && (
          <>
            <button
              className={`asgn gap-1 ${assignedToday ? 'on' : ''}`}
              onClick={() => {
                setAssignedToday((v) => !v)
                if (!assignedToday) setAssignedWeek(false)
              }}
              title={t('task.scheduleToday')}
            >
              {assignedToday ? '✓' : '+'} {t('task.scheduleToday')}
            </button>
            <button
              className={`asgn gap-1 ${assignedWeek ? 'on' : ''}`}
              onClick={() => {
                setAssignedWeek((v) => !v)
                if (!assignedWeek) setAssignedToday(false)
              }}
              title={t('task.scheduleWeek')}
            >
              {assignedWeek ? '✓' : '+'} {t('task.scheduleWeek')}
            </button>
          </>
        )}
        {onAddRecurring && (
          <button
            className={`asgn gap-1 ${repeating ? 'on' : ''}`}
            onClick={() => setRepeating((v) => !v)}
            title={t('task.repeatTooltip')}
          >
            <Ic n="plan" s={11} /> {t('task.repeatToggle')}
          </button>
        )}
        {repeating && (
          <div className="flex flex-wrap items-center gap-1">
            {weekdayShortLabels(i18n.language).map((label, day) => (
              <button
                key={day}
                type="button"
                className={`asgn gap-1 ${weekdays.has(day) ? 'on' : ''}`}
                onClick={() => toggleWeekday(day)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1" />
        <button className="btn btn-g btn-s" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button className="btn btn-p btn-s" onClick={submit}>
          {t('common.addTask')}
        </button>
      </div>
    </div>
  )
}
