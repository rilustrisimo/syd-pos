import { createClient } from '@/lib/supabase/client'
import type {
  LiabilityPayableRow,
  LiabilityPayablePOLinkRow,
  LiabilityPayablePaymentRow,
  LiabilityLoanRow,
  LiabilityLoanScheduleRow,
  LiabilityLoanPaymentRow,
  LiabilityPayableStatus,
  LoanStatus,
  InstallmentStatus,
  PaymentMethod,
} from '@/types/database'

// ── Rich types (with joined relations) ───────────────────────────────────────

export interface LiabilityPayable extends LiabilityPayableRow {
  supplier: { id: string; name: string; contact_person: string | null; phone: string | null } | null
  po_links: (LiabilityPayablePOLinkRow & {
    purchase_order: { id: string; po_number: string; total_amount: number; status: string } | null
  })[]
  payments: (LiabilityPayablePaymentRow & {
    created_user: { id: string; full_name: string | null } | null
  })[]
  balance: number   // computed: total_amount - paid_amount
  days_until_due: number  // computed: negative = overdue
}

export interface LiabilityLoan extends LiabilityLoanRow {
  branch: { id: string; name: string } | null
  schedule: LiabilityLoanScheduleRow[]
  payments: (LiabilityLoanPaymentRow & {
    created_user: { id: string; full_name: string | null } | null
  })[]
  next_due_installment: LiabilityLoanScheduleRow | null
  paid_installments_count: number
}

export interface PayableFilters {
  supplier_id?: string
  status?: LiabilityPayableStatus
  date_from?: string
  date_to?: string
  search?: string
  page?: number
  limit?: number
}

export interface LoanFilters {
  status?: LoanStatus
  search?: string
  page?: number
  limit?: number
}

// ── Select clauses ────────────────────────────────────────────────────────────

const PAYABLE_SELECT = `
  *,
  supplier:suppliers(id, name, contact_person, phone),
  po_links:liability_payable_po_links(
    *,
    purchase_order:purchase_orders(id, po_number, total_amount, status)
  ),
  payments:liability_payable_payments(
    *,
    created_user:users(id, full_name)
  )
`

const LOAN_SELECT = `
  *,
  branch:branches(id, name),
  schedule:liability_loan_schedule(*),
  payments:liability_loan_payments(
    *,
    created_user:users(id, full_name)
  )
`

// ── Helpers ───────────────────────────────────────────────────────────────────

function enrichPayable(raw: LiabilityPayableRow & Record<string, unknown>): LiabilityPayable {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(raw.due_date as string)
  const diffMs = due.getTime() - today.getTime()
  const daysUntilDue = Math.round(diffMs / (1000 * 60 * 60 * 24))

  return {
    ...raw,
    balance: (raw.total_amount as number) - (raw.paid_amount as number),
    days_until_due: daysUntilDue,
    supplier: (raw.supplier as LiabilityPayable['supplier']) ?? null,
    po_links: (raw.po_links as LiabilityPayable['po_links']) ?? [],
    payments: (raw.payments as LiabilityPayable['payments']) ?? [],
  } as LiabilityPayable
}

function enrichLoan(raw: LiabilityLoanRow & Record<string, unknown>): LiabilityLoan {
  const schedule = ((raw.schedule as LiabilityLoanScheduleRow[]) ?? []).sort(
    (a, b) => a.installment_number - b.installment_number
  )
  const nextDue = schedule.find(s => s.status !== 'paid') ?? null
  const paidCount = schedule.filter(s => s.status === 'paid').length

  return {
    ...raw,
    branch: (raw.branch as LiabilityLoan['branch']) ?? null,
    schedule,
    payments: (raw.payments as LiabilityLoan['payments']) ?? [],
    next_due_installment: nextDue,
    paid_installments_count: paidCount,
  } as LiabilityLoan
}

// ── Payable queries ───────────────────────────────────────────────────────────

