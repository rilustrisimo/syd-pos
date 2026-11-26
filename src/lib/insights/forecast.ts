// Forecasting, following standard retail practice:
// - Demand class per product (Syntetos–Boylan: ADI / CV²): smooth & erratic
//   items use damped-trend exponential smoothing; intermittent & lumpy items
//   use SBA (bias-corrected Croston).
// - Weeks the product was out of stock are removed/scaled, so stockouts
//   aren't forecast as "no demand".
// - Seasonality: our own monthly pattern blended with the PH construction
//   prior (dry-season peak Feb–May, rainy Q3 dip) until we have 2+ years.
// - Calendar: holidays (incl. Holy Week), paydays (15th / 30th), and heavy
//   rain from the weather forecast, each measured from our own sales.
// - Accuracy is measured by a rolling backtest (WAPE vs a naive forecast).

import type { RawInsights } from './types'
import { addDays, addMonths, daysInMonth, dom, dow, eachDay, monthIndex, monthKey, monthStart, weekStart } from './dates'
import { holidayName, isPaydayWindow } from './holidays'
import type { MonthRow } from './kpis'

const Z80 = 1.2816

// PH construction-materials seasonality (CeMAP/industry reports): build
// season Feb–May, weakest in the rainy months (Jul–Sep), Dec lift.
const PH_PRIOR_RAW = [0.95, 1.04, 1.12, 1.1, 1.06, 0.98, 0.92, 0.9, 0.9, 0.95, 1.0, 1.08]
const PH_PRIOR = (() => { const m = PH_PRIOR_RAW.reduce((a, b) => a + b, 0) / 12; return PH_PRIOR_RAW.map((x) => x / m) })()

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)

// ── Ramp-up ─────────────────────────────────────────────────────────────────
/**
 * Full months after the opening ramp-up: starts at the first month whose
 * revenue reaches 70% of the recent typical month (median of the last 6 full
 * months). A new store's climbing first months would otherwise look like a
 * deep "slow season" and a steep trend.
 */
export function matureMonths<T extends { revenue: number; partial: boolean }>(rows: T[]): T[] {
  const full = rows.filter((m) => !m.partial && m.revenue > 0)
  if (full.length < 4) return full
  const recent = full.slice(-6).map((m) => m.revenue).sort((a, b) => a - b)
  const typical = recent[Math.floor(recent.length / 2)]
  const start = full.findIndex((m) => m.revenue >= 0.7 * typical)
  return start > 0 ? full.slice(start) : full
}

// ── Seasonality ─────────────────────────────────────────────────────────────
export interface Seasonality { index: number[]; own: (number | null)[]; prior: number[]; ownWeight: number[] }

/**
 * Monthly index (mean 1): each month's revenue vs the average mature month,
 * shrunk toward the PH construction prior by n/(n+1) (n = years of that
 * month seen). With under 2 years, trend and season can't be separated
 * reliably, so the trend is left to the level model and the own pattern is
 * only half-trusted.
 */
export function seasonality(months: MonthRow[]): Seasonality {
  const full = matureMonths(months)
  const own: (number | null)[] = new Array(12).fill(null)
  const ownWeight = new Array(12).fill(0)
  if (full.length >= 4) {
    const avg = mean(full.map((m) => m.revenue))
    const sums = new Array(12).fill(0), counts = new Array(12).fill(0)
    for (const m of full) { const mi = monthIndex(m.month + '-01'); sums[mi] += m.revenue / avg; counts[mi]++ }
    for (let i = 0; i < 12; i++) if (counts[i]) { own[i] = sums[i] / counts[i]; ownWeight[i] = counts[i] / (counts[i] + 1) }
  }
  let index = PH_PRIOR.map((p, i) => (own[i] != null ? ownWeight[i] * own[i]! + (1 - ownWeight[i]) * p : p))
  const m = mean(index)
  index = index.map((x) => x / m)
  return { index, own, prior: PH_PRIOR, ownWeight }
}

// ── Calendar effects measured from our own daily sales ─────────────────────
export interface CalendarEffects {
  holidayFactor: number; holidaySamples: number
  paydayFactor: number; paydaySamples: number
  rainFactor: number; rainSamples: number
}

