/**
 * Philippine tax computation utilities for sole proprietors (non-VAT).
 * Based on TRAIN Law (RA 10963) as amended — effective 2023 onwards.
 * Applicable to: SYD Construction Supplies Trading, Talakag, Bukidnon.
 */

// ── Graduated Income Tax Table (TRAIN Law, 2023+) ────────────────────────────

interface TaxBracket {
  min: number
  max: number          // Infinity for top bracket
  base: number         // Fixed amount for the bracket
  rate: number         // Marginal rate on excess over min
}

const GRADUATED_TABLE: TaxBracket[] = [
  { min: 0,          max: 250_000,      base: 0,          rate: 0.00 },
  { min: 250_001,    max: 400_000,      base: 0,          rate: 0.15 },
  { min: 400_001,    max: 800_000,      base: 22_500,     rate: 0.20 },
  { min: 800_001,    max: 2_000_000,    base: 102_500,    rate: 0.25 },
  { min: 2_000_001,  max: 8_000_000,   base: 402_500,    rate: 0.30 },
  { min: 8_000_001,  max: Infinity,    base: 2_202_500,  rate: 0.35 },
]

export function applyGraduatedTable(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0
  const bracket = GRADUATED_TABLE.find(
    b => taxableIncome >= b.min && taxableIncome <= b.max
  )
  if (!bracket) return 0
  return bracket.base + (taxableIncome - bracket.min) * bracket.rate
}

// ── LBT Schedule (LGC maximum rates for retailers) ───────────────────────────

interface LBTBracket {
  min: number
  max: number
  flatAmount?: number  // if flat rate applies
  rate?: number        // if percentage rate applies
}

const LBT_TABLE: LBTBracket[] = [
  { min: 0,          max: 400_000,    flatAmount: 1_008 },
  { min: 400_001,    max: 750_000,    rate: 0.0100 },
  { min: 750_001,    max: 1_000_000,  rate: 0.0090 },
  { min: 1_000_001,  max: 2_000_000,  rate: 0.0080 },
  { min: 2_000_001,  max: 3_000_000,  rate: 0.0070 },
  { min: 3_000_001,  max: 4_000_000,  rate: 0.0060 },
  { min: 4_000_001,  max: Infinity,   rate: 0.0050 },
]

/**
 * Compute Local Business Tax based on prior-year gross receipts.
 * Uses the configured LBT rate (from tax_settings) as a cap — Talakag may
 * set rates lower than the LGC maximums. If configuredRate is provided and
 * lower than the LGC schedule rate, the configuredRate is used instead.
 */
export function applyLBTSchedule(priorYearGross: number, configuredRate?: number): number {
  if (priorYearGross <= 0) return 0
  const bracket = LBT_TABLE.find(b => priorYearGross >= b.min && priorYearGross <= b.max)
  if (!bracket) return 0

  if (bracket.flatAmount !== undefined) return bracket.flatAmount

  const scheduleRate = bracket.rate!
  const effectiveRate = configuredRate !== undefined ? Math.min(configuredRate, scheduleRate) : scheduleRate
  return priorYearGross * effectiveRate
}

// ── Percentage Tax (2551Q) ────────────────────────────────────────────────────

export const PERCENTAGE_TAX_RATE = 0.03

export function computePercentageTax(grossQuarterlyReceipts: number): number {
  return Math.max(0, grossQuarterlyReceipts) * PERCENTAGE_TAX_RATE
}

// ── Regime Comparison ─────────────────────────────────────────────────────────

export interface RegimeResult {
  label: string
  grossSales: number
  deductions: number
  deductionLabel: string
  taxableIncome: number
  incomeTax: number
  percentageTax: number   // 0 for Option A (8% flat)
  totalTax: number
  effectiveRate: number   // totalTax / grossSales
  recommended?: boolean
  note?: string
}

