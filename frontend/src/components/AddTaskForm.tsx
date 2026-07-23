import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Complexity, RecurrenceRuleCreate, TaskCreate } from '../api/types'
import { weekdayShortLabels } from '../lib/dates'
import { weekdaysToMask } from '../lib/recurrence'
import { Ic } from './Icon'

export function AddTaskForm({
  onAdd,
  onAddRecurring,
  onCancel,
}: {
  onAdd: (task: TaskCreate) => void
  onAddRecurring?: (rule: RecurrenceRuleCreate) => void
  onCancel: () => void
}) {
  const { t, i18n } = useTranslation()
  const [title, setTitle] = useState('')
  const [complexity, setComplexity] = useState<Complexity>('low')
  const [isGreen, setIsGreen] = useState(false)
  const [notes, setNotes] = useState('')
  const [assignedToday, setAssignedToday] = useState(false)
  const [assignedWeek, setAssignedWeek] = useState(false)
  const [repeating, setRepeating] = useState(false)
  const [weekdays, setWeekdays] = useState(new Set<number>([0, 1, 2, 3, 4, 5, 6]))

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
      onAddRecurring({
        title: title.trim(),
        weekdays: weekdaysToMask(weekdays),
        complexity,
        notes,
        is_green: isGreen,
      })
      return
    }
    onAdd({
      title: title.trim(),
      complexity,
      notes,
      is_green: isGreen,
      assigned_today: assignedToday,
      assigned_week: assignedWeek,
    })
  }

  return (
    <div className="add-form">
      <input
        className="input mb-[7px]"
        placeholder={t('task.titlePlaceholder')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        autoFocus
      />
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
