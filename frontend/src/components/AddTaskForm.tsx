import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Complexity, TaskCreate } from '../api/types'

export function AddTaskForm({
  onAdd,
  onCancel,
}: {
  onAdd: (task: TaskCreate) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [complexity, setComplexity] = useState<Complexity>('low')
  const [recurring, setRecurring] = useState(false)
  const [notes, setNotes] = useState('')

  const submit = () => {
    if (!title.trim()) return
    onAdd({ title: title.trim(), complexity, recurring, notes })
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
        <label className="flex cursor-pointer items-center gap-1 text-xs text-ink-2">
          <input
            type="checkbox"
            checked={recurring}
            onChange={(e) => setRecurring(e.target.checked)}
            style={{ accentColor: 'var(--accent)' }}
          />
          {t('task.recurringCheckbox')}
        </label>
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