export interface RegimeInput {
  annualGrossSales: number
  annualCOGS: number
  annualExpenses: number       // operating expenses (from expenses table)
  quarterlyGrossSales: [number, number, number, number]  // Q1..Q4
}

export function computeRegimeComparison(data: RegimeInput): {
  optionA: RegimeResult
  optionB: RegimeResult
  optionC: RegimeResult
} {
  const { annualGrossSales, annualCOGS, annualExpenses, quarterlyGrossSales } = data

  const totalPercentageTax = quarterlyGrossSales.reduce(
    (sum, q) => sum + computePercentageTax(q), 0
  )

  // ── Option A: 8% Flat Rate ────────────────────────────────────────────────
  const flatRateExemption = 250_000
  const flatRateTaxableBase = Math.max(0, annualGrossSales - flatRateExemption)
  const flatRateIncomeTax   = flatRateTaxableBase * 0.08
  const optionA: RegimeResult = {
    label:           'Option A — 8% Flat Rate',
    grossSales:      annualGrossSales,
    deductions:      flatRateExemption,
    deductionLabel:  '₱250K exemption',
    taxableIncome:   flatRateTaxableBase,
    incomeTax:       flatRateIncomeTax,
    percentageTax:   0,             // not required under 8% flat
    totalTax:        flatRateIncomeTax,
    effectiveRate:   annualGrossSales > 0 ? flatRateIncomeTax / annualGrossSales : 0,
    note:            annualGrossSales >= 3_000_000
      ? 'Not available — gross sales ≥ ₱3M. Must use graduated rate.'
      : 'No separate Percentage Tax filing required.',
  }

  // ── Option B: Graduated + OSD ─────────────────────────────────────────────
  const osdDeduction    = annualGrossSales * 0.40
  const osdTaxableInc   = Math.max(0, annualGrossSales - osdDeduction)
  const osdIncomeTax    = applyGraduatedTable(osdTaxableInc)
  const optionB: RegimeResult = {
    label:           'Option B — Graduated + OSD',
    grossSales:      annualGrossSales,
    deductions:      osdDeduction,
    deductionLabel:  '40% Optional Standard Deduction',
    taxableIncome:   osdTaxableInc,
    incomeTax:       osdIncomeTax,
    percentageTax:   totalPercentageTax,
    totalTax:        osdIncomeTax + totalPercentageTax,
    effectiveRate:   annualGrossSales > 0 ? (osdIncomeTax + totalPercentageTax) / annualGrossSales : 0,
    note:            'Includes 3% Percentage Tax filed quarterly (2551Q).',
  }

  // ── Option C: Graduated + Itemized ───────────────────────────────────────
  const itemizedDeduction = annualCOGS + annualExpenses
  const itemizedTaxableInc = Math.max(0, annualGrossSales - itemizedDeduction)
  const itemizedIncomeTax  = applyGraduatedTable(itemizedTaxableInc)
  const optionC: RegimeResult = {
    label:           'Option C — Graduated + Itemized',
    grossSales:      annualGrossSales,
    deductions:      itemizedDeduction,
    deductionLabel:  'COGS + Operating Expenses',
    taxableIncome:   itemizedTaxableInc,
    incomeTax:       itemizedIncomeTax,
    percentageTax:   totalPercentageTax,
    totalTax:        itemizedIncomeTax + totalPercentageTax,
    effectiveRate:   annualGrossSales > 0 ? (itemizedIncomeTax + totalPercentageTax) / annualGrossSales : 0,
    note:            'Requires complete records of COGS and all expenses. Includes 3% Percentage Tax (2551Q).',
  }

  // Mark the lowest-total-tax option as recommended
  const totals = [optionA.totalTax, optionB.totalTax, optionC.totalTax]
  const minTax = Math.min(...totals)
  if (optionA.totalTax === minTax && annualGrossSales < 3_000_000) optionA.recommended = true
  else if (optionB.totalTax === minTax) optionB.recommended = true
  else optionC.recommended = true

  return { optionA, optionB, optionC }
}

