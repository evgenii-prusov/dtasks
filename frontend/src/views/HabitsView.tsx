import { useMemo } from 'react'
import { useHabits, useSetHabitLog } from '../api/hooks'
import type { Habit } from '../api/types'
import { toISODate, todayISO } from '../lib/dates'

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKS = 16
const STATE_LABELS = ['Not done', 'Minimal', 'Complete']

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
  const { data: habits = [] } = useHabits()
  const setHabitLog = useSetHabitLog()
  const todayKey = todayISO()
  const days = useMemo(buildDays, [])
  const weekStarts = useMemo(() => days.filter((_, i) => i % 7 === 0), [days])

  const cycle = (h: Habit, date: string) => {
    const cur = h.log[date] ?? 0
    setHabitLog.mutate({ habitId: h.id, day: date, state: (cur + 1) % 3 })
  }

  return (
    <div>
      <div className="ph">
        <div className="ph-title">Habits</div>
      </div>

      {habits.map((h) => {
        const str = streak(h)
        const total = Object.values(h.log).filter((v) => v > 0).length
        const todayState = h.log[todayKey] ?? 0

        return (
          <div key={h.id} className="card">
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
                  <div className="text-[9px] uppercase tracking-[.06em] text-ink-3">streak</div>
                </div>
                <div className="text-center">
                  <div className="font-serif text-xl font-semibold text-ink-2">{total}</div>
                  <div className="text-[9px] uppercase tracking-[.06em] text-ink-3">total</div>
                </div>
                <div>
                  <div className="mb-[5px] text-center text-[9px] uppercase tracking-[.06em] text-ink-3">
                    Today
                  </div>
                  <div className="flex gap-1">
                    {([0, 1, 2] as const).map((s) => (
                      <div
                        key={s}
                        onClick={() => cycle(h, todayKey)}
                        title={STATE_LABELS[s]}
                        className="h-6 w-6 cursor-pointer rounded-[5px] transition-all duration-150"
                        style={{
                          background: `var(--habit-${s})`,
                          opacity: s === todayState ? 1 : 0.28,
                          border: `2px solid ${s === todayState ? 'var(--text-2)' : 'transparent'}`,
                        }}
                      />
                    ))}
                  </div>
                </div>
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
                    const label =
                      d.getDate() <= 7 ? d.toLocaleDateString('en-US', { month: 'short' }) : ''
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
                  {DOW_LABELS.map((dl) => (
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
                          title={`${dateKey}: ${STATE_LABELS[val]}`}
                        />
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="mt-2 flex items-center justify-end gap-1.5">
                <span className="text-[9px] text-ink-3">Less</span>
                {([0, 1, 2] as const).map((s) => (
                  <div
                    key={s}
                    className="h-[11px] w-[11px] rounded-sm"
                    style={{ background: `var(--habit-${s})` }}
                  />
                ))}
                <span className="text-[9px] text-ink-3">More</span>
                <span className="ml-2 text-[9px] text-ink-3">
                  Click cell to cycle: none → minimal → complete
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
