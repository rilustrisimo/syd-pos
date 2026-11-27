// Loans and a 12-month cash projection: expected gross profit (forecast)
// − regular monthly expenses (recorded expenses incl. owner pay, excluding
// loan interest) − scheduled loan repayments (principal + interest).

import type { RawInsights } from './types'
import type { MonthForecast } from './forecast'
import { addDays, monthKey, monthStart } from './dates'
import { LOAN_INTEREST } from './data'

export function debtSummary(raw: RawInsights, forecast: MonthForecast[]) {
  const { loans, schedule } = raw.debts
  const byMonth = new Map(schedule.map((m) => [monthKey(m.month), m]))

  // Regular expenses: average of the last 3 full months, without loan interest (repayments are counted separately).
  const cur = monthStart(raw.today)
  const from = monthStart(addDays(cur, -85))
  const regular = raw.expensesAll.filter((e) => e.category_name !== LOAN_INTEREST && e.ph_date >= from && e.ph_date < cur)
  const months = Math.max(1, new Set(regular.map((e) => monthKey(e.ph_date))).size)
  const monthlyExpenses = regular.reduce((a, e) => a + e.total_amount, 0) / months

  const projection = forecast.map((m) => {
    const debt = byMonth.get(m.month)?.total ?? 0
    const lowGP = m.profit * (m.lo / Math.max(1, m.revenue))
    return {
      month: m.month, revenue: m.revenue, grossProfit: m.profit, expenses: monthlyExpenses, debt,
      cashLeft: m.profit - monthlyExpenses - debt,
      /** Same month if sales come in at the low end of the forecast range. */
      cashLeftLow: lowGP - monthlyExpenses - debt,
    }
  })

  const payoff = loans.reduce<string | null>((a, l) => (l.final_due && (!a || l.final_due > a) ? l.final_due : a), null)
  return {
    loans,
    schedule: schedule.slice(0, 36),
    totals: {
      count: loans.length,
      balance: loans.reduce((a, l) => a + l.outstanding_balance, 0),
      remainingDue: loans.reduce((a, l) => a + l.remaining_due, 0),
      remainingInterest: loans.reduce((a, l) => a + l.remaining_interest, 0),
      monthlyNow: byMonth.get(monthKey(raw.today))?.total ?? loans.reduce((a, l) => a + l.monthly_payment, 0),
      overdue: loans.reduce((a, l) => a + l.overdue_installments, 0),
      debtFreeBy: payoff,
    },
    monthlyExpenses,
    projection,
  }
}