export function calendarEffects(raw: RawInsights): CalendarEffects {
  const by = new Map<string, number>()
  for (const r of raw.dailyAll) by.set(r.ph_date, (by.get(r.ph_date) ?? 0) + r.revenue)
  const start = raw.dailyAll.length ? raw.dailyAll[0].ph_date : raw.today
  const days = eachDay(start, addDays(raw.today, -1))
  // Baseline: average of the same weekday in the 4 weeks around the day (non-holiday).
  const baseline = (d: string) => {
    const xs: number[] = []
    for (const k of [-21, -14, -7, 7, 14, 21]) {
      const x = addDays(d, k)
      if (x < start || x >= raw.today || holidayName(x)) continue
      xs.push(by.get(x) ?? 0)
    }
    return xs.length >= 3 ? mean(xs) : null
  }
  const ratio = (pred: (d: string) => boolean) => {
    const rs: number[] = []
    for (const d of days) {
      if (!pred(d)) continue
      const b = baseline(d)
      if (b && b > 0) rs.push(Math.min(3, (by.get(d) ?? 0) / b))
    }
    return { r: rs.length ? mean(rs) : 1, n: rs.length }
  }
  const shrink = (r: number, n: number, k: number, prior = 1) => (n / (n + k)) * r + (k / (n + k)) * prior

  const hol = ratio((d) => !!holidayName(d) && dow(d) !== 0)
  const pay = ratio((d) => isPaydayWindow(d) && !holidayName(d))
  const wet = new Set(raw.weather.filter((w) => !w.is_forecast && w.rain_mm >= 20).map((w) => w.day))
  const rain = ratio((d) => wet.has(d) && !holidayName(d))
  return {
    holidayFactor: shrink(hol.r, hol.n, 4, 0.6), holidaySamples: hol.n,
    paydayFactor: shrink(pay.r, pay.n, 20), paydaySamples: pay.n,
    rainFactor: shrink(rain.r, rain.n, 8), rainSamples: rain.n,
  }
}

/** Multiplier for a span of days vs a normal span (holidays, paydays, forecast rain). */
function calendarFactor(daysList: string[], fx: CalendarEffects, rainByDay: Map<string, number>): number {
  // A normal month has ~5 payday-window days out of ~30.4.
  const paydayNorm = (5 * fx.paydayFactor + 25.4) / 30.4
  let f = 0
  for (const d of daysList) {
    let x = 1
    if (holidayName(d)) x *= fx.holidayFactor
    x *= (isPaydayWindow(d) ? fx.paydayFactor : 1) / paydayNorm
    const rain = rainByDay.get(d)
    if (rain != null && rain >= 20) x *= fx.rainFactor
    f += x
  }
  return daysList.length ? f / daysList.length : 1
}

// ── Models ──────────────────────────────────────────────────────────────────
interface Fit { forecast: (h: number) => number; sigma: number }

/** Damped-trend Holt on a series with possible gaps (NaN). */
export function holtDamped(y: number[], alpha = 0.3, beta = 0.1, phi = 0.85): Fit {
  const vals = y.filter((v) => !Number.isNaN(v))
  if (!vals.length) return { forecast: () => 0, sigma: 0 }
  let level = mean(vals.slice(0, Math.min(4, vals.length)))
  let trend = 0
  const errs: number[] = []
  for (const v of y) {
    const f = level + phi * trend
    if (Number.isNaN(v)) { level = f; trend *= phi; continue }
    errs.push(v - f)
    const newLevel = alpha * v + (1 - alpha) * f
    trend = beta * (newLevel - level) + (1 - beta) * phi * trend
    level = newLevel
  }
  const used = errs.slice(Math.min(4, Math.floor(errs.length / 3)))
  const sigma = used.length ? Math.sqrt(mean(used.map((e) => e * e))) : 0
  return {
    forecast: (h) => { let s = 0; for (let i = 1; i <= h; i++) s += phi ** i; return Math.max(0, level + s * trend) },
    sigma,
  }
}