export async function getLiabilityPayables(filters: PayableFilters = {}) {
  const { page = 1, limit = 20, ...rest } = filters
  const offset = (page - 1) * limit
  const supabase = createClient()

  let query = supabase
    .from('liability_payables')
    .select(PAYABLE_SELECT, { count: 'exact' })
    .eq('is_deleted', false)

  if (rest.supplier_id) query = query.eq('supplier_id', rest.supplier_id)
  if (rest.status) query = query.eq('status', rest.status)
  if (rest.date_from) query = query.gte('invoice_date', rest.date_from)
  if (rest.date_to) query = query.lte('invoice_date', rest.date_to)
  if (rest.search) {
    query = query.or(
      `payable_number.ilike.%${rest.search}%,description.ilike.%${rest.search}%,invoice_reference.ilike.%${rest.search}%`
    )
  }

  const { data, error, count } = await query
    .order('due_date', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(`Failed to fetch payables: ${error.message}`)

  return {
    data: (data || []).map(enrichPayable),
    total: count || 0,
    page,
    limit,
  }
}

export async function getLiabilityPayableById(id: string): Promise<LiabilityPayable> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('liability_payables')
    .select(PAYABLE_SELECT)
    .eq('id', id)
    .single()

  if (error) throw new Error(`Failed to fetch payable: ${error.message}`)
  return enrichPayable(data as LiabilityPayableRow & Record<string, unknown>)
}

export interface CreatePayableInput {
  branch_id: string
  supplier_id: string
  description?: string | null
  invoice_reference?: string | null
  total_amount: number
  invoice_date: string
  credit_days: number
  due_date: string
  notes?: string | null
  po_ids?: { po_id: string; amount?: number; notes?: string }[]
  created_by: string
}

