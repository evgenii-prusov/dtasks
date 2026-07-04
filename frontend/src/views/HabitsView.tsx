import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateHabit, useDeleteHabit, useHabits, useSetHabitLog } from '../api/hooks'
import type { Habit } from '../api/types'
import { AddHabitForm } from '../components/AddHabitForm'
import { Ic } from '../components/Icon'
import { formatMonthShort, toISODate, todayISO, weekdayShortLabels } from '../lib/dates'

const WEEKS = 16

function buildDays(): string[] {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const start = new Date(now)
  start.setDate(start.getDate() - WEEKS * 7 + 1)
  // Align to Monday
  const dow = start.getDay()
  const offset = dow === 0 ? 1 : dow === 1 ? 0 : -(dow - 1)
  start.setDate(start.getDate() + offset)
  const days: string[] = []
  const d = new Date(start)
  while (d <= now || days.length % 7 !== 0) {
    days.push(toISODate(d))
    d.setDate(d.getDate() + 1)
    if (days.length > WEEKS * 7 + 7) break
  }
  return days
}

function streak(h: Habit): number {
  let s = 0
  const d = new Date()
  for (;;) {
    const k = toISODate(d)
    if ((h.log[k] ?? 0) > 0) {
      s++
      d.setDate(d.getDate() - 1)
    } else break
    if (s > 365) break
  }
  return s
}

export function HabitsView() {
  const { t, i18n } = useTranslation()
  const { data: habits = [] } = useHabits()
  const setHabitLog = useSetHabitLog()
  const deleteHabit = useDeleteHabit()
  const createHabit = useCreateHabit()
  const [addingHabit, setAddingHabit] = useState(false)
  const [justAddedId, setJustAddedId] = useState<number | null>(null)
  const habitRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const todayKey = todayISO()
  const days = useMemo(buildDays, [])
  const weekStarts = useMemo(() => days.filter((_, i) => i % 7 === 0), [days])
  const dowLabels = useMemo(() => weekdayShortLabels(i18n.language), [i18n.language])
  const stateLabels = [t('habits.state0'), t('habits.state1'), t('habits.state2')]

  useEffect(() => {
    if (justAddedId == null) return
    const el = habitRefs.current[justAddedId]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setJustAddedId(null)
    }
  }, [habits, justAddedId])

  const cycle = (h: Habit, date: string) => {
    const cur = h.log[date] ?? 0
    setHabitLog.mutate({ habitId: h.id, day: date, state: (cur + 1) % 3 })
  }

  const remove = (h: Habit) => {
    if (confirm(t('habits.confirmDelete', { name: h.name }))) deleteHabit.mutate(h.id)
  }

  return (
    <div>
      <div className="ph">
        <div className="ph-title">{t('habits.title')}</div>
        <button className="btn btn-g btn-s" onClick={() => setAddingHabit((a) => !a)}>
          <Ic n="plus" s={12} /> {t('common.add')}
        </button>
      </div>

      {addingHabit && (
        <div className="card">
          <AddHabitForm
            onAdd={(habit) => {
              createHabit.mutate(habit, { onSuccess: (created) => setJustAddedId(created.id) })
              setAddingHabit(false)
            }}
            onCancel={() => setAddingHabit(false)}
          />
        </div>
      )}

      {habits.map((h) => {
        const str = streak(h)
        const total = Object.values(h.log).filter((v) => v > 0).length
        const todayState = h.log[todayKey] ?? 0

        return (
          <div key={h.id} ref={(el) => { habitRefs.current[h.id] = el }} className="card">
            <div className="card-head flex-wrap gap-2.5">
              <div>
                <h3 className="mb-0.5">{h.name}</h3>
                <div className="text-[11px] font-normal text-ink-3">{h.subtitle}</div>
              </div>
              <div className="ml-auto flex items-center gap-5">
                <div className="text-center">
                  <div
                    className="font-serif text-xl font-semibold"
                    style={{ color: str > 0 ? 'var(--accent)' : 'var(--text-3)' }}
                  >
                    {str}
                  </div>
                  <div className="text-[9px] uppercase tracking-[.06em] text-ink-3">
                    {t('habits.streak')}
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-serif text-xl font-semibold text-ink-2">{total}</div>
                  <div className="text-[9px] uppercase tracking-[.06em] text-ink-3">
                    {t('habits.total')}
                  </div>
                </div>
                <div>
                  <div className="mb-[5px] text-center text-[9px] uppercase tracking-[.06em] text-ink-3">
                    {t('habits.todayLabel')}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {([0, 1, 2] as const).map((s) => (
                        <div
                          key={s}
                          onClick={() => cycle(h, todayKey)}
                          title={stateLabels[s]}
                          className="h-6 w-6 cursor-pointer rounded-[5px] transition-all duration-150"
                          style={{
                            background: `var(--habit-${s})`,
                            opacity: s === todayState ? 1 : 0.28,
                            border: `2px solid ${s === todayState ? 'var(--text-2)' : 'transparent'}`,
                          }}
                        />
                      ))}
                    </div>
                    {todayState === 0 && (
                      <button
                        className="habit-log-pulse"
                        onClick={() => cycle(h, todayKey)}
                        title={t('habits.logTooltip')}
                      >
                        <span className="habit-log-pulse-dot" aria-hidden="true" />
                        {t('habits.logToday')}
                      </button>
                    )}
                  </div>
                </div>
                <button
                  className="btn btn-g btn-s btn-danger"
                  onClick={() => remove(h)}
                  title={t('habits.deleteTooltip')}
                >
                  <Ic n="trash" s={12} />
                </button>
              </div>
            </div>

            <div className="px-4 pt-3 pb-3.5">
              {/* Month labels row */}
              <div className="mb-[3px] ml-7 flex">
                <div
                  className="grid w-max gap-[3px]"
                  style={{ gridTemplateColumns: `repeat(${weekStarts.length}, 16px)` }}
                >
                  {weekStarts.map((w, wi) => {
                    const d = new Date(w)
                    const label = d.getDate() <= 7 ? formatMonthShort(i18n.language, d) : ''
                    return (
                      <div key={wi} className="w-[13px] text-center text-[9px] text-ink-3">
                        {label}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex gap-[5px]">
                {/* Day labels */}
                <div className="flex flex-col gap-[3px]">
                  {dowLabels.map((dl) => (
                    <div
                      key={dl}
                      className="h-[13px] w-5 text-right text-[9px] leading-[13px] text-ink-3"
                    >
                      {dl}
                    </div>
                  ))}
                </div>

                {/* Grid */}
                <div className="overflow-x-auto pb-0.5">
                  <div className="hgrid">
                    {days.map((dateKey) => {
                      const isFuture = dateKey > todayKey
                      const isToday = dateKey === todayKey
                      const val = isFuture ? 0 : (h.log[dateKey] ?? 0)
                      return (
                        <div
                          key={dateKey}
                          className={`hcell s${val} ${isFuture ? 'future' : ''} ${isToday ? 'istoday' : ''}`}
                          onClick={() => !isFuture && cycle(h, dateKey)}
                        />
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="mt-2 flex items-center justify-end gap-1.5">
                <span className="text-[9px] text-ink-3">{t('habits.less')}</span>
                {([0, 1, 2] as const).map((s) => (
                  <div
                    key={s}
                    className="h-[11px] w-[11px] rounded-sm"
                    style={{ background: `var(--habit-${s})` }}
                  />
                ))}
                <span className="text-[9px] text-ink-3">{t('habits.more')}</span>
                <span className="ml-2 text-[9px] text-ink-3">{t('habits.cycleHint')}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