/** SBA (Syntetos–Boylan approximation of Croston) for intermittent demand. */
export function sba(y: number[], alpha = 0.1): Fit {
  let z: number | null = null, p: number | null = null, q = 1
  const errs: number[] = []
  for (const v of y) {
    if (Number.isNaN(v)) continue
    if (z != null && p != null) errs.push(v - (1 - alpha / 2) * (z / p))
    if (v > 0) {
      z = z == null ? v : alpha * v + (1 - alpha) * z
      p = p == null ? q : alpha * q + (1 - alpha) * p
      q = 1
    } else q++
  }
  const f = z != null && p != null ? (1 - alpha / 2) * (z / p) : 0
  const sigma = errs.length ? Math.sqrt(mean(errs.map((e) => e * e))) : f
  return { forecast: () => f, sigma }
}

export type DemandClass = 'smooth' | 'erratic' | 'intermittent' | 'lumpy' | 'none'

export function classify(y: number[]): { cls: DemandClass; adi: number; cv2: number } {
  const v = y.filter((x) => !Number.isNaN(x))
  const nz = v.filter((x) => x > 0)
  if (!nz.length) return { cls: 'none', adi: Infinity, cv2: 0 }
  const adi = v.length / nz.length
  const m = mean(nz)
  const cv2 = nz.length > 1 ? (nz.reduce((a, x) => a + (x - m) ** 2, 0) / (nz.length - 1)) / (m * m) : 0
  const cls: DemandClass = adi < 1.32 ? (cv2 < 0.49 ? 'smooth' : 'erratic') : cv2 < 0.49 ? 'intermittent' : 'lumpy'
  return { cls, adi, cv2 }
}

const fitFor = (cls: DemandClass, y: number[]) => (cls === 'intermittent' || cls === 'lumpy' ? sba(y) : holtDamped(y))

const validOf = (y: number[]) => y.filter((v) => !Number.isNaN(v))

/** Average of the last n in-stock weeks. */
function movingAvg(y: number[], n = 8): Fit {
  const v = validOf(y)
  const errs: number[] = []
  for (let i = n; i < v.length; i++) errs.push(v[i] - mean(v.slice(i - n, i)))
  const f = mean(v.slice(-n))
  return { forecast: () => f, sigma: errs.length ? Math.sqrt(mean(errs.map((e) => e * e))) : f }
}

/** Little in-stock history: spread what sold over at least 8 weeks, so one big order isn't read as the weekly rate. */
function cautiousAvg(y: number[]): Fit {
  const v = validOf(y.slice(-26))
  const f = v.reduce((a, b) => a + b, 0) / Math.max(v.length, 8)
  const m = mean(v)
  return { forecast: () => f, sigma: v.length > 1 ? Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)) : f }
}

export type ForecastMethod = 'model' | 'average' | 'cautious'

/**
 * Pick the forecast for one product: with fewer than 8 in-stock weeks in the
 * last 26, a cautious average; otherwise whichever of the demand model or a
 * recent average had the smaller one-week error over the last weeks.
 */
export function chooseFit(y: number[]): { fit: Fit; method: ForecastMethod; cls: DemandClass } {
  const { cls } = classify(y.slice(-26))
  if (validOf(y.slice(-26)).length < 8) return { fit: cautiousAvg(y), method: 'cautious', cls }
  const model = fitFor(cls, y)
  const avg = movingAvg(y)
  const tests = Math.min(8, validOf(y).length - 8)
  if (tests < 3) return { fit: avg, method: 'average', cls }
  let eModel = 0, eAvg = 0
  for (let o = y.length - tests; o < y.length; o++) {
    const a = y[o]
    if (Number.isNaN(a)) continue
    const hist = y.slice(0, o)
    eModel += Math.abs(a - fitFor(cls, hist).forecast(1))   // test the same model that will be used
    eAvg += Math.abs(a - movingAvg(hist).forecast(1))
  }
  return eModel < eAvg ? { fit: model, method: 'model', cls } : { fit: avg, method: 'average', cls }
}

// ── Weekly product series (stockout-adjusted) ───────────────────────────────
export interface ProductSeries { product_id: string; weeks: string[]; qty: number[]; outDays: number[]; avgPrice: number }