export async function createLiabilityPayable(input: CreatePayableInput): Promise<LiabilityPayable> {
  const supabase = createClient()

  // Generate payable number
  const { data: payableNumber, error: numError } = await supabase.rpc('generate_payable_number')
  if (numError) throw new Error(`Failed to generate payable number: ${numError.message}`)

  // Insert payable
  const { data: payable, error } = await supabase
    .from('liability_payables')
    .insert({
      payable_number: payableNumber as string,
      branch_id: input.branch_id,
      supplier_id: input.supplier_id,
      description: input.description ?? null,
      invoice_reference: input.invoice_reference ?? null,
      total_amount: input.total_amount,
      invoice_date: input.invoice_date,
      credit_days: input.credit_days,
      due_date: input.due_date,
      notes: input.notes ?? null,
      created_by: input.created_by,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create payable: ${error.message}`)

  // Link POs
  if (input.po_ids && input.po_ids.length > 0) {
    const links = input.po_ids.map(p => ({
      payable_id: (payable as { id: string }).id,
      po_id: p.po_id,
      amount: p.amount ?? null,
      notes: p.notes ?? null,
    }))
    const { error: linkError } = await supabase.from('liability_payable_po_links').insert(links)
    if (linkError) throw new Error(`Failed to link POs: ${linkError.message}`)
  }

  return getLiabilityPayableById((payable as { id: string }).id)
}

export interface RecordPayablePaymentInput {
  payable_id: string
  amount: number
  payment_date: string
  payment_method: PaymentMethod
  reference_number?: string | null
  notes?: string | null
  created_by: string
}

export async function recordPayablePayment(input: RecordPayablePaymentInput): Promise<void> {
  const supabase = createClient()

  // Validate: can't overpay
  const { data: payable, error: fetchError } = await supabase
    .from('liability_payables')
    .select('total_amount, paid_amount')
    .eq('id', input.payable_id)
    .single()

  if (fetchError) throw new Error(`Failed to fetch payable: ${fetchError.message}`)
  const balance = (payable.total_amount as number) - (payable.paid_amount as number)
  if (input.amount > balance + 0.01) {
    throw new Error(`Payment of ₱${input.amount.toFixed(2)} exceeds remaining balance of ₱${balance.toFixed(2)}`)
  }

  const { error } = await supabase.from('liability_payable_payments').insert({
    payable_id: input.payable_id,
    amount: input.amount,
    payment_date: input.payment_date,
    payment_method: input.payment_method,
    reference_number: input.reference_number ?? null,
    notes: input.notes ?? null,
    created_by: input.created_by,
  })

  if (error) throw new Error(`Failed to record payment: ${error.message}`)
}

export async function softDeletePayable(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('liability_payables')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`Failed to delete payable: ${error.message}`)
}

// ── Loan queries ──────────────────────────────────────────────────────────────

export async function getLiabilityLoans(filters: LoanFilters = {}) {
  const { page = 1, limit = 20, ...rest } = filters
  const offset = (page - 1) * limit
  const supabase = createClient()

  let query = supabase
    .from('liability_loans')
    .select(LOAN_SELECT, { count: 'exact' })
    .eq('is_deleted', false)

  if (rest.status) query = query.eq('status', rest.status)
  if (rest.search) {
    query = query.or(
      `loan_number.ilike.%${rest.search}%,lender_name.ilike.%${rest.search}%,loan_reference.ilike.%${rest.search}%`
    )
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(`Failed to fetch loans: ${error.message}`)

  return {
    data: (data || []).map(enrichLoan),
    total: count || 0,
    page,
    limit,
  }
}

export async function getLiabilityLoanById(id: string): Promise<LiabilityLoan> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('liability_loans')
    .select(LOAN_SELECT)
    .eq('id', id)
    .single()

  if (error) throw new Error(`Failed to fetch loan: ${error.message}`)
  return enrichLoan(data as LiabilityLoanRow & Record<string, unknown>)
}

export interface CreateLoanInput {
  branch_id: string
  lender_name: string
  principal_amount: number
  interest_rate_monthly: number
  rate_type: 'flat_rate' | 'diminishing' | 'interest_only'
  term_months: number
  start_date: string
  monthly_payment: number
  total_interest: number
  total_payable: number
  notes?: string | null
  loan_reference?: string | null
  created_by: string
  schedule: {
    installment_number: number
    due_date: string
    principal_portion: number
    interest_portion: number
    scheduled_amount: number
    balance_before: number
    balance_after: number
  }[]
}

export async function createLiabilityLoan(input: CreateLoanInput): Promise<LiabilityLoan> {
  const supabase = createClient()

  const { data: loanNumber, error: numError } = await supabase.rpc('generate_loan_number')
  if (numError) throw new Error(`Failed to generate loan number: ${numError.message}`)

  const { data: loan, error } = await supabase
    .from('liability_loans')
    .insert({
      loan_number: loanNumber as string,
      branch_id: input.branch_id,
      lender_name: input.lender_name,
      principal_amount: input.principal_amount,
      interest_rate_monthly: input.interest_rate_monthly,
      rate_type: input.rate_type,
      term_months: input.term_months,
      start_date: input.start_date,
      monthly_payment: input.monthly_payment,
      total_interest: input.total_interest,
      total_payable: input.total_payable,
      outstanding_balance: input.principal_amount,
      notes: input.notes ?? null,
      loan_reference: input.loan_reference ?? null,
      created_by: input.created_by,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create loan: ${error.message}`)

  const loanId = (loan as { id: string }).id

  // Insert amortization schedule rows
  const scheduleRows = input.schedule.map(row => ({
    loan_id: loanId,
    installment_number: row.installment_number,
    due_date: row.due_date,
    principal_portion: row.principal_portion,
    interest_portion: row.interest_portion,
    scheduled_amount: row.scheduled_amount,
    balance_before: row.balance_before,
    balance_after: row.balance_after,
  }))

  const { error: scheduleError } = await supabase
    .from('liability_loan_schedule')
    .insert(scheduleRows)
  if (scheduleError) throw new Error(`Failed to create amortization schedule: ${scheduleError.message}`)

  return getLiabilityLoanById(loanId)
}

export interface RecordLoanPaymentInput {
  loan_id: string
  schedule_id: string
  amount: number
  payment_date: string
  payment_method: PaymentMethod
  reference_number?: string | null
  notes?: string | null
  created_by: string
}

export async function recordLoanPayment(input: RecordLoanPaymentInput): Promise<void> {
  const supabase = createClient()

  // Validate: can't overpay this installment
  const { data: installment, error: fetchError } = await supabase
    .from('liability_loan_schedule')
    .select('scheduled_amount, paid_amount')
    .eq('id', input.schedule_id)
    .single()

  if (fetchError) throw new Error(`Failed to fetch installment: ${fetchError.message}`)
  const remaining = (installment.scheduled_amount as number) - (installment.paid_amount as number)
  if (input.amount > remaining + 0.01) {
    throw new Error(`Payment of ₱${input.amount.toFixed(2)} exceeds remaining balance of ₱${remaining.toFixed(2)} for this installment`)
  }

  const { error } = await supabase.from('liability_loan_payments').insert({
    loan_id: input.loan_id,
    schedule_id: input.schedule_id,
    amount: input.amount,
    payment_date: input.payment_date,
    payment_method: input.payment_method,
    reference_number: input.reference_number ?? null,
    notes: input.notes ?? null,
    created_by: input.created_by,
  })

  if (error) throw new Error(`Failed to record loan payment: ${error.message}`)
}

export async function softDeleteLoan(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('liability_loans')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`Failed to delete loan: ${error.message}`)
}

