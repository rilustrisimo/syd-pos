// Daily rain for the store's location from Open-Meteo (free, no API key):
// past days from the archive, the next 16 days from the forecast. Cached in
// insights_weather_daily so each day is fetched once (forecast refreshed
// every 6 hours).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { WeatherDay } from './types'
import { HISTORY_START, addDays } from './dates'

// Talakag, Bukidnon — used when the shop settings have no pin.
const DEFAULT_LAT = 8.2333
const DEFAULT_LON = 124.6

async function fetchDaily(url: string): Promise<{ day: string; rain_mm: number; tmax: number | null }[]> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`open-meteo ${res.status}`)
    const j = await res.json()
    const days: string[] = j?.daily?.time ?? []
    return days.map((day, i) => ({
      day,
      rain_mm: Number(j.daily.precipitation_sum?.[i] ?? 0) || 0,
      tmax: j.daily.temperature_2m_max?.[i] ?? null,
    }))
  } finally {
    clearTimeout(t)
  }
}

export async function loadWeather(db: SupabaseClient, today: string): Promise<WeatherDay[]> {
  const sb = db as any
  const { data: cached } = await sb.from('insights_weather_daily').select('day, rain_mm, tmax, is_forecast, fetched_at').order('day')
  const rows: (WeatherDay & { fetched_at?: string })[] = (cached ?? []).map((r: any) => ({ ...r, rain_mm: Number(r.rain_mm), tmax: r.tmax == null ? null : Number(r.tmax) }))

  const { data: shop } = await sb.from('shop_settings').select('store_latitude, store_longitude').limit(1).maybeSingle()
  const lat = Number(shop?.store_latitude) || DEFAULT_LAT
  const lon = Number(shop?.store_longitude) || DEFAULT_LON
  const q = `latitude=${lat}&longitude=${lon}&daily=precipitation_sum,temperature_2m_max&timezone=Asia%2FManila`

  const upserts: { day: string; rain_mm: number; tmax: number | null; is_forecast: boolean; fetched_at: string }[] = []
  const now = new Date().toISOString()

  // Archive lags ~5 days. Fill actuals from the last cached actual day.
  const actualDays = rows.filter((r) => !r.is_forecast).map((r) => r.day)
  const lastActual = actualDays.length ? actualDays[actualDays.length - 1] : addDays(HISTORY_START, -1)
  const archiveEnd = addDays(today, -6)
  if (lastActual < archiveEnd) {
    const got = await fetchDaily(`https://archive-api.open-meteo.com/v1/archive?${q}&start_date=${addDays(lastActual, 1)}&end_date=${archiveEnd}`)
    for (const g of got) upserts.push({ ...g, is_forecast: false, fetched_at: now })
  }

  // Forecast (also covers the last few days the archive doesn't have yet).
  const fc = rows.filter((r) => r.is_forecast && r.day >= today)
  const stale = !fc.length || fc.some((r) => !r.fetched_at || Date.now() - Date.parse(r.fetched_at) > 6 * 3600_000)
  if (stale) {
    const got = await fetchDaily(`https://api.open-meteo.com/v1/forecast?${q}&past_days=7&forecast_days=16`)
    for (const g of got) if (g.day > archiveEnd) upserts.push({ ...g, is_forecast: true, fetched_at: now })
  }

  if (upserts.length) {
    await sb.from('insights_weather_daily').upsert(upserts, { onConflict: 'day' })
    const byDay = new Map(rows.map((r) => [r.day, r]))
    for (const u of upserts) byDay.set(u.day, u)
    return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)).map(({ day, rain_mm, tmax, is_forecast }) => ({ day, rain_mm, tmax, is_forecast }))
  }
  return rows.map(({ day, rain_mm, tmax, is_forecast }) => ({ day, rain_mm, tmax, is_forecast }))
}
