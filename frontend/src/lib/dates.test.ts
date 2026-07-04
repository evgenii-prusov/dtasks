import { describe, expect, it } from 'vitest'
import { formatDayHeading, formatMonthShort, weekdayShortLabels } from './dates'

describe('formatDayHeading', () => {
  const date = new Date(2026, 6, 4) // Saturday, July 4 2026

  it('formats the English heading', () => {
    expect(formatDayHeading('en', date)).toBe('Saturday, July 4')
  })

  it('capitalizes the Russian heading, which Intl lowercases', () => {
    expect(formatDayHeading('ru', date)).toBe('Суббота, 4 июля')
  })
})

describe('formatMonthShort', () => {
  const date = new Date(2026, 0, 5)

  it('returns capitalized short month names', () => {
    expect(formatMonthShort('en', date)).toBe('Jan')
    expect(formatMonthShort('ru', date)).toMatch(/^Янв/)
  })
})

describe('weekdayShortLabels', () => {
  it('returns seven labels starting from Monday', () => {
    expect(weekdayShortLabels('en')).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
  })

  it('returns capitalized Russian labels', () => {
    expect(weekdayShortLabels('ru')).toEqual(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'])
  })
})