// ── Deadline generation ────────────────────────────────────────────────────────

export interface TaxDeadline {
  tax_type: string
  label: string
  period_year: number
  period_quarter: number | null
  due_date: string      // YYYY-MM-DD
  days_until_due: number
  is_overdue: boolean
}

/**
 * Generate all BIR + LGU deadlines for a given calendar year.
 * Returns them sorted by due_date ascending.
 */
export function generateDeadlines(year: number, today: Date): TaxDeadline[] {
  const deadlines: Omit<TaxDeadline, 'days_until_due' | 'is_overdue'>[] = [
    // BIR Annual Registration
    { tax_type: '0605',         label: 'BIR Annual Registration',  period_year: year, period_quarter: null, due_date: `${year}-01-31` },
    // Percentage Tax (2551Q)
    { tax_type: '2551q',        label: '% Tax Q4 (prev year)',     period_year: year - 1, period_quarter: 4,  due_date: `${year}-01-25` },
    { tax_type: '2551q',        label: '% Tax Q1',                 period_year: year, period_quarter: 1,  due_date: `${year}-04-25` },
    { tax_type: '2551q',        label: '% Tax Q2',                 period_year: year, period_quarter: 2,  due_date: `${year}-07-25` },
    { tax_type: '2551q',        label: '% Tax Q3',                 period_year: year, period_quarter: 3,  due_date: `${year}-10-25` },
    // Income Tax Quarterly (1701Q)
    { tax_type: '1701q',        label: 'Income Tax Q1',            period_year: year, period_quarter: 1,  due_date: `${year}-05-15` },
    { tax_type: '1701q',        label: 'Income Tax Q2',            period_year: year, period_quarter: 2,  due_date: `${year}-08-15` },
    { tax_type: '1701q',        label: 'Income Tax Q3',            period_year: year, period_quarter: 3,  due_date: `${year}-11-15` },
    // Annual Income Tax (1701A)
    { tax_type: '1701a',        label: 'Annual Income Tax',        period_year: year - 1, period_quarter: null, due_date: `${year}-04-15` },
    // LGU fees
    { tax_type: 'lbt',          label: 'Local Business Tax',       period_year: year, period_quarter: null, due_date: `${year}-01-20` },
    { tax_type: 'mayors_permit',label: "Mayor's Permit",            period_year: year, period_quarter: null, due_date: `${year}-01-20` },
    { tax_type: 'barangay_clearance', label: 'Barangay Clearance', period_year: year, period_quarter: null, due_date: `${year}-01-20` },
  ]

  return deadlines
    .map(d => {
      const due  = new Date(d.due_date)
      const diff = Math.ceil((due.getTime() - today.getTime()) / 86_400_000)
      return { ...d, days_until_due: diff, is_overdue: diff < 0 }
    })
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
}

// ── Quarterly income tax advance (for 1701Q) ───────────────────────────────────

/**
 * Compute the income tax advance payable for a given quarter under the 8% option.
 * The PHP 250K exemption is applied pro-rata (no quarterly deduction actually —
 * the exemption is applied at year-end reconciliation; quarterly filing uses
 * cumulative gross sales × 8% less prior payments).
 */
export function compute8FlatQuarterlyAdvance(
  cumulativeGrossSales: number,
  priorQuarterPayments: number
): number {
  const ytdTax = Math.max(0, cumulativeGrossSales - 250_000) * 0.08
  return Math.max(0, ytdTax - priorQuarterPayments)
}

/**
 * Compute quarterly income tax advance under graduated rate (OSD or Itemized).
 */
export function computeGraduatedQuarterlyAdvance(
  cumulativeTaxableIncome: number,
  priorQuarterPayments: number
): number {
  const ytdTax = applyGraduatedTable(cumulativeTaxableIncome)
  return Math.max(0, ytdTax - priorQuarterPayments)
}
