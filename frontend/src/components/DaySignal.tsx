import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WorkLogDay } from '../api/types'
import { Ic } from './Icon'

const SCALE = [1, 2, 3, 4, 5]

// One label column for the scales and the note, so the controls line up.
const ROW_LABEL = 'w-16 shrink-0 text-[11px] font-semibold uppercase tracking-[.06em] text-ink-3'

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
      <span className={ROW_LABEL}>{label}</span>
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

/**
 * The day's quick sentiment signal: two 1-5 scales plus a free-text friction note.
 *
 * The scales save the moment one is tapped. The note is free text, so it saves
 * when asked (the button) or when focus leaves the box -- walking away
 * mid-sentence must not lose it. Either way the card says which state the note
 * is in: a box that saves without a word looks exactly like one that never will.
 */
export function DaySignal({ day, onChange }: { day: WorkLogDay; onChange: (day: WorkLogDay) => void }) {
  const { t } = useTranslation()
  const noteId = useId()
  const [note, setNote] = useState(day.note)

  // The note is a draft until saved, so re-sync when the row changes underneath
  // us (a refetch, or moving to another day).
  useEffect(() => setNote(day.note), [day.day, day.note])

  const unsaved = note !== day.note
  const saveNote = () => {
    if (unsaved) onChange({ ...day, note })
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>{t('worklog.dayTitle')}</h3>
      </div>
      <div className="flex flex-col gap-[7px] px-4 py-3">
        <p className="mb-1 text-[12px] leading-snug text-ink-2">{t('worklog.dayHint')}</p>
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
        <div className="flex items-start gap-[7px]">
          {/* A real label, not just the placeholder: the placeholder is gone the
              moment you type, and with it any hint of what the box is for. */}
          <label htmlFor={noteId} className={`${ROW_LABEL} pt-[7px]`}>
            {t('worklog.noteLabel')}
          </label>
          <div className="min-w-0 flex-1">
            <textarea
              id={noteId}
              className="input textarea min-h-20 text-[13px]"
              placeholder={t('worklog.notePlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
            />
            <div className="mt-[7px] flex items-center justify-end gap-2.5">
              <span
                role="status"
                className={`inline-flex items-center gap-1 text-[11px] ${unsaved ? 'text-ink-2' : 'text-accent'}`}
              >
                {unsaved ? (
                  t('worklog.noteUnsaved')
                ) : note ? (
                  <>
                    <Ic n="check" s={11} /> {t('worklog.noteSaved')}
                  </>
                ) : null}
              </span>
              <button
                type="button"
                className="btn btn-p btn-s"
                disabled={!unsaved}
                // Pressing the button must not blur the box first: that would run
                // the on-blur save and then this click would save a second time.
                onMouseDown={(e) => e.preventDefault()}
                onClick={saveNote}
              >
                {t('worklog.saveNote')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