// ── AP Aging ──────────────────────────────────────────────────────────────────

export interface APAgingSupplier {
  supplier_id: string
  supplier_name: string
  total_outstanding: number
  current: number       // not yet due
  days_1_30: number
  days_31_60: number
  days_61_90: number
  days_91_plus: number
  payable_count: number
  payables: LiabilityPayable[]
}

export async function getAPAgingData(): Promise<APAgingSupplier[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('liability_payables')
    .select(PAYABLE_SELECT)
    .eq('is_deleted', false)
    .in('status', ['unpaid', 'partial', 'overdue'])
    .order('due_date', { ascending: true })

  if (error) throw new Error(`Failed to fetch AP aging data: ${error.message}`)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Group by supplier
  const supplierMap = new Map<string, APAgingSupplier>()

  for (const raw of data || []) {
    const payable = enrichPayable(raw as LiabilityPayableRow & Record<string, unknown>)
    const supplierId = payable.supplier_id
    const supplierName = payable.supplier?.name ?? 'Unknown Supplier'
    const balance = payable.balance
    const daysOverdue = -payable.days_until_due  // positive = days overdue

    if (!supplierMap.has(supplierId)) {
      supplierMap.set(supplierId, {
        supplier_id: supplierId,
        supplier_name: supplierName,
        total_outstanding: 0,
        current: 0,
        days_1_30: 0,
        days_31_60: 0,
        days_61_90: 0,
        days_91_plus: 0,
        payable_count: 0,
        payables: [],
      })
    }

    const entry = supplierMap.get(supplierId)!
    entry.total_outstanding += balance
    entry.payable_count++
    entry.payables.push(payable)

    if (daysOverdue <= 0) {
      entry.current += balance
    } else if (daysOverdue <= 30) {
      entry.days_1_30 += balance
    } else if (daysOverdue <= 60) {
      entry.days_31_60 += balance
    } else if (daysOverdue <= 90) {
      entry.days_61_90 += balance
    } else {
      entry.days_91_plus += balance
    }
  }

  return Array.from(supplierMap.values()).sort((a, b) => b.total_outstanding - a.total_outstanding)
}

// ── Upcoming Payments (dashboard widget) ──────────────────────────────────────

export interface UpcomingPaymentItem {
  id: string
  type: 'payable' | 'loan_installment'
  reference: string       // payable_number or loan_number + installment #
  description: string
  amount_due: number
  due_date: string
  days_until_due: number  // negative = overdue
  status: string
}

