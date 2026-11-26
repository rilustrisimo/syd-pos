// Business KPIs from the daily rows: period totals vs the previous period,
// monthly P&L, sales patterns (weekday, payday), and cash-cycle figures
// (DSO / DIO / DPO, GMROI, turns, break-even).

import type { DailyRow, ExpenseRow, PurchaseRow, RawInsights } from './types'
import { addDays, daysBetween, dom, dow, eachDay, monthKey, monthStart, daysInMonth, WEEKDAYS } from './dates'
import { holidayName } from './holidays'

export interface PeriodTotals {
  revenue: number; cogs: number; grossProfit: number; marginPct: number
  expenses: number; netProfit: number
  sales: number; avgTicket: number; returns: number; discounts: number
  newCustomers: number; deliveries: number; deliveryShare: number
  creditSales: number; creditShare: number; govRevenue: number
  linesPerSale: number; tradingDays: number; revenuePerDay: number
}

const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + (f(r) || 0), 0)
export const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0)
export const growth = (cur: number, prev: number) => (prev ? ((cur - prev) / Math.abs(prev)) * 100 : null)

export function totals(daily: DailyRow[], expenses: ExpenseRow[], from: string, to: string): PeriodTotals {
  const d = daily.filter((r) => r.ph_date >= from && r.ph_date <= to)
  const revenue = sum(d, (r) => r.revenue)
  const cogs = sum(d, (r) => r.cogs)
  const exp = sum(expenses.filter((e) => e.ph_date >= from && e.ph_date <= to), (e) => e.total_amount)
  const sales = sum(d, (r) => r.sales_count)
  const deliveries = sum(d, (r) => r.delivery_count)
  const creditSales = sum(d, (r) => r.credit_sales)
  const tradingDays = new Set(d.filter((r) => r.sales_count > 0).map((r) => r.ph_date)).size
  return {
    revenue, cogs, grossProfit: revenue - cogs, marginPct: pct(revenue - cogs, revenue),
    expenses: exp, netProfit: revenue - cogs - exp,
    sales, avgTicket: sales ? revenue / sales : 0,
    returns: sum(d, (r) => r.return_amount), discounts: sum(d, (r) => r.discounts),
    newCustomers: sum(d, (r) => r.new_customers),
    deliveries, deliveryShare: pct(deliveries, sales),
    creditSales, creditShare: pct(creditSales, revenue),
    govRevenue: sum(d, (r) => r.gov_revenue),
    linesPerSale: sales ? sum(d, (r) => r.units_lines) / sales : 0,
    tradingDays, revenuePerDay: tradingDays ? revenue / tradingDays : 0,
  }
}

export function previousRange(from: string, to: string) {
  const len = daysBetween(from, to) + 1
  return { from: addDays(from, -len), to: addDays(from, -1) }
}

export interface MonthRow {
  month: string; revenue: number; cogs: number; grossProfit: number; marginPct: number
  expenses: number; netProfit: number; purchases: number; sales: number; avgTicket: number
  newCustomers: number; momGrowth: number | null; partial: boolean
}

export function monthly(daily: DailyRow[], expenses: ExpenseRow[], purchases: PurchaseRow[], today: string): MonthRow[] {
  const by = new Map<string, MonthRow>()
  const get = (m: string) => {
    if (!by.has(m)) by.set(m, { month: m, revenue: 0, cogs: 0, grossProfit: 0, marginPct: 0, expenses: 0, netProfit: 0, purchases: 0, sales: 0, avgTicket: 0, newCustomers: 0, momGrowth: null, partial: false })
    return by.get(m)!
  }
  for (const r of daily) { const m = get(monthKey(r.ph_date)); m.revenue += r.revenue; m.cogs += r.cogs; m.sales += r.sales_count; m.newCustomers += r.new_customers }
  for (const e of expenses) get(monthKey(e.ph_date)).expenses += e.total_amount
  for (const p of purchases) get(monthKey(p.ph_date)).purchases += p.total_purchases
  // Start at the first month with sales (expenses recorded before opening are not a "month").
  const all = [...by.values()].sort((a, b) => a.month.localeCompare(b.month))
  const firstSales = all.findIndex((m) => m.sales > 0)
  const rows = firstSales > 0 ? all.slice(firstSales) : all
  rows.forEach((m, i) => {
    m.grossProfit = m.revenue - m.cogs
    m.marginPct = pct(m.grossProfit, m.revenue)
    m.netProfit = m.grossProfit - m.expenses
    m.avgTicket = m.sales ? m.revenue / m.sales : 0
    m.partial = m.month === monthKey(today)
    const prev = rows[i - 1]
    // A month in progress isn't comparable to a full month.
    m.momGrowth = prev && !m.partial ? growth(m.revenue, prev.revenue) : null
  })
  return rows
}