export function productSeries(raw: RawInsights): { weeks: string[]; series: Map<string, ProductSeries> } {
  const weeks = raw.weeks
  const series = new Map<string, ProductSeries>()
  for (const r of raw.series) {
    // Average selling price over the last 11 weeks (rev holds the last 16).
    const rev11 = r.rev.slice(-11).reduce((a, b) => a + b, 0)
    const qty11 = r.qty.slice(-11).reduce((a, b) => a + b, 0)
    series.set(r.product_id, { product_id: r.product_id, weeks, qty: r.qty, outDays: r.out, avgPrice: qty11 > 0 ? rev11 / qty11 : 0 })
  }
  return { weeks, series }
}

/** Clean series: drop weeks before the product's first sale, censor heavy stockout weeks, scale partial ones. */
function cleanSeries(s: ProductSeries): number[] {
  const firstSale = s.qty.findIndex((q) => q > 0)
  if (firstSale < 0) return []
  return s.qty.slice(firstSale).map((q, k) => {
    const out = s.outDays[firstSale + k]
    if (out >= 5) return NaN
    return out > 0 ? Math.min(q * 2, (q * 7) / (7 - out)) : Math.max(0, q)
  })
}

// ── Forecast outputs ────────────────────────────────────────────────────────
export interface ProductForecast {
  product_id: string; cls: DemandClass; method: ForecastMethod
  weeks: { week: string; qty: number; lo: number; hi: number }[]
  total4w: number; value4w: number; last4w: number; avgWeekly: number; sigmaWeekly: number
  changePct: number | null
}

export function forecastProducts(raw: RawInsights, season: Seasonality, fx: CalendarEffects): { list: ProductForecast[]; series: Map<string, ProductSeries> } {
  const { series } = productSeries(raw)
  const rainByDay = new Map(raw.weather.filter((w) => w.is_forecast || w.day >= raw.today).map((w) => [w.day, w.rain_mm]))
  const thisWeek = weekStart(raw.today)
  // Seasonal level of the recent 8 weeks (what the smoothed level reflects).
  const recentIdx = mean([0, 1, 2, 3, 4, 5, 6, 7].map((k) => season.index[monthIndex(addDays(thisWeek, -7 * (k + 1)))]))
  const targets = [0, 1, 2, 3].map((k) => addDays(thisWeek, 7 * k))
  const targetFactor = targets.map((w) => {
    const days = eachDay(w, addDays(w, 6)).filter((d) => dow(d) !== 0)
    return (season.index[monthIndex(addDays(w, 3))] / recentIdx) * calendarFactor(days, fx, rainByDay)
  })

  const list: ProductForecast[] = []
  for (const s of series.values()) {
    const y = cleanSeries(s)
    if (!y.length) continue
    const { fit, method, cls } = chooseFit(y)
    // Never forecast more than 1.25× the best in-stock week of the last 26.
    const cap = 1.25 * Math.max(0, ...validOf(y.slice(-26)))
    const weeks = targets.map((w, k) => {
      const base = Math.min(fit.forecast(k + 1), cap)
      const qty = base * targetFactor[k]
      const band = Z80 * fit.sigma * Math.sqrt(k + 1)
      return { week: w, qty, lo: Math.max(0, qty - band), hi: qty + band }
    })
    const total4w = weeks.reduce((a, w) => a + w.qty, 0)
    const last4 = s.qty.slice(-4).reduce((a, b) => a + b, 0)
    list.push({
      product_id: s.product_id, cls, method, weeks, total4w, value4w: total4w * s.avgPrice, last4w: last4,
      avgWeekly: total4w / 4, sigmaWeekly: fit.sigma,
      changePct: last4 > 0 ? ((total4w - last4) / last4) * 100 : null,
    })
  }
  return { list: list.sort((a, b) => b.value4w - a.value4w), series }
}

export interface MonthForecast { month: string; revenue: number; lo: number; hi: number; actualToDate: number | null; profit: number; seasonIndex: number }

