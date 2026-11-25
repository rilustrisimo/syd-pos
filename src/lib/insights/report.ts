// Turns the Insights bundle into (1) a detailed Markdown report for any LLM
// (ChatGPT / Claude / Gemini) with definitions, tables and caveats, and
// (2) clean CSV files. A compact version of the Markdown feeds the weekly
// Gemini brief.

import type { InsightsBundle } from './bundle'
import type { RawInsights } from './types'
import { SEGMENT_HELP } from './customers'

const peso = (n: number | null | undefined) => '₱' + Math.round(Number(n ?? 0)).toLocaleString('en-PH')
const p1 = (n: number | null | undefined) => (n == null || !isFinite(n) ? '—' : `${n.toFixed(1)}%`)
const n1 = (n: number | null | undefined) => (n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('en-PH', { maximumFractionDigits: 1 }))
const esc = (s: unknown) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')

function table(head: string[], rows: unknown[][]): string {
  if (!rows.length) return '_None._\n'
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n') + '\n'
}

export function buildMarkdown(b: InsightsBundle, opts: { compact?: boolean; storeName?: string } = {}): string {
  const c = b.overview.current, pv = b.overview.previous, g = b.overview.growth, cash = b.overview.cash
  const lim = opts.compact ? 10 : 40
  const out: string[] = []
  const branch = b.meta.branchId ? b.meta.branches.find((x) => x.id === b.meta.branchId)?.name : 'All branches'

  out.push(`# ${opts.storeName ?? 'SYD Hardware'} — Business Insights`)
  out.push(`Period: **${b.meta.from} to ${b.meta.to}** (${b.meta.rangeDays} days) vs previous ${b.meta.prevFrom} to ${b.meta.prevTo}. Branch: ${branch}. Generated ${b.meta.generatedAt.slice(0, 16).replace('T', ' ')} UTC.\n`)

  if (!opts.compact) {
    out.push(`## Business context
- Hardware & construction-materials store in Talakag, Bukidnon (Mindanao, Philippines). Customers: walk-in homeowners, contractors, farms (piggery/poultry), government projects.
- POS data since January 2026 (${b.forecast.historyMonths} full months). Currency PHP. Dates are Manila time.
- Seasonality context (PH industry): build season peaks Feb–May (dry); rainy months Jul–Sep are usually the slowest; typhoons and Holy Week cause dips; paydays (15th & 30th) and 13th-month pay (Dec) lift sales.

## Metric definitions
- Revenue = sales − returns incl. delivery/other fees, after discounts (same as the P&L report). Gross profit = revenue − cost of goods (FIFO lot cost per sale line).
- Net profit = gross profit − recorded expenses (payroll, rent, utilities…).
- GMROI = annualised gross profit ÷ stock value at cost (hardware benchmark ≈ 1.8). Turns = annualised COGS ÷ stock value (hardware ≈ 4–6/yr).
- DSO = receivables ÷ credit sales (90d) × 90. DIO = stock ÷ COGS (90d) × 90. DPO = payables ÷ purchases (90d) × 90. Cash cycle = DSO + DIO − DPO.
- ABC = share of revenue (A = top 80%, B = next 15%, C = rest). XYZ = variability of weekly demand (coefficient of variation: X < 0.5 steady, Y < 1, Z ≥ 1).
- Customer segments use each customer's own median gap between purchases ("overdue ratio" = days since last purchase ÷ usual gap).
- Forecast: per product, Syntetos–Boylan demand class → damped Holt (steady) or SBA/Croston (intermittent); stockout weeks removed; monthly seasonality = own data blended with the PH prior; calendar effects (holidays, paydays, heavy rain) measured from our own sales. 80% intervals.
`)
  }

  out.push(`## Headline KPIs`)
  out.push(table(['Metric', 'This period', 'Previous', 'Change'], [
    ['Revenue', peso(c.revenue), peso(pv.revenue), p1(g.revenue)],
    ['Gross profit', peso(c.grossProfit), peso(pv.grossProfit), p1(g.grossProfit)],
    ['Gross margin', p1(c.marginPct), p1(pv.marginPct), `${(c.marginPct - pv.marginPct).toFixed(1)} pts`],
    ['Expenses', peso(c.expenses), peso(pv.expenses), ''],
    ['Net profit', peso(c.netProfit), peso(pv.netProfit), p1(g.netProfit)],
    ['Sales (transactions)', n1(c.sales), n1(pv.sales), p1(g.sales)],
    ['Average ticket', peso(c.avgTicket), peso(pv.avgTicket), p1(g.avgTicket)],
    ['Items per sale', n1(c.linesPerSale), n1(pv.linesPerSale), ''],
    ['New customers', n1(c.newCustomers), n1(pv.newCustomers), p1(g.newCustomers)],
    ['Returns', peso(c.returns), peso(pv.returns), ''],
    ['Discounts given', peso(c.discounts), peso(pv.discounts), ''],
    ['Credit (utang) share of revenue', p1(c.creditShare), p1(pv.creditShare), ''],
    ['Delivered sales share', p1(c.deliveryShare), p1(pv.deliveryShare), ''],
  ]))
  out.push(table(['Cash & stock', 'Value'], [
    ['Receivables (AR)', peso(cash.arOpen)], ['Payables (AP)', `${peso(cash.apOpen)} (${peso(cash.apDue30)} due in 30 days)`],
    ['Stock value at cost', peso(cash.inventoryValue)], ['Investor-funded stock', peso(cash.investorValue)],
    ['DSO / DIO / DPO', `${Math.round(cash.dso)} / ${Math.round(cash.dio)} / ${Math.round(cash.dpo)} days`], ['Cash conversion cycle', `${Math.round(cash.ccc)} days`],
    ['GMROI / Turns', `${cash.gmroi.toFixed(2)} / ${cash.turns.toFixed(1)} per year`],
    ['Avg monthly expenses / break-even sales', `${peso(cash.monthlyExpenses)} / ${peso(cash.breakEvenMonthly)} per month`],
  ]))

  out.push(`## Monthly P&L (all history)`)
  out.push(table(['Month', 'Revenue', 'MoM', 'Gross profit', 'Margin', 'Expenses', 'Net', 'Purchases', 'Sales', 'Avg ticket', 'New cust.'],
    b.sales.months.map((m) => [m.month + (m.partial ? ' (partial)' : ''), peso(m.revenue), p1(m.momGrowth), peso(m.grossProfit), p1(m.marginPct), peso(m.expenses), peso(m.netProfit), peso(m.purchases), m.sales, peso(m.avgTicket), m.newCustomers])))

  const pat = b.sales.patterns
  out.push(`## Sales patterns (period)`)
  out.push(`- Avg revenue per weekday: ${pat.weekday.map((w) => `${w.label} ${peso(w.avg)}`).join(', ')}`)
  out.push(`- Day of month: ${pat.dayOfMonth.map((d) => `${d.label} ${peso(d.avg)}`).join(', ')} (payday lift ${p1(pat.paydayLift)})`)
  out.push(`- Payment methods: ${b.sales.paymentMix.map((m) => `${m.method} ${peso(m.amount)}`).join(', ') || '—'}`)
  out.push(`- Deliveries by distance: ${b.sales.deliveries.bands.map((x) => `${x.label}: ${x.count} trips, ${peso(x.revenue)} sales, ${peso(x.fees)} fees`).join('; ')}`)
  if (!opts.compact) out.push(`- Top delivery areas: ${b.sales.deliveries.places.map((x) => `${x.place} (${x.count}, ${peso(x.revenue)})`).join('; ') || '—'}`)
  if (b.sales.branches.length > 1) out.push(table(['Branch', 'Revenue', 'Gross profit', 'Margin', 'Sales'], b.sales.branches.map((x) => [x.branch, peso(x.revenue), peso(x.grossProfit), p1(x.marginPct), x.sales])))
  out.push('')

  out.push(`## Categories (period)`)
  out.push(table(['Category', 'Revenue', 'Gross profit', 'Margin', 'Stock value', 'GMROI', 'Turns'],
    b.products.categories.slice(0, opts.compact ? 12 : 40).map((x) => [x.category, peso(x.revenue), peso(x.profit), p1(x.marginPct), peso(x.stockValue), x.gmroi?.toFixed(2) ?? '—', x.turns?.toFixed(1) ?? '—'])))

  out.push(`## Top products (period)`)
  out.push(table(['Product', 'Category', 'Class', 'Qty', 'Revenue', 'Gross profit', 'Margin', 'Orders'],
    b.products.top.slice(0, lim).map((p) => [p.name, p.category, `${p.abc ?? ''}${p.xyz ?? ''}`, `${n1(p.qty)} ${p.uom}`, peso(p.revenue), peso(p.profit), p1(p.marginPct), p.orders])))
  out.push(`ABC–XYZ counts: ${Object.entries(b.products.matrix).map(([k, v]) => `${k} ${v.count}`).join(', ')}\n`)

  out.push(`## Margin leaks`)
  out.push(table(['Product', 'Issue', 'Detail', 'Profit at stake'], b.products.leaks.slice(0, lim).map((l) => [l.name, l.kind, l.detail, peso(l.impact)])))
  if (!opts.compact) {
    out.push(`## Price vs volume (last 8 weeks vs prior 8)`)
    out.push(table(['Product', 'Price change', 'Volume change', 'Revenue change'], b.products.priceVolume.map((x) => [x.name, p1(x.priceChange), p1(x.volumeChange), p1(x.revenueChange)])))
    out.push(`## Frequently bought together`)
    out.push(table(['Product A', 'Product B', 'Sales together'], b.products.pairs.slice(0, 25).map((x) => [x.a, x.b, x.together])))
  }

  out.push(`## Customers`)
  out.push(`Walk-in share of sales: ${p1(b.customers.walkinShare)}. Quotation → sale conversion: ${p1(b.customers.quotations.rate)} of quotes (${p1(b.customers.quotations.amountRate)} of quoted value).\n`)
  out.push(table(['Segment', 'Customers', 'Revenue (YTD)', 'Revenue last 90d', 'Meaning'], b.customers.segments.map((s) => [s.segment, s.count, peso(s.revenue), peso(s.rev90), SEGMENT_HELP[s.segment]])))
  out.push(`### Top customers`)
  out.push(table(['Customer', 'Type', 'Segment', 'Revenue', 'Share', 'Profit', 'Purchase days', 'Last purchase', 'Usual gap (days)', 'Trend 90d', 'Owes'],
    b.customers.top.slice(0, opts.compact ? 10 : 20).map((x) => [x.name, x.customer_type, x.segment, peso(x.revenue), p1(x.sharePct), peso(x.profit), x.buy_days, x.last_date, x.cadenceDays ?? '—', p1(x.trendPct), peso(x.open_ar)])))
  out.push(`### Slipping / at-risk regulars (call list)`)
  out.push(table(['Customer', 'Segment', 'Days since last buy', 'Usual gap', 'Revenue (YTD)', 'Trend 90d', 'Phone'],
    b.customers.slipping.slice(0, lim).map((x) => [x.name, x.segment, x.recencyDays, x.cadenceDays ?? '—', peso(x.revenue), p1(x.trendPct), x.phone ?? ''])))
  out.push(`### Receivables aging`)
  out.push(table(['Age', 'Customers', 'Amount'], [...b.customers.ar.buckets.map((x) => [x.label, x.customers, peso(x.amount)]), ['Walk-in (unnamed)', '—', peso(b.customers.ar.walkinAr)]]))
  out.push(table(['Customer', 'Owes', 'Oldest unpaid (days)', 'Credit limit', 'Over limit'], b.customers.ar.debtors.slice(0, lim).map((x) => [x.name, peso(x.open_ar), x.arAgeDays ?? '—', x.credit_limit ? peso(x.credit_limit) : '—', x.overLimit ? 'YES' : ''])))
  if (!opts.compact) {
    out.push(`### Cohort retention (% of each month's new customers buying again N months later)`)
    out.push(table(['Cohort', 'New', ...Array.from({ length: 11 }, (_, i) => `+${i + 1}`)], b.customers.cohorts.map((x) => [x.cohort, x.size, ...x.retention.map((r) => (r == null ? '' : `${r.toFixed(0)}%`))])))
  }

  const inv = b.inventory
  out.push(`## Inventory`)
  out.push(`- Estimated sales lost to stockouts (90d): ${peso(inv.lostSales90)}. Dead stock: ${inv.dead.buckets.map((x) => `${x.days}+ days ${peso(x.value)} (${x.items} items)`).join('; ')}.`)
  out.push(`- Shrinkage (negative adjustments at cost) by month: ${inv.shrinkage.months.map((m) => `${m.month} ${peso(m.valueLost)}`).join(', ') || 'none'}.\n`)
  out.push(`### Needs ordering now`)
  out.push(table(['Product', 'Class', 'On hand', 'Daily demand', 'Lead days', 'Reorder point', 'Suggested order', 'Order value'],
    inv.reorder.filter((r) => r.status === 'order_now').sort((a, x) => x.suggestValue - a.suggestValue).slice(0, lim)
      .map((r) => [r.name, r.abc ?? '', `${n1(r.onHand)} ${r.uom}`, n1(r.dailyDemand), r.leadDays, n1(r.reorderPoint), n1(r.suggestQty), peso(r.suggestValue)])))
  out.push(`### Stockouts that cost sales (90d)`)
  out.push(table(['Product', 'Days out', 'Lost sales'], inv.stockoutProducts.slice(0, opts.compact ? 8 : 25).map((r) => [r.name, r.stockoutDays90, peso(r.lostSales90)])))
  out.push(`### Dead stock (no sale 90+ days)`)
  out.push(table(['Product', 'On hand', 'Value', 'Days since last sale'], inv.dead.list.slice(0, opts.compact ? 8 : 40).map((r) => [r.name, `${n1(r.onHand)} ${r.uom}`, peso(r.stockValue), r.daysSinceSale ?? 'never'])))
  out.push(`### Overstock (120+ days of supply)`)
  out.push(table(['Product', 'On hand', 'Days of supply', 'Value'], inv.overstock.slice(0, opts.compact ? 8 : 25).map((r) => [r.name, `${n1(r.onHand)} ${r.uom}`, n1(r.daysOfCover), peso(r.stockValue)])))
  out.push(`### Suppliers`)
  out.push(table(['Supplier', 'POs', 'Avg lead (days)', 'On-time', 'Total bought'], inv.suppliers.slice(0, 15).map((s) => [s.supplier, s.pos, n1(s.avgLeadDays), p1(s.onTimePct), peso(s.total)])))

  const f = b.forecast
  out.push(`## Forecast`)
  out.push(`Backtest (last ${f.backtest.weeksTested} weeks, ${f.backtest.products} top products): 1-week WAPE ${p1(f.backtest.wapeModel)} (naive ${p1(f.backtest.wapeNaive)}); 4-week WAPE ${p1(f.backtest.wape4wModel)} (naive ${p1(f.backtest.wape4wNaive)}).`)
  out.push(`Measured effects: holidays ×${f.effects.holidayFactor.toFixed(2)} (${f.effects.holidaySamples} days), paydays ×${f.effects.paydayFactor.toFixed(2)} (${f.effects.paydaySamples}), heavy rain ×${f.effects.rainFactor.toFixed(2)} (${f.effects.rainSamples}).`)
  out.push(`Seasonal index (Jan–Dec): ${f.season.index.map((x) => x.toFixed(2)).join(', ')} (own data weight: ${f.season.ownWeight.map((x) => x.toFixed(2)).join(', ')}).\n`)
  out.push(table(['Month', 'Forecast revenue', '80% range', 'Expected gross profit', 'Actual so far'],
    f.total12.map((m) => [m.month, peso(m.revenue), `${peso(m.lo)} – ${peso(m.hi)}`, peso(m.profit), m.actualToDate == null ? '' : peso(m.actualToDate)])))
  out.push(`### Categories, next months`)
  out.push(table(['Category', 'Avg last 3 months', ...(f.categories[0]?.months ?? []).map((m) => m.month)], f.categories.map((x) => [x.category, peso(x.last3Avg), ...x.months.map((m) => peso(m.revenue))])))
  out.push(`### Products, next 4 weeks`)
  out.push(table(['Product', 'Pattern', 'Wk1', 'Wk2', 'Wk3', 'Wk4', '4-wk total', 'Last 4 wks', 'Change'],
    f.products.slice(0, opts.compact ? 15 : 60).map((p) => [p.name, p.cls, ...p.weeks.map((w) => n1(w.qty)), `${n1(p.total4w)} ${p.uom}`, n1(p.last4w), p1(p.changePct)])))
  out.push(`Weather next days (mm rain): ${f.rain.map((r) => `${r.day.slice(5)} ${Math.round(r.rain_mm)}${r.holiday ? ' (holiday)' : ''}`).join(', ') || 'unavailable'}`)
  out.push(`Upcoming holidays: ${f.holidays.map((h) => `${h.day} ${h.name}`).join('; ')}\n`)

  out.push(`## Alerts`)
  out.push(b.alerts.length ? b.alerts.map((a) => `- [${a.level}] **${a.title}** — ${a.message}`).join('\n') + '\n' : '_None._\n')

  if (!opts.compact) {
    out.push(`## Data caveats
- Less than 2 years of history: monthly seasonality is partly from industry patterns, not yet proven in our own data.
- Cost before late Nov 2026 comes from the product's cost at time of sale; FIFO lot costing started 2026-11-23.
- Walk-in customers are one combined record, so customer metrics cover named customers only.
- Expenses only include what was recorded in the system.

## Questions to explore
1. Which 3 actions would raise net profit the most next month, given margins, dead stock and expenses?
2. What should we stock up on before the next dry-season build months (Feb–May), and how much cash will that need?
3. Which customers should we call this week, and what offer fits each?
4. Are any prices too low for today's costs? Suggest new prices that keep volume.
5. Is our credit (utang) policy healthy? Who should have limits reduced?
6. What's a realistic sales target for each of the next 3 months?
`)
  }
  return out.join('\n')
}

