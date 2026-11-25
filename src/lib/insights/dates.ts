// Plain YYYY-MM-DD date helpers (UTC arithmetic on Manila calendar dates).

/** Start of POS records (weather history is fetched from here). */
export const HISTORY_START = '2026-01-01'
/** Lower bound for reading history: everything since records began (the rollups keep it cheap). */
export const ALL_HISTORY = '2000-01-01'

const toD = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00Z')
const toIso = (d: Date) => d.toISOString().slice(0, 10)

export const addDays = (iso: string, n: number) => { const d = toD(iso); d.setUTCDate(d.getUTCDate() + n); return toIso(d) }
export const daysBetween = (a: string, b: string) => Math.round((toD(b).getTime() - toD(a).getTime()) / 86400000)
export const dow = (iso: string) => toD(iso).getUTCDay()
export const dom = (iso: string) => toD(iso).getUTCDate()
export const monthKey = (iso: string) => iso.slice(0, 7)
export const monthStart = (iso: string) => iso.slice(0, 7) + '-01'
export const monthIndex = (iso: string) => Number(iso.slice(5, 7)) - 1
export const addMonths = (iso: string, n: number) => {
  const d = toD(monthStart(iso)); d.setUTCMonth(d.getUTCMonth() + n); return toIso(d)
}
export const daysInMonth = (iso: string) => {
  const d = toD(monthStart(iso)); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.getUTCDate()
}
/** Monday of the week (matches Postgres date_trunc('week')). */
export const weekStart = (iso: string) => addDays(iso, -((dow(iso) + 6) % 7))
export function eachDay(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthLabel = (iso: string) => `${MONTHS[monthIndex(iso)]} ${iso.slice(2, 4)}`
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
