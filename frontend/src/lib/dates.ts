/** Local-timezone ISO date (YYYY-MM-DD). */
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

// Russian (unlike English) lowercases weekday and month names, which looks
// wrong in headings and labels — so these helpers uppercase the first letter.
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Page-heading date, e.g. "Friday, July 4" / «Пятница, 4 июля». */
export function formatDayHeading(locale: string, d: Date = new Date()): string {
  return capitalize(
    d.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' }),
  )
}

/** Short month name for grid labels, e.g. "Jul" / «Июл.». */
export function formatMonthShort(locale: string, d: Date): string {
  return capitalize(d.toLocaleDateString(locale, { month: 'short' }))
}

/** Short weekday names starting from Monday, e.g. Mon…Sun / Пн…Вс. */
export function weekdayShortLabels(locale: string): string[] {
  const monday = new Date(2024, 0, 1) // 2024-01-01 was a Monday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return capitalize(d.toLocaleDateString(locale, { weekday: 'short' }))
  })
}