/** Monthly revenue forecast: damped Holt on deseasonalised months × seasonal index × calendar. */
export function forecastMonthly(
  monthRevenue: { month: string; revenue: number; partial: boolean }[],
  season: Seasonality, horizon: number, today: string, marginPct: number, fx: CalendarEffects
): { months: MonthForecast[]; sigma: number } {
  const full = matureMonths(monthRevenue)
  const des = full.map((m) => m.revenue / season.index[monthIndex(m.month + '-01')])
  const fit = holtDamped(des, 0.5, 0.15, 0.85)
  // Log-scale error for multiplicative bands.
  const lastLevel = des.length ? des[des.length - 1] : 0
  const sigmaRel = Math.max(0.08, lastLevel ? fit.sigma / Math.max(mean(des), 1) : 0.15)
  const cur = monthStart(today)
  const curActual = monthRevenue.find((m) => m.month === monthKey(today))?.revenue ?? 0
  const months: MonthForecast[] = []
  for (let h = 1; h <= horizon; h++) {
    const m = addMonths(cur, h - 1)
    const idx = season.index[monthIndex(m)]
    const days = eachDay(m, addDays(m, daysInMonth(m) - 1))
    const cal = calendarFactor(days.filter((d) => dow(d) !== 0), { ...fx, rainFactor: 1 }, new Map())
    let revenue = fit.forecast(h) * idx * cal
    let actualToDate: number | null = null
    if (h === 1) {
      // Current month: actual so far + the forecast share of the remaining days.
      const left = days.filter((d) => d >= today).length
      actualToDate = curActual
      revenue = curActual + revenue * (left / days.length)
    }
    const band = Math.exp(Z80 * sigmaRel * Math.sqrt(h))
    months.push({ month: monthKey(m), revenue, lo: revenue / band, hi: revenue * band, actualToDate, profit: revenue * (marginPct / 100), seasonIndex: idx })
  }
  return { months, sigma: sigmaRel }
}

// ── Backtest ────────────────────────────────────────────────────────────────
export interface Backtest { weeksTested: number; products: number; wapeModel: number; wapeNaive: number; wape4wModel: number; wape4wNaive: number }

/** Rolling-origin backtest over the last 8 weeks for the top products. */
export function backtest(series: Map<string, ProductSeries>, topIds: string[]): Backtest {
  let errM = 0, errN = 0, act = 0, err4M = 0, err4N = 0, act4 = 0, products = 0
  const ORIGINS = 8
  for (const id of topIds) {
    const s = series.get(id)
    if (!s) continue
    const y = cleanSeries(s)
    if (y.length < 16) continue
    products++
    for (let o = y.length - ORIGINS; o < y.length; o++) {
      const hist = y.slice(0, o)
      const { fit } = chooseFit(hist)
      const lastVals = hist.filter((v) => !Number.isNaN(v)).slice(-4)
      const naive = mean(lastVals)
      const a = y[o]
      if (!Number.isNaN(a)) { errM += Math.abs(a - fit.forecast(1)); errN += Math.abs(a - naive); act += a }
      if (o + 4 <= y.length) {
        const a4 = y.slice(o, o + 4).filter((v) => !Number.isNaN(v))
        if (a4.length === 4) {
          const sa = a4.reduce((x, z) => x + z, 0)
          let f4 = 0; for (let h = 1; h <= 4; h++) f4 += fit.forecast(h)
          err4M += Math.abs(sa - f4); err4N += Math.abs(sa - naive * 4); act4 += sa
        }
      }
    }
  }
  return {
    weeksTested: ORIGINS, products,
    wapeModel: act ? (errM / act) * 100 : 0, wapeNaive: act ? (errN / act) * 100 : 0,
    wape4wModel: act4 ? (err4M / act4) * 100 : 0, wape4wNaive: act4 ? (err4N / act4) * 100 : 0,
  }
}

/** Next 16 days of rain with the expected effect on sales. */
export function rainOutlook(raw: RawInsights, fx: CalendarEffects) {
  return raw.weather.filter((w) => w.day >= raw.today).slice(0, 16).map((w) => ({
    day: w.day, rain_mm: w.rain_mm, heavy: w.rain_mm >= 20,
    effectPct: w.rain_mm >= 20 ? (fx.rainFactor - 1) * 100 : 0,
    holiday: holidayName(w.day), payday: isPaydayWindow(w.day), dom: dom(w.day),
  }))
}