/** Revenue per trading day by weekday, and payday vs other days. */
export function patterns(daily: DailyRow[], from: string, to: string) {
  const byDay = new Map<string, number>()
  for (const r of daily) if (r.ph_date >= from && r.ph_date <= to) byDay.set(r.ph_date, (byDay.get(r.ph_date) ?? 0) + r.revenue)
  const days = eachDay(from, to).filter((d) => !holidayName(d))
  const wk = WEEKDAYS.map((label) => ({ label, total: 0, days: 0 }))
  for (const d of days) { const w = wk[dow(d)]; w.total += byDay.get(d) ?? 0; w.days++ }
  const weekday = wk.map((w) => ({ label: w.label, avg: w.days ? w.total / w.days : 0 }))

  const buckets = [
    { label: '1st', test: (n: number) => n === 1 },
    { label: '2–14', test: (n: number) => n >= 2 && n <= 14 },
    { label: '15–16 (payday)', test: (n: number) => n === 15 || n === 16 },
    { label: '17–29', test: (n: number) => n >= 17 && n <= 29 },
    { label: '30–31 (payday)', test: (n: number) => n >= 30 },
  ].map((b) => ({ ...b, total: 0, days: 0 }))
  const open = days.filter((d) => (byDay.get(d) ?? 0) > 0)
  for (const d of open) { const b = buckets.find((x) => x.test(dom(d)))!; b.total += byDay.get(d)!; b.days++ }
  const overall = open.length ? open.reduce((a, d) => a + byDay.get(d)!, 0) / open.length : 0
  const dayOfMonth = buckets.map((b) => ({ label: b.label, avg: b.days ? b.total / b.days : 0, index: overall && b.days ? b.total / b.days / overall : 1 }))
  const paydayAvg = (() => {
    const p = open.filter((d) => [1, 15, 16, 30, 31].includes(dom(d)))
    return p.length ? p.reduce((a, d) => a + byDay.get(d)!, 0) / p.length : 0
  })()
  return { weekday, dayOfMonth, paydayLift: overall ? (paydayAvg / overall - 1) * 100 : 0 }
}

/** Cash cycle and inventory productivity, using the last 90 days as the base. */
export function cashCycle(raw: RawInsights) {
  const from90 = addDays(raw.today, -89)
  const last90 = raw.dailyAll.filter((r) => r.ph_date >= from90)
  const rev90 = sum(last90, (r) => r.revenue)
  const cogs90 = sum(last90, (r) => r.cogs)
  const credit90 = sum(last90, (r) => r.credit_sales)
  const purchases90 = sum(raw.purchasesAll.filter((p) => p.ph_date >= from90), (p) => p.total_purchases)
  const inventoryValue = sum(raw.inventory, (i) => Math.max(0, i.stock_value))
  const investorValue = sum(raw.inventory, (i) => Math.max(0, Math.min(i.investor_qty, i.qty_on_hand)) * i.unit_cost)
  const arOpen = sum(raw.customers, (c) => c.open_ar)
  const dso = credit90 > 0 ? (arOpen / credit90) * 90 : rev90 ? (arOpen / rev90) * 90 : 0
  const dio = cogs90 > 0 ? (inventoryValue / cogs90) * 90 : 0
  const dpo = purchases90 > 0 ? (raw.apOpen.open_ap / purchases90) * 90 : 0
  const annualGP = ((rev90 - cogs90) / 90) * 365
  const annualCOGS = (cogs90 / 90) * 365

  // Break-even: average monthly expenses of the last 3 full months ÷ margin.
  const lastFull = monthStart(raw.today)
  const exp3 = raw.expensesAll.filter((e) => e.ph_date < lastFull && e.ph_date >= addDays(lastFull, -92))
  const monthsCovered = Math.max(1, new Set(exp3.map((e) => monthKey(e.ph_date))).size)
  const monthlyExpenses = sum(exp3, (e) => e.total_amount) / monthsCovered
  const margin = rev90 ? (rev90 - cogs90) / rev90 : 0
  const thisMonthDays = daysInMonth(raw.today)

  return {
    arOpen, apOpen: raw.apOpen.open_ap, apDue30: raw.apOpen.due_30, inventoryValue, investorValue,
    dso, dio, dpo, ccc: dso + dio - dpo,
    gmroi: inventoryValue ? annualGP / inventoryValue : 0,
    turns: inventoryValue ? annualCOGS / inventoryValue : 0,
    monthlyExpenses, breakEvenMonthly: margin > 0 ? monthlyExpenses / margin : 0,
    breakEvenDaily: margin > 0 ? monthlyExpenses / margin / thisMonthDays : 0,
  }
}

export function branchComparison(raw: RawInsights, from: string, to: string) {
  const name = new Map(raw.branches.map((b) => [b.id, b.name]))
  const by = new Map<string, { branch: string; revenue: number; cogs: number; sales: number }>()
  for (const r of raw.dailyAll) {
    if (r.ph_date < from || r.ph_date > to) continue
    const b = by.get(r.branch_id) ?? { branch: name.get(r.branch_id) ?? 'Branch', revenue: 0, cogs: 0, sales: 0 }
    b.revenue += r.revenue; b.cogs += r.cogs; b.sales += r.sales_count
    by.set(r.branch_id, b)
  }
  return [...by.values()].map((b) => ({ ...b, grossProfit: b.revenue - b.cogs, marginPct: pct(b.revenue - b.cogs, b.revenue), avgTicket: b.sales ? b.revenue / b.sales : 0 }))
    .sort((a, b) => b.revenue - a.revenue)
}

/** Daily series (summed over branches) for trend charts, zero-filled. */
export function dailySeries(daily: DailyRow[], from: string, to: string) {
  const by = new Map<string, { revenue: number; profit: number; sales: number }>()
  for (const r of daily) {
    if (r.ph_date < from || r.ph_date > to) continue
    const x = by.get(r.ph_date) ?? { revenue: 0, profit: 0, sales: 0 }
    x.revenue += r.revenue; x.profit += r.revenue - r.cogs; x.sales += r.sales_count
    by.set(r.ph_date, x)
  }
  return eachDay(from, to).map((d) => ({ date: d, ...(by.get(d) ?? { revenue: 0, profit: 0, sales: 0 }) }))
}
