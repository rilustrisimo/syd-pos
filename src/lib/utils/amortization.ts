/**
 * Amortization calculator using the standard reducing-balance (equal payment) method.
 *
 * Formula: PMT = P × [i(1+i)^n] / [(1+i)^n - 1]
 *   P = principal
 *   i = monthly interest rate (as decimal, e.g. 0.42% → 0.0042)
 *   n = number of monthly installments
 */

export interface AmortizationScheduleRow {
  installment_number: number
  due_date: string          // ISO date string
  balance_before: number
  principal_portion: number
  interest_portion: number
  scheduled_amount: number  // principal + interest (may differ slightly for last installment due to rounding)
  balance_after: number
}

export interface AmortizationResult {
  monthly_payment: number
  total_interest: number
  total_payable: number
  schedule: AmortizationScheduleRow[]
}

/**
 * @param principal     Loan amount in pesos
 * @param monthlyRate   Monthly interest rate as a percentage (e.g. 0.42 for 0.42%)
 * @param termMonths    Number of monthly payments
 * @param startDate     Loan start date — first payment is due one month after this
 */
export function calculateAmortization(
  principal: number,
  monthlyRate: number,
  termMonths: number,
  startDate: Date = new Date()
): AmortizationResult {
  const i = monthlyRate / 100  // convert percent to decimal

  let monthlyPayment: number

  if (i === 0) {
    // Zero-interest loan — straight-line division
    monthlyPayment = principal / termMonths
  } else {
    // Standard amortization formula
    const factor = Math.pow(1 + i, termMonths)
    monthlyPayment = (principal * i * factor) / (factor - 1)
  }

  const schedule: AmortizationScheduleRow[] = []
  let balance = principal

  for (let month = 1; month <= termMonths; month++) {
    const dueDate = new Date(startDate)
    dueDate.setMonth(dueDate.getMonth() + month)

    const interestPortion = balance * i
    let principalPortion = monthlyPayment - interestPortion

    // Last installment: adjust for floating-point rounding so balance ends at exactly 0
    if (month === termMonths) {
      principalPortion = balance
    }

    const balanceBefore = balance
    const balanceAfter = Math.max(0, balance - principalPortion)
    const scheduledAmount = principalPortion + interestPortion

    schedule.push({
      installment_number: month,
      due_date: dueDate.toISOString().split('T')[0],
      balance_before: round2(balanceBefore),
      principal_portion: round2(principalPortion),
      interest_portion: round2(interestPortion),
      scheduled_amount: round2(scheduledAmount),
      balance_after: round2(balanceAfter),
    })

    balance = balanceAfter
  }

  const totalPayable = schedule.reduce((sum, row) => sum + row.scheduled_amount, 0)
  const totalInterest = totalPayable - principal

  return {
    monthly_payment: round2(monthlyPayment),
    total_interest: round2(totalInterest),
    total_payable: round2(totalPayable),
    schedule,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