// ── CSVs ────────────────────────────────────────────────────────────────────
function csv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const head = Object.keys(rows[0])
  const cell = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(4)) : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [head.join(','), ...rows.map((r) => head.map((h) => cell(r[h])).join(','))].join('\n') + '\n'
}

export function buildCsvs(b: InsightsBundle, raw: RawInsights): Record<string, string> {
  const name = new Map(raw.inventory.map((i) => [i.product_id, i]))
  const daily = new Map<string, any>()
  for (const r of raw.dailyAll) {
    const x = daily.get(r.ph_date) ?? { date: r.ph_date, revenue: 0, cogs: 0, gross_profit: 0, sales: 0, returns: 0, discounts: 0, deliveries: 0, delivery_fees: 0, credit_sales: 0, gov_revenue: 0, new_customers: 0 }
    x.revenue += r.revenue; x.cogs += r.cogs; x.gross_profit += r.revenue - r.cogs; x.sales += r.sales_count; x.returns += r.return_amount
    x.discounts += r.discounts; x.deliveries += r.delivery_count; x.delivery_fees += r.delivery_fees; x.credit_sales += r.credit_sales
    x.gov_revenue += r.gov_revenue; x.new_customers += r.new_customers
    daily.set(r.ph_date, x)
  }
  const expensesMonthly = new Map<string, number>()
  for (const e of raw.expensesAll) { const k = `${e.ph_date.slice(0, 7)}|${e.category_name}`; expensesMonthly.set(k, (expensesMonthly.get(k) ?? 0) + e.total_amount) }

  return {
    'monthly_finance.csv': csv(b.sales.months.map((m) => ({ month: m.month, partial: m.partial, revenue: m.revenue, cogs: m.cogs, gross_profit: m.grossProfit, margin_pct: m.marginPct, expenses: m.expenses, net_profit: m.netProfit, purchases: m.purchases, sales: m.sales, avg_ticket: m.avgTicket, new_customers: m.newCustomers, mom_growth_pct: m.momGrowth }))),
    'daily_sales.csv': csv([...daily.values()].sort((a, x) => a.date.localeCompare(x.date))),
    'expenses_monthly.csv': csv([...expensesMonthly.entries()].map(([k, v]) => ({ month: k.split('|')[0], category: k.split('|')[1], amount: v })).sort((a, x) => a.month.localeCompare(x.month))),
    'product_weekly.csv': csv(raw.series.flatMap((sr) => {
      const off = raw.weeks.length - sr.rev.length
      return sr.qty.map((q, i) => ({ week_start: raw.weeks[i], product: name.get(sr.product_id)?.name ?? sr.product_id, category: name.get(sr.product_id)?.category ?? '', qty_base: q, unit: name.get(sr.product_id)?.base_uom ?? '', days_out_of_stock: sr.out[i], revenue: i >= off ? sr.rev[i - off] : '', cogs: i >= off ? sr.cogs[i - off] : '' }))
        .filter((r) => r.qty_base !== 0 || r.days_out_of_stock > 0)
    })),
    'products_abcxyz.csv': csv(b.products.all.map((p) => ({ product: p.name, code: p.code, category: p.category, abc: p.abc, xyz: p.xyz, cv: p.cv, qty: p.qty, unit: p.uom, revenue: p.revenue, cogs: p.cogs, gross_profit: p.profit, margin_pct: p.marginPct, revenue_share_pct: p.sharePct, orders: p.orders, below_cost_lines: p.belowCostLines, below_cost_loss: p.belowCostLoss, discounts: p.discounts }))),
    'customers_rfm.csv': csv(b.customers.list.map((c) => ({ customer: c.name, type: c.customer_type, phone: c.phone, segment: c.segment, r: c.r, f: c.f, m: c.m, first_purchase: c.first_date, last_purchase: c.last_date, days_since: c.recencyDays, usual_gap_days: c.cadenceDays, overdue_ratio: c.overdueRatio, purchase_days: c.buy_days, revenue: c.revenue, profit: c.profit, revenue_last_90d: c.rev_90, revenue_prev_90d: c.rev_prev_90, trend_pct: c.trendPct, owes: c.open_ar, oldest_unpaid_days: c.arAgeDays, credit_limit: c.credit_limit, over_limit: c.overLimit }))),
    'ar_open.csv': csv(b.customers.list.filter((c) => c.open_ar > 0.009).map((c) => ({ customer: c.name, phone: c.phone, owes: c.open_ar, oldest_unpaid: c.oldest_unpaid, age_days: c.arAgeDays, credit_limit: c.credit_limit, over_limit: c.overLimit }))),
    'inventory_snapshot.csv': csv(b.inventory.reorder.map((r) => ({ product: r.name, code: r.code, category: r.category, unit: r.uom, abc: r.abc, on_hand: r.onHand, investor_qty: r.investorQty, stock_value: r.stockValue, daily_demand: r.dailyDemand, days_of_cover: r.daysOfCover, lead_days: r.leadDays, safety_stock: r.safetyStock, reorder_point: r.reorderPoint, order_up_to: r.orderUpTo, suggest_qty: r.suggestQty, suggest_value: r.suggestValue, stockout_days_90: r.stockoutDays90, lost_sales_90: r.lostSales90, last_sale: r.lastSale, status: r.status }))),
    'forecast_product_4w.csv': csv(b.forecast.products.flatMap((p) => p.weeks.map((w) => ({ product: p.name, category: p.category, unit: p.uom, pattern: p.cls, week_start: w.week, forecast_qty: w.qty, low_80: w.lo, high_80: w.hi })))),
    'forecast_category_3m.csv': csv(b.forecast.categories.flatMap((c) => c.months.map((m) => ({ category: c.category, month: m.month, forecast_revenue: m.revenue, low_80: m.lo, high_80: m.hi, avg_last_3_months: c.last3Avg })))),
    'forecast_total_12m.csv': csv(b.forecast.total12.map((m) => ({ month: m.month, forecast_revenue: m.revenue, low_80: m.lo, high_80: m.hi, expected_gross_profit: m.profit, actual_to_date: m.actualToDate, season_index: m.seasonIndex }))),
    'po_leadtimes.csv': csv(raw.leadTimes.map((r) => ({ po_number: r.po_number, supplier: r.supplier, po_date: r.po_date, expected: r.expected, received: r.actual, lead_days: r.lead_days, late_days: r.late_days, total: r.total }))),
    'weather_daily.csv': csv(raw.weather.map((w) => ({ date: w.day, rain_mm: w.rain_mm, tmax_c: w.tmax, forecast: w.is_forecast }))),
  }
}
