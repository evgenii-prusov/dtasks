import type { TFunction } from 'i18next'
import { weekdayShortLabels } from './dates'

// Bit i (0=Mon..6=Sun) marks that weekday as due — matches the backend's
// Python date.weekday() convention (Mon=0), not JS Date#getDay() (Sun=0).
export const ALL_WEEKDAYS = 0b1111111
const WEEKDAYS_MASK = 0b0011111 // Mon-Fri

export function weekdaysToMask(days: Iterable<number>): number {
  let mask = 0
  for (const day of days) mask |= 1 << day
  return mask
}

export function maskToWeekdays(mask: number): number[] {
  return Array.from({ length: 7 }, (_, i) => i).filter((i) => (mask & (1 << i)) !== 0)
}

/** Human label for a recurrence mask, e.g. "Every day" / "Weekdays" / "Mon, Wed, Fri". */
export function describeRecurrence(mask: number, t: TFunction, locale: string): string {
  if (mask === ALL_WEEKDAYS) return t('task.recurEveryDay')
  if (mask === WEEKDAYS_MASK) return t('task.recurWeekdays')
  const labels = weekdayShortLabels(locale)
  return maskToWeekdays(mask)
    .map((i) => labels[i])
    .join(', ')
}
