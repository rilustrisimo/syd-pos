/**
 * Loan amortization calculator supporting three interest methods.
 *
 * flat_rate    — Add-on / straight-line. Interest is always P × i (original principal).
 *                Principal divided equally across months.
 *                Common in Philippine business/personal loans.
 *
 * diminishing  — Reducing balance. Interest computed on remaining balance each month.
 *                Equal monthly payment via PMT formula.
 *                Common in mortgages and bank term loans.
 *
 * interest_only — Pay only interest (P × i) each month.
 *                 Full principal returned as a balloon payment in the last installment.
 *                 Common in short-term bridge financing.
 */

export type RateType = 'flat_rate' | 'diminishing' | 'interest_only'

export const RATE_TYPE_LABELS: Record<RateType, string> = {
  flat_rate: 'Flat Rate (Add-on)',
  diminishing: 'Diminishing Balance',
  interest_only: 'Interest Only (Balloon)',
}

export const RATE_TYPE_DESCRIPTIONS: Record<RateType, string> = {
  flat_rate: 'Interest is computed on the original principal every month. Principal divided equally.',
  diminishing: 'Interest is computed on the remaining balance each month (standard amortization).',
  interest_only: 'Pay only interest monthly. Full principal due on the last installment.',
}

export interface AmortizationScheduleRow {
  installment_number: number
  due_date: string          // ISO date string (YYYY-MM-DD)
  balance_before: number
  principal_portion: number
  interest_portion: number
  scheduled_amount: number
  balance_after: number
}

export interface AmortizationResult {
  monthly_payment: number   // typical monthly payment (may differ for last installment)
  total_interest: number
  total_payable: number
  schedule: AmortizationScheduleRow[]
}

/**
 * @param principal     Loan amount in pesos
 * @param monthlyRate   Monthly interest rate as a percentage (e.g. 0.42 for 0.42%)
 * @param termMonths    Number of monthly installments
 * @param startDate     Loan start date — first payment due one month later
 * @param rateType      Calculation method (default: 'flat_rate')
 */
export function calculateAmortization(
  principal: number,
  monthlyRate: number,
  termMonths: number,
  startDate: Date = new Date(),
  rateType: RateType = 'flat_rate'
): AmortizationResult {
  // Guard against invalid dates (e.g. while user is mid-typing)
  const validStart = isNaN(startDate.getTime()) ? new Date() : startDate
  const i = monthlyRate / 100  // percent → decimal

  if (rateType === 'flat_rate') {
    return calcFlatRate(principal, i, termMonths, validStart)
  }
  if (rateType === 'diminishing') {
    return calcDiminishing(principal, i, termMonths, validStart)
  }
  return calcInterestOnly(principal, i, termMonths, validStart)
}

// ─── Flat Rate (Add-on) ────────────────────────────────────────────────────

function calcFlatRate(principal: number, i: number, n: number, startDate: Date): AmortizationResult {
  const monthlyPrincipal = principal / n
  const monthlyInterest = principal * i   // same every month
  const monthlyPayment = monthlyPrincipal + monthlyInterest

  const schedule: AmortizationScheduleRow[] = []
  let balance = principal

  for (let month = 1; month <= n; month++) {
    const balanceBefore = balance
    // Last installment absorbs any floating-point remainder
    const principalPortion = month === n ? round2(balance) : round2(monthlyPrincipal)
    const interestPortion = round2(monthlyInterest)
    const balanceAfter = round2(Math.max(0, balanceBefore - principalPortion))

    schedule.push({
      installment_number: month,
      due_date: addMonths(startDate, month),
      balance_before: round2(balanceBefore),
      principal_portion: principalPortion,
      interest_portion: interestPortion,
      scheduled_amount: round2(principalPortion + interestPortion),
      balance_after: balanceAfter,
    })

    balance = balanceAfter
  }

  const totalInterest = round2(monthlyInterest * n)
  return {
    monthly_payment: round2(monthlyPayment),
    total_interest: totalInterest,
    total_payable: round2(principal + totalInterest),
    schedule,
  }
}

// ─── Diminishing Balance (Reducing Balance) ────────────────────────────────

function calcDiminishing(principal: number, i: number, n: number, startDate: Date): AmortizationResult {
  let monthlyPayment: number

  if (i === 0) {
    monthlyPayment = principal / n
  } else {
    const factor = Math.pow(1 + i, n)
    monthlyPayment = (principal * i * factor) / (factor - 1)
  }

  const schedule: AmortizationScheduleRow[] = []
  let balance = principal

  for (let month = 1; month <= n; month++) {
    const balanceBefore = balance
    const interestPortion = round2(balance * i)
    // Last installment: consume exact remaining balance
    const principalPortion = month === n ? round2(balance) : round2(monthlyPayment - interestPortion)
    const balanceAfter = round2(Math.max(0, balanceBefore - principalPortion))

    schedule.push({
      installment_number: month,
      due_date: addMonths(startDate, month),
      balance_before: round2(balanceBefore),
      principal_portion: principalPortion,
      interest_portion: interestPortion,
      scheduled_amount: round2(principalPortion + interestPortion),
      balance_after: balanceAfter,
    })

    balance = balanceAfter
  }

  const totalPayable = schedule.reduce((sum, r) => sum + r.scheduled_amount, 0)
  return {
    monthly_payment: round2(monthlyPayment),
    total_interest: round2(totalPayable - principal),
    total_payable: round2(totalPayable),
    schedule,
  }
}

// ─── Interest Only (Balloon) ───────────────────────────────────────────────

function calcInterestOnly(principal: number, i: number, n: number, startDate: Date): AmortizationResult {
  const monthlyInterest = round2(principal * i)

  const schedule: AmortizationScheduleRow[] = []

  for (let month = 1; month <= n; month++) {
    const isLast = month === n
    const principalPortion = isLast ? principal : 0
    const scheduledAmount = round2(principalPortion + monthlyInterest)

    schedule.push({
      installment_number: month,
      due_date: addMonths(startDate, month),
      balance_before: principal,
      principal_portion: principalPortion,
      interest_portion: monthlyInterest,
      scheduled_amount: scheduledAmount,
      balance_after: isLast ? 0 : principal,
    })
  }

  const totalInterest = round2(monthlyInterest * n)
  return {
    monthly_payment: round2(monthlyInterest),  // regular monthly payment (interest only)
    total_interest: totalInterest,
    total_payable: round2(principal + totalInterest),
    schedule,
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function addMonths(date: Date, months: number): string {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
