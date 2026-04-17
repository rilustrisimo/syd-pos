import { createClient } from '../client'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Referrer {
  id: string
  name: string
  phone: string | null
  profession: string | null
  address: string | null
  bank_details: string | null
  default_commission_rate: number
  customer_id: string | null
  customer?: { id: string; name: string } | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ReferrerInput {
  name: string
  phone?: string | null
  profession?: string | null
  address?: string | null
  bank_details?: string | null
  default_commission_rate?: number
  customer_id?: string | null
  is_active?: boolean
}

export interface ReferrerFilters {
  search?: string
  is_active?: boolean
  page?: number
  limit?: number
}

export interface ReferrerStats {
  total_earned: number
  total_reversed: number
  total_paid_out: number
  balance: number
  pending_amount: number
  transaction_count: number
}

export interface CommissionRow {
  id: string
  referrer_id: string
  transaction_id: string
  commission_rate: number
  sale_amount: number
  commission_amount: number
  status: 'pending' | 'earned' | 'reversed'
  earned_at: string | null
  created_at: string
  updated_at: string
  transaction?: { id: string; transaction_number: string; transaction_date: string; total_amount: number } | null
}

export interface PayoutRow {
  id: string
  referrer_id: string
  amount: number
  payment_method: string
  reference_number: string | null
  payout_date: string
  notes: string | null
  created_by: string
  created_at: string
  created_user?: { full_name: string | null; email: string } | null
}

export interface PayoutInput {
  amount: number
  payment_method: 'cash' | 'gcash' | 'bank_transfer'
  reference_number?: string | null
  payout_date?: string
  notes?: string | null
}

// ── List / search ─────────────────────────────────────────────────────────────

export async function getReferrers(filters: ReferrerFilters = {}) {
  const supabase = createClient()
  const { search, is_active = true, page = 1, limit = 20 } = filters
  const offset = (page - 1) * limit

  let query = supabase
    .from('referrers')
    .select('*', { count: 'exact' })
    .eq('is_active', is_active)

  if (search?.trim()) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,profession.ilike.%${search}%`)
  }

  query = query.order('name').range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) throw error

  return {
    referrers: (data as any[]) as Referrer[],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  }
}

export async function getAllActiveReferrers(): Promise<Pick<Referrer, 'id' | 'name' | 'profession' | 'default_commission_rate' | 'phone'>[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('referrers')
    .select('id, name, profession, default_commission_rate, phone')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return (data as any[]) || []
}

export async function getReferrer(id: string): Promise<Referrer> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('referrers')
    .select('*, customer:customers!customer_id(id, name)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as any
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getReferrerStats(referrerId: string): Promise<ReferrerStats> {
  const supabase = createClient()

  const [{ data: commissions, error: cErr }, { data: payouts, error: pErr }] = await Promise.all([
    supabase
      .from('referrer_commissions')
      .select('status, commission_amount, transaction_id')
      .eq('referrer_id', referrerId),
    supabase
      .from('referrer_payouts')
      .select('amount')
      .eq('referrer_id', referrerId),
  ])

  if (cErr) throw cErr
  if (pErr) throw pErr

  const rows = (commissions as any[]) || []
  const payoutRows = (payouts as any[]) || []

  const total_earned = rows
    .filter(r => r.status === 'earned')
    .reduce((s, r) => s + Number(r.commission_amount), 0)

  const total_reversed = rows
    .filter(r => r.status === 'reversed')
    .reduce((s, r) => s + Number(r.commission_amount), 0)

  const pending_amount = rows
    .filter(r => r.status === 'pending')
    .reduce((s, r) => s + Number(r.commission_amount), 0)

  const total_paid_out = payoutRows.reduce((s, r) => s + Number(r.amount), 0)

  return {
    total_earned,
    total_reversed,
    total_paid_out,
    balance: total_earned - total_reversed - total_paid_out,
    pending_amount,
    transaction_count: rows.length,
  }
}

// ── Global stats for list page ─────────────────────────────────────────────────

export async function getAllReferrerStats() {
  const supabase = createClient()

  const [{ data: referrers, error: rErr }, { data: commissions, error: cErr }, { data: payouts, error: pErr }] = await Promise.all([
    supabase.from('referrers').select('id').eq('is_active', true),
    supabase.from('referrer_commissions').select('referrer_id, status, commission_amount'),
    supabase.from('referrer_payouts').select('referrer_id, amount'),
  ])

  if (rErr) throw rErr
  if (cErr) throw cErr
  if (pErr) throw pErr

  const cRows = (commissions as any[]) || []
  const pRows = (payouts as any[]) || []

  const total_earned = cRows.filter(r => r.status === 'earned').reduce((s, r) => s + Number(r.commission_amount), 0)
  const total_reversed = cRows.filter(r => r.status === 'reversed').reduce((s, r) => s + Number(r.commission_amount), 0)
  const total_paid_out = pRows.reduce((s, r) => s + Number(r.amount), 0)

  // Per-referrer balance map for table display
  const balanceMap = new Map<string, { earned: number; reversed: number; paid_out: number }>()
  for (const r of cRows) {
    if (!balanceMap.has(r.referrer_id)) balanceMap.set(r.referrer_id, { earned: 0, reversed: 0, paid_out: 0 })
    const e = balanceMap.get(r.referrer_id)!
    if (r.status === 'earned') e.earned += Number(r.commission_amount)
    if (r.status === 'reversed') e.reversed += Number(r.commission_amount)
  }
  for (const r of pRows) {
    if (!balanceMap.has(r.referrer_id)) balanceMap.set(r.referrer_id, { earned: 0, reversed: 0, paid_out: 0 })
    balanceMap.get(r.referrer_id)!.paid_out += Number(r.amount)
  }

  return {
    total_referrers: (referrers as any[])?.length || 0,
    total_earned,
    total_paid_out,
    total_balance: total_earned - total_reversed - total_paid_out,
    balanceMap,
  }
}

// ── Commissions ───────────────────────────────────────────────────────────────

export async function getReferrerCommissions(referrerId: string): Promise<CommissionRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('referrer_commissions')
    .select(`
      *,
      transaction:transactions!transaction_id(id, transaction_number, transaction_date, total_amount)
    `)
    .eq('referrer_id', referrerId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as any[]) as CommissionRow[]
}

export async function getCommissionForTransaction(transactionId: string): Promise<CommissionRow | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('referrer_commissions')
    .select('*')
    .eq('transaction_id', transactionId)
    .maybeSingle()
  if (error) throw error
  return data as any
}

export async function createCommission(
  referrerId: string,
  transactionId: string,
  rate: number
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('referrer_commissions')
    .insert({
      referrer_id: referrerId,
      transaction_id: transactionId,
      commission_rate: rate,
      sale_amount: 0,       // will be filled by trigger when paid
      commission_amount: 0, // will be filled by trigger when paid
      status: 'pending',
    } as any)
  if (error) throw error
}

export async function createCommissionReversal(
  referrerId: string,
  returnTransactionId: string,
  reversalAmount: number,
  rate: number
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('referrer_commissions')
    .insert({
      referrer_id: referrerId,
      transaction_id: returnTransactionId,
      commission_rate: rate,
      sale_amount: 0,
      commission_amount: reversalAmount,
      status: 'reversed',
      earned_at: new Date().toISOString(),
    } as any)
  if (error) throw error
}

export async function tagTransactionReferrer(
  transactionId: string,
  referrerId: string,
  commissionRate: number
): Promise<void> {
  const supabase = createClient()

  // Update transaction
  const { error: txnErr } = await supabase
    .from('transactions')
    .update({ referrer_id: referrerId, commission_rate: commissionRate } as any)
    .eq('id', transactionId)
  if (txnErr) throw txnErr

  // Get current payment_status to determine commission status
  const { data: txn, error: fetchErr } = await supabase
    .from('transactions')
    .select('payment_status, total_amount')
    .eq('id', transactionId)
    .single()
  if (fetchErr) throw fetchErr

  const t = txn as any
  const isPaid = t.payment_status === 'paid'
  const commissionAmount = isPaid ? Number(t.total_amount) * commissionRate / 100 : 0

  // Upsert commission row
  const { error: commErr } = await supabase
    .from('referrer_commissions')
    .upsert({
      referrer_id: referrerId,
      transaction_id: transactionId,
      commission_rate: commissionRate,
      sale_amount: isPaid ? Number(t.total_amount) : 0,
      commission_amount: commissionAmount,
      status: isPaid ? 'earned' : 'pending',
      earned_at: isPaid ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: 'transaction_id' })
  if (commErr) throw commErr
}

// ── Payouts ───────────────────────────────────────────────────────────────────

export async function getReferrerPayouts(referrerId: string): Promise<PayoutRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('referrer_payouts')
    .select('*, created_user:users!created_by(full_name, email)')
    .eq('referrer_id', referrerId)
    .order('payout_date', { ascending: false })
  if (error) throw error
  return (data as any[]) as PayoutRow[]
}

export async function createPayout(
  referrerId: string,
  input: PayoutInput,
  userId: string
): Promise<PayoutRow> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('referrer_payouts')
    .insert({
      referrer_id: referrerId,
      amount: input.amount,
      payment_method: input.payment_method,
      reference_number: input.reference_number || null,
      payout_date: input.payout_date || new Date().toISOString().split('T')[0],
      notes: input.notes || null,
      created_by: userId,
    } as any)
    .select('*, created_user:users!created_by(full_name, email)')
    .single()
  if (error) throw error
  return data as any
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function createReferrer(input: ReferrerInput): Promise<Referrer> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('referrers')
    .insert({
      name: input.name,
      phone: input.phone || null,
      profession: input.profession || null,
      address: input.address || null,
      bank_details: input.bank_details || null,
      default_commission_rate: input.default_commission_rate ?? 0,
      customer_id: input.customer_id || null,
      is_active: input.is_active ?? true,
    } as any)
    .select()
    .single()
  if (error) throw error
  return data as any
}

export async function updateReferrer(id: string, input: Partial<ReferrerInput>): Promise<Referrer> {
  const supabase = createClient()
  const update: Record<string, any> = {}
  if (input.name !== undefined) update.name = input.name
  if (input.phone !== undefined) update.phone = input.phone
  if (input.profession !== undefined) update.profession = input.profession
  if (input.address !== undefined) update.address = input.address
  if (input.bank_details !== undefined) update.bank_details = input.bank_details
  if (input.default_commission_rate !== undefined) update.default_commission_rate = input.default_commission_rate
  if (input.customer_id !== undefined) update.customer_id = input.customer_id
  if (input.is_active !== undefined) update.is_active = input.is_active
  update.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('referrers')
    .update(update)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as any
}

export async function deleteReferrer(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('referrers')
    .update({ is_active: false, updated_at: new Date().toISOString() } as any)
    .eq('id', id)
  if (error) throw error
}
