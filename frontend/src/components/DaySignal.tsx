import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WorkLogDay } from '../api/types'

const SCALE = [1, 2, 3, 4, 5]

function Scale({
  label,
  value,
  onPick,
}: {
  label: string
  value: number
  onPick: (v: number) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-[7px]">
      <span className="w-16 text-[11px] font-semibold uppercase tracking-[.06em] text-ink-3">
        {label}
      </span>
      <div className="flex gap-[3px]" role="group" aria-label={label}>
        {SCALE.map((n) => (
          <button
            key={n}
            type="button"
            className={`asgn ${value === n ? 'on' : ''}`}
            aria-pressed={value === n}
            // Picking the current value again clears it, so a misclick is undoable
            // without a separate "clear" control.
            onClick={() => onPick(value === n ? 0 : n)}
          >
            {n}
          </button>
        ))}
      </div>
      {value === 0 && <span className="text-[11px] text-ink-3">{t('worklog.energyUnset')}</span>}
    </div>
  )
}

/** The day's quick sentiment signal: two 1-5 scales plus a free-text friction note. */
export function DaySignal({ day, onChange }: { day: WorkLogDay; onChange: (day: WorkLogDay) => void }) {
  const { t } = useTranslation()
  const [note, setNote] = useState(day.note)

  // The note is saved on blur, so re-sync when the row changes underneath us
  // (a refetch, or moving to another day).
  useEffect(() => setNote(day.note), [day.day, day.note])

  return (
    <div className="card p-3">
      <div className="card-head">
        <h3>{t('worklog.dayTitle')}</h3>
      </div>
      <div className="flex flex-col gap-[7px] p-3 pt-0">
        <Scale
          label={t('worklog.energyLabel')}
          value={day.energy}
          onPick={(energy) => onChange({ ...day, energy, note })}
        />
        <Scale
          label={t('worklog.frictionLabel')}
          value={day.friction}
          onPick={(friction) => onChange({ ...day, friction, note })}
        />
        <textarea
          className="input textarea min-h-14 text-[13px]"
          placeholder={t('worklog.notePlaceholder')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== day.note && onChange({ ...day, note })}
        />
      </div>
    </div>
  )
}
