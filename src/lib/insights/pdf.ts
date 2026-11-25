// Printable business report (jsPDF) from the Insights bundle, with the AI
// brief when one exists for the same period. Runs in the browser.

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { InsightsBundle } from './bundle'
import type { InsightsBrief } from './brief'

// jsPDF's built-in fonts have no ₱ glyph.
const peso = (n: number | null | undefined) => 'P' + Math.round(Number(n ?? 0)).toLocaleString('en-PH')
const p1 = (n: number | null | undefined) => (n == null || !isFinite(n) ? '-' : `${n.toFixed(1)}%`)
const n1 = (n: number | null | undefined) => Number(n ?? 0).toLocaleString('en-PH', { maximumFractionDigits: 1 })
const clean = (s: string) => s.replace(/₱/g, 'P').replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/[^\x20-\x7E\n]/g, '')

export function downloadInsightsPdf(b: InsightsBundle, brief: InsightsBrief | null, storeName = 'SYD Construction Supplies') {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 40
  let y = 48
  const lastY = () => (doc as any).lastAutoTable?.finalY ?? y
  const heading = (t: string) => {
    if (y > 720) { doc.addPage(); y = 48 } else y += 10
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(t, M, y); y += 8
  }
  const para = (t: string, size = 9) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size)
    const lines = doc.splitTextToSize(clean(t), W - 2 * M)
    if (y + lines.length * (size + 3) > 800) { doc.addPage(); y = 48 }
    doc.text(lines, M, y + size); y += lines.length * (size + 3) + 6
  }
  const tbl = (head: string[], body: (string | number)[][]) => {
    autoTable(doc, { startY: y + 4, head: [head], body: body.map((r) => r.map((c) => clean(String(c)))), margin: { left: M, right: M }, styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [37, 99, 235] } })
    y = lastY() + 18
  }

  const c = b.overview.current, g = b.overview.growth, cash = b.overview.cash
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(clean(`${storeName} - Business Report`), M, y); y += 18
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.text(`${b.meta.from} to ${b.meta.to}  (compared with ${b.meta.prevFrom} to ${b.meta.prevTo})`, M, y); y += 22

  if (brief) {
    heading('Summary')
    para(brief.headline, 10)
    para(brief.summary)
    if (brief.actions.length) { heading('Actions'); tbl(['Priority', 'Action', 'Why'], brief.actions.map((a) => [a.priority, a.action, a.why])) }
  }

  heading('Key figures')
  tbl(['Metric', 'This period', 'Change vs previous'], [
    ['Revenue', peso(c.revenue), p1(g.revenue)], ['Gross profit', peso(c.grossProfit), p1(g.grossProfit)], ['Gross margin', p1(c.marginPct), ''],
    ['Expenses', peso(c.expenses), ''], ['Net profit', peso(c.netProfit), p1(g.netProfit)], ['Sales', n1(c.sales), p1(g.sales)],
    ['Average ticket', peso(c.avgTicket), p1(g.avgTicket)], ['New customers', n1(c.newCustomers), p1(g.newCustomers)],
    ['Receivables (utang)', peso(cash.arOpen), `~${Math.round(cash.dso)} days to collect`], ['Stock value (cost)', peso(cash.inventoryValue), `${cash.turns.toFixed(1)} turns/yr, GMROI ${cash.gmroi.toFixed(2)}`],
    ['Owed to suppliers', peso(cash.apOpen), `${peso(cash.apDue30)} due in 30 days`], ['Cash cycle', `${Math.round(cash.ccc)} days`, ''],
  ])

  heading('Monthly P&L')
  tbl(['Month', 'Revenue', 'Gross profit', 'Margin', 'Expenses', 'Net', 'Sales'], b.sales.months.map((m) => [m.month + (m.partial ? '*' : ''), peso(m.revenue), peso(m.grossProfit), p1(m.marginPct), peso(m.expenses), peso(m.netProfit), m.sales]))

  heading('Top products')
  tbl(['Product', 'Class', 'Qty', 'Revenue', 'Margin'], b.products.top.slice(0, 15).map((p) => [p.name, `${p.abc ?? ''}${p.xyz ?? ''}`, `${n1(p.qty)} ${p.uom}`, peso(p.revenue), p1(p.marginPct)]))
  heading('Top customers')
  tbl(['Customer', 'Segment', 'Revenue', 'Owes'], b.customers.top.slice(0, 12).map((x) => [x.name, x.segment, peso(x.revenue), peso(x.open_ar)]))
  if (b.products.leaks.length) { heading('Margin leaks'); tbl(['Product', 'Issue', 'Detail', 'At stake'], b.products.leaks.slice(0, 12).map((l) => [l.name, l.kind.replace(/_/g, ' '), l.detail, peso(l.impact)])) }

  heading('Inventory health')
  para(`Estimated sales lost to stockouts (90 days): ${peso(b.inventory.lostSales90)}. Dead stock (90+ days unsold): ${peso(b.inventory.dead.buckets[1].value)} in ${b.inventory.dead.buckets[1].items} items.`)
  const orderNow = b.inventory.reorder.filter((r) => r.status === 'order_now').sort((a, x) => x.suggestValue - a.suggestValue).slice(0, 15)
  if (orderNow.length) tbl(['Order now', 'On hand', 'Suggested', 'Value'], orderNow.map((r) => [r.name, `${n1(r.onHand)} ${r.uom}`, n1(r.suggestQty), peso(r.suggestValue)]))

  heading('Forecast')
  tbl(['Month', 'Forecast revenue', 'Likely range (80%)', 'Expected gross profit'], b.forecast.total12.slice(0, 6).map((m) => [m.month, peso(m.revenue), `${peso(m.lo)} - ${peso(m.hi)}`, peso(m.profit)]))
  if (brief?.outlook) para(brief.outlook)

  doc.save(`SYD_report_${b.meta.from}_to_${b.meta.to}.pdf`)
}