export async function getUpcomingPayments(days: number = 30): Promise<UpcomingPaymentItem[]> {
  const supabase = createClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const futureDate = new Date(today)
  futureDate.setDate(futureDate.getDate() + days)

  const todayStr = today.toISOString().split('T')[0]
  const futureDateStr = futureDate.toISOString().split('T')[0]

  const [payablesRes, schedulesRes] = await Promise.all([
    supabase
      .from('liability_payables')
      .select('id, payable_number, description, total_amount, paid_amount, due_date, status, supplier:suppliers(name)')
      .eq('is_deleted', false)
      .in('status', ['unpaid', 'partial', 'overdue'])
      .lte('due_date', futureDateStr)
      .order('due_date', { ascending: true }),

    supabase
      .from('liability_loan_schedule')
      .select('id, loan_id, installment_number, scheduled_amount, paid_amount, due_date, status, loan:liability_loans(loan_number, lender_name, is_deleted)')
      .in('status', ['upcoming', 'partial', 'overdue'])
      .lte('due_date', futureDateStr)
      .order('due_date', { ascending: true }),
  ])

  if (payablesRes.error) throw new Error(payablesRes.error.message)
  if (schedulesRes.error) throw new Error(schedulesRes.error.message)

  const todayMs = today.getTime()

  const payableItems: UpcomingPaymentItem[] = (payablesRes.data || []).map(p => {
    const dueMs = new Date(p.due_date).getTime()
    return {
      id: p.id,
      type: 'payable',
      reference: p.payable_number,
      description: `${(p.supplier as unknown as { name: string } | null)?.name ?? 'Supplier'} — ${p.description || 'Trade payable'}`,
      amount_due: (p.total_amount as number) - (p.paid_amount as number),
      due_date: p.due_date,
      days_until_due: Math.round((dueMs - todayMs) / (1000 * 60 * 60 * 24)),
      status: p.status,
    }
  })

  const loanItems: UpcomingPaymentItem[] = (schedulesRes.data || [])
    .filter(s => {
      const loan = s.loan as unknown as { is_deleted: boolean } | null
      return loan && !loan.is_deleted
    })
    .map(s => {
      const loan = s.loan as unknown as { loan_number: string; lender_name: string } | null
      const dueMs = new Date(s.due_date).getTime()
      return {
        id: s.id,
        type: 'loan_installment',
        reference: `${loan?.loan_number ?? 'LOAN'} #${s.installment_number}`,
        description: `${loan?.lender_name ?? 'Lender'} — Installment ${s.installment_number}`,
        amount_due: (s.scheduled_amount as number) - (s.paid_amount as number),
        due_date: s.due_date,
        days_until_due: Math.round((dueMs - todayMs) / (1000 * 60 * 60 * 24)),
        status: s.status,
      }
    })

  return [...payableItems, ...loanItems].sort(
    (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
  )
}

// ── Cash Flow Projection ──────────────────────────────────────────────────────

export interface CashFlowMonth {
  year: number
  month: number
  month_label: string
  total_outflow: number
  payables_total: number
  loans_total: number
  items: UpcomingPaymentItem[]
}

export async function getCashFlowProjection(months: number = 6): Promise<CashFlowMonth[]> {
  const supabase = createClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const futureDate = new Date(today)
  futureDate.setMonth(futureDate.getMonth() + months)

  const todayStr = today.toISOString().split('T')[0]
  const futureDateStr = futureDate.toISOString().split('T')[0]

  const [payablesRes, schedulesRes] = await Promise.all([
    supabase
      .from('liability_payables')
      .select('id, payable_number, description, total_amount, paid_amount, due_date, status, supplier:suppliers(name)')
      .eq('is_deleted', false)
      .in('status', ['unpaid', 'partial', 'overdue'])
      .lte('due_date', futureDateStr)
      .order('due_date'),

    supabase
      .from('liability_loan_schedule')
      .select('id, loan_id, installment_number, scheduled_amount, paid_amount, due_date, status, loan:liability_loans(loan_number, lender_name, is_deleted)')
      .in('status', ['upcoming', 'partial', 'overdue'])
      .lte('due_date', futureDateStr)
      .order('due_date'),
  ])

  if (payablesRes.error) throw new Error(payablesRes.error.message)
  if (schedulesRes.error) throw new Error(schedulesRes.error.message)

  const todayMs = today.getTime()

  const allItems: UpcomingPaymentItem[] = [
    ...(payablesRes.data || []).map(p => ({
      id: p.id,
      type: 'payable' as const,
      reference: p.payable_number,
      description: `${(p.supplier as unknown as { name: string } | null)?.name ?? 'Supplier'} — ${p.description || 'Trade payable'}`,
      amount_due: (p.total_amount as number) - (p.paid_amount as number),
      due_date: p.due_date,
      days_until_due: Math.round((new Date(p.due_date).getTime() - todayMs) / (1000 * 60 * 60 * 24)),
      status: p.status,
    })),
    ...(schedulesRes.data || [])
      .filter(s => {
        const loan = s.loan as unknown as { is_deleted: boolean } | null
        return loan && !loan.is_deleted
      })
      .map(s => {
        const loan = s.loan as unknown as { loan_number: string; lender_name: string } | null
        return {
          id: s.id,
          type: 'loan_installment' as const,
          reference: `${loan?.loan_number ?? 'LOAN'} #${s.installment_number}`,
          description: `${loan?.lender_name ?? 'Lender'} — Installment ${s.installment_number}`,
          amount_due: (s.scheduled_amount as number) - (s.paid_amount as number),
          due_date: s.due_date,
          days_until_due: Math.round((new Date(s.due_date).getTime() - todayMs) / (1000 * 60 * 60 * 24)),
          status: s.status,
        }
      }),
  ]

  // Build monthly buckets
  const monthMap = new Map<string, CashFlowMonth>()

  for (let m = -1; m < months; m++) {
    const d = new Date(today.getFullYear(), today.getMonth() + m, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthMap.set(key, {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      month_label: d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }),
      total_outflow: 0,
      payables_total: 0,
      loans_total: 0,
      items: [],
    })
  }

  for (const item of allItems) {
    const d = new Date(item.due_date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!monthMap.has(key)) continue

    const bucket = monthMap.get(key)!
    bucket.items.push(item)
    bucket.total_outflow += item.amount_due
    if (item.type === 'payable') {
      bucket.payables_total += item.amount_due
    } else {
      bucket.loans_total += item.amount_due
    }
  }

  return Array.from(monthMap.values()).sort(
    (a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month
  )
}

// ── Summary stats (for overview page) ────────────────────────────────────────

export interface LiabilitySummary {
  total_payables_outstanding: number
  payables_overdue: number
  payables_overdue_count: number
  total_loan_obligations: number
  active_loans_count: number
  upcoming_7_days_total: number
  upcoming_7_days_count: number
}

export async function getLiabilitySummary(): Promise<LiabilitySummary> {
  const supabase = createClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in7Days = new Date(today)
  in7Days.setDate(in7Days.getDate() + 7)

  const [payablesRes, loansRes] = await Promise.all([
    supabase
      .from('liability_payables')
      .select('total_amount, paid_amount, status, due_date')
      .eq('is_deleted', false)
      .in('status', ['unpaid', 'partial', 'overdue']),

    supabase
      .from('liability_loans')
      .select('outstanding_balance, status')
      .eq('is_deleted', false)
      .eq('status', 'active'),
  ])

  if (payablesRes.error) throw new Error(payablesRes.error.message)
  if (loansRes.error) throw new Error(loansRes.error.message)

  const payables = payablesRes.data || []
  const loans = loansRes.data || []

  let totalPayablesOutstanding = 0
  let payablesOverdue = 0
  let payablesOverdueCount = 0

  for (const p of payables) {
    const balance = (p.total_amount as number) - (p.paid_amount as number)
    totalPayablesOutstanding += balance
    if (p.status === 'overdue') {
      payablesOverdue += balance
      payablesOverdueCount++
    }
  }

  const totalLoanObligations = loans.reduce((sum, l) => sum + (l.outstanding_balance as number), 0)

  // Upcoming in 7 days
  const upcoming = await getUpcomingPayments(7)
  const upcoming7Count = upcoming.length
  const upcoming7Total = upcoming.reduce((sum, u) => sum + u.amount_due, 0)

  return {
    total_payables_outstanding: totalPayablesOutstanding,
    payables_overdue: payablesOverdue,
    payables_overdue_count: payablesOverdueCount,
    total_loan_obligations: totalLoanObligations,
    active_loans_count: loans.length,
    upcoming_7_days_total: upcoming7Total,
    upcoming_7_days_count: upcoming7Count,
  }
}
