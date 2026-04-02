import { createClient } from '../client'
import type { TaxSettingsRow, TaxPaymentRow, TaxType } from '@/types/database'

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getTaxSettings(branchId: string): Promise<TaxSettingsRow | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tax_settings')
    .select('*')
    .eq('branch_id', branchId)
    .single()
  if (error) return null
  return data as TaxSettingsRow
}

export async function upsertTaxSettings(
  branchId: string,
  updates: Partial<Omit<TaxSettingsRow, 'id' | 'branch_id' | 'created_at' | 'updated_at'>>
): Promise<TaxSettingsRow> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tax_settings')
    .upsert({ branch_id: branchId, ...updates, updated_at: new Date().toISOString() },
             { onConflict: 'branch_id' })
    .select()
    .single()
  if (error) throw error
  return data as TaxSettingsRow
}

// ── Tax Payments ──────────────────────────────────────────────────────────────

export interface TaxPaymentInput {
  branch_id: string
  tax_type: TaxType
  period_year: number
  period_quarter?: number | null
  amount_due: number
  amount_paid: number
  payment_date: string
  reference_number?: string | null
  notes?: string | null
}

export async function getTaxPayments(branchId: string, year?: number): Promise<TaxPaymentRow[]> {
  const supabase = createClient()
  let query = supabase
    .from('tax_payments')
    .select('*')
    .eq('branch_id', branchId)
    .eq('is_deleted', false)
    .order('payment_date', { ascending: false })

  if (year) query = query.eq('period_year', year)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as TaxPaymentRow[]
}

export async function createTaxPayment(
  input: TaxPaymentInput,
  userId: string
): Promise<TaxPaymentRow> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tax_payments')
    .insert({
      branch_id:        input.branch_id,
      payment_number:   '',   // trigger fills this
      tax_type:         input.tax_type,
      period_year:      input.period_year,
      period_quarter:   input.period_quarter ?? null,
      amount_due:       input.amount_due,
      amount_paid:      input.amount_paid,
      payment_date:     input.payment_date,
      reference_number: input.reference_number ?? null,
      notes:            input.notes ?? null,
      created_by:       userId,
    })
    .select()
    .single()
  if (error) throw error
  return data as TaxPaymentRow
}

export async function deleteTaxPayment(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('tax_payments')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// ── Financial data for tax calculations ───────────────────────────────────────

export interface QuarterlyTaxData {
  grossSales: number
  returns: number
  netGrossSales: number
  cogs: number
  expenses: number
}

function quarterBounds(year: number, quarter: number): { from: string; to: string } {
  const starts = ['01-01', '04-01', '07-01', '10-01']
  const ends   = ['03-31', '06-30', '09-30', '12-31']
  return {
    from: new Date(`${year}-${starts[quarter - 1]}T00:00:00+08:00`).toISOString(),
    to:   new Date(`${year}-${ends[quarter - 1]}T23:59:59+08:00`).toISOString(),
  }
}

export async function getQuarterlyTaxData(
  branchId: string,
  year: number,
  quarter: number
): Promise<QuarterlyTaxData> {
  const supabase = createClient()
  const { from, to } = quarterBounds(year, quarter)

  // Transactions + lines in one query — same approach as getPLReport
  const { data: txnData } = await supabase
    .from('transactions')
    .select(`
      transaction_type,
      delivery_fee,
      other_fees,
      discount_amount,
      subtotal,
      lines:transaction_lines(
        quantity,
        unit_price,
        cogs_per_unit,
        line_total,
        discount_amount
      )
    `)
    .eq('branch_id', branchId)
    .in('transaction_type', ['sale', 'return'])
    .eq('is_deleted', false)
    .gte('transaction_date', from)
    .lte('transaction_date', to)

  let grossSales = 0
  let returnsAmt = 0
  let cogs       = 0

  for (const txn of (txnData as any[]) ?? []) {
    const isReturn   = txn.transaction_type === 'return'
    const sign       = isReturn ? -1 : 1
    const subtotal   = txn.subtotal || 0
    const deliveryFee        = txn.delivery_fee || 0
    const otherFees          = txn.other_fees || 0
    const txnDiscount        = txn.discount_amount || 0

    let txnRevenue = 0
    let txnCogs    = 0

    for (const line of txn.lines || []) {
      const lineTotal   = line.line_total || 0
      const lineRatio   = subtotal > 0 ? lineTotal / subtotal : 0
      txnRevenue += lineTotal
        + deliveryFee  * lineRatio
        + otherFees    * lineRatio
        - txnDiscount  * lineRatio
      txnCogs += (line.quantity || 0) * (line.cogs_per_unit || 0)
    }

    if (isReturn) {
      returnsAmt += txnRevenue
    } else {
      grossSales += txnRevenue
    }
    cogs += sign * txnCogs
  }

  // Operating expenses
  const { data: expenseData } = await supabase
    .from('expenses')
    .select('amount')
    .eq('branch_id', branchId)
    .eq('is_deleted', false)
    .gte('expense_date', from)
    .lte('expense_date', to)

  const expenses = (expenseData ?? []).reduce((s: number, e: any) => s + Number(e.amount), 0)

  return {
    grossSales,
    returns:       returnsAmt,
    netGrossSales: grossSales - returnsAmt,
    cogs,
    expenses,
  }
}

export interface AnnualTaxData {
  grossSales: number
  returns: number
  netGrossSales: number
  cogs: number
  expenses: number
  quarterlyGrossSales: [number, number, number, number]
  priorYearGrossSales: number
}

export async function getAnnualTaxData(branchId: string, year: number): Promise<AnnualTaxData> {
  const [q1, q2, q3, q4, priorQ1, priorQ2, priorQ3, priorQ4] = await Promise.all([
    getQuarterlyTaxData(branchId, year,     1),
    getQuarterlyTaxData(branchId, year,     2),
    getQuarterlyTaxData(branchId, year,     3),
    getQuarterlyTaxData(branchId, year,     4),
    getQuarterlyTaxData(branchId, year - 1, 1),
    getQuarterlyTaxData(branchId, year - 1, 2),
    getQuarterlyTaxData(branchId, year - 1, 3),
    getQuarterlyTaxData(branchId, year - 1, 4),
  ])

  const sum = (arr: QuarterlyTaxData[], key: keyof QuarterlyTaxData) =>
    arr.reduce((s, q) => s + (q[key] as number), 0)

  const quarters = [q1, q2, q3, q4]
  const priorQs  = [priorQ1, priorQ2, priorQ3, priorQ4]

  return {
    grossSales:            sum(quarters, 'grossSales'),
    returns:               sum(quarters, 'returns'),
    netGrossSales:         sum(quarters, 'netGrossSales'),
    cogs:                  sum(quarters, 'cogs'),
    expenses:              sum(quarters, 'expenses'),
    quarterlyGrossSales:   [q1.netGrossSales, q2.netGrossSales, q3.netGrossSales, q4.netGrossSales],
    priorYearGrossSales:   sum(priorQs, 'netGrossSales'),
  }
}
