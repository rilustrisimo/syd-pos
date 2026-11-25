// Philippine national holidays (regular + main special non-working days),
// including Holy Week, which moves with Easter. Used by the forecast to
// expect dips, and to label charts.

import { addDays } from './dates'

/** Easter Sunday (Anonymous Gregorian algorithm). */
export function easter(year: number): string {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Last Monday of August (National Heroes Day). */
function heroesDay(year: number): string {
  const d = new Date(Date.UTC(year, 8, 0)) // Aug 31
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export interface Holiday { day: string; name: string }

export function holidaysFor(year: number): Holiday[] {
  const e = easter(year)
  const y = (md: string) => `${year}-${md}`
  return [
    { day: y('01-01'), name: "New Year's Day" },
    { day: y('02-25'), name: 'EDSA Anniversary' },
    { day: addDays(e, -3), name: 'Maundy Thursday' },
    { day: addDays(e, -2), name: 'Good Friday' },
    { day: addDays(e, -1), name: 'Black Saturday' },
    { day: y('04-09'), name: 'Araw ng Kagitingan' },
    { day: y('05-01'), name: 'Labor Day' },
    { day: y('06-12'), name: 'Independence Day' },
    { day: y('08-21'), name: 'Ninoy Aquino Day' },
    { day: heroesDay(year), name: 'National Heroes Day' },
    { day: y('11-01'), name: "All Saints' Day" },
    { day: y('11-02'), name: "All Souls' Day" },
    { day: y('11-30'), name: 'Bonifacio Day' },
    { day: y('12-08'), name: 'Immaculate Conception' },
    { day: y('12-24'), name: 'Christmas Eve' },
    { day: y('12-25'), name: 'Christmas Day' },
    { day: y('12-30'), name: 'Rizal Day' },
    { day: y('12-31'), name: "New Year's Eve" },
  ].sort((a, b) => a.day.localeCompare(b.day))
}

const cache = new Map<number, Map<string, string>>()
export function holidayName(iso: string): string | null {
  const year = Number(iso.slice(0, 4))
  if (!cache.has(year)) cache.set(year, new Map(holidaysFor(year).map((h) => [h.day, h.name])))
  return cache.get(year)!.get(iso) ?? null
}

/** Payday days (15th, 30th/end of month, and the day after when people shop). */
export function isPaydayWindow(iso: string): boolean {
  const d = Number(iso.slice(8, 10))
  return d === 15 || d === 16 || d >= 30 || d === 1
}
