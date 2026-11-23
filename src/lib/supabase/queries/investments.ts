// Investments: money put into the business by investors, tagged to received
// stock (lots). All money figures are computed in the database
// (lots_private.investment_figures, migration 00108) so they can't drift.
// Every table and RPC here is admin-only (RLS + checks in the functions).
//
// The investment tables aren't in the hand-maintained Database type, so
// queries cast the client, matching how content_suggestions is queried.

import { getClient } from '../client'

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => getClient() as any

export type InvestmentStatus = 'active' | 'closed'
export type LedgerEntryType = 'capital' | 'top_up' | 'payout' | 'withdrawal'

export interface Investment {
  id: string
  code: string
  investor_name: string
  contact: string | null
  start_date: string
  profit_share_pct: number
  reinvest_profit: boolean
  status: InvestmentStatus
  notes: string | null
  created_at: string
}

export interface InvestmentFigures {
  investment_id: string
  capital_in: number
  withdrawals: number
  payouts: number
  units_tagged: number
  tagged_cost: number
  units_in_stock: number
  stock_value: number
  units_sold: number
  revenue_collected: number
  capital_returned: number
  profit_earned: number
  buybacks: number
  available: number
  owed_to_investor: number
}

export type InvestmentWithFigures = Investment & { figures: InvestmentFigures | null }

export interface LedgerEntry {
  id: string
  investment_id: string
  entry_type: LedgerEntryType
  amount: number
  entry_date: string
  notes: string | null
  created_at: string
}

export interface InvestmentShare {
  id: string
  lot_id: string
  qty_tagged: number
  qty_remaining: number
  unit_cost: number
  price_at_tag: number | null
  tagged_at: string
  notes: string | null
  lot: {
    received_at: string
    source: string
    po_id: string | null
    product: { id: string; code: string; name: string } | null
    purchase_order: { po_number: string } | null
  } | null
}

export interface InvestmentSale {
  consumption_id: string
  transaction_id: string
  transaction_number: string
  transaction_date: string
  product_id: string
  product_name: string
  lot_share_id: string
  qty_sold: number
  unit_cost: number
  unit_revenue: number
  paid_ratio: number
  investor_share: number
}

export interface TaggableLot {
  lot_id: string
  po_id: string | null
  po_line_id: string | null
  product_id: string
  product_name: string
  branch_id: string
  received_at: string
  unit_cost: number
  qty_received: number
  qty_remaining: number
  qty_tagged_remaining: number
  qty_taggable: number
}

const num = (v: unknown) => Number(v ?? 0)

function toFigures(r: any): InvestmentFigures {
  return {
    investment_id: r.investment_id,
    capital_in: num(r.capital_in),
    withdrawals: num(r.withdrawals),
    payouts: num(r.payouts),
    units_tagged: num(r.units_tagged),
    tagged_cost: num(r.tagged_cost),
    units_in_stock: num(r.units_in_stock),
    stock_value: num(r.stock_value),
    units_sold: num(r.units_sold),
    revenue_collected: num(r.revenue_collected),
    capital_returned: num(r.capital_returned),
    profit_earned: num(r.profit_earned),
    buybacks: num(r.buybacks),
    available: num(r.available),
    owed_to_investor: num(r.owed_to_investor),
  }
}

export async function getInvestments(): Promise<InvestmentWithFigures[]> {
  const [{ data: rows, error }, { data: figs, error: figErr }] = await Promise.all([
    db().from('investments').select('*').order('created_at', { ascending: false }),
    db().rpc('get_investment_figures', { p_investment_id: null }),
  ])
  if (error) throw error
  if (figErr) throw figErr
  const byId = new Map<string, InvestmentFigures>((figs ?? []).map((f: any) => [f.investment_id, toFigures(f)]))
  return (rows ?? []).map((r: any) => ({ ...r, profit_share_pct: num(r.profit_share_pct), figures: byId.get(r.id) ?? null }))
}

export async function getInvestment(id: string): Promise<InvestmentWithFigures> {
  const [{ data: row, error }, { data: figs, error: figErr }] = await Promise.all([
    db().from('investments').select('*').eq('id', id).single(),
    db().rpc('get_investment_figures', { p_investment_id: id }),
  ])
  if (error) throw error
  if (figErr) throw figErr
  return { ...row, profit_share_pct: num(row.profit_share_pct), figures: figs?.[0] ? toFigures(figs[0]) : null }
}

export interface InvestmentInput {
  code: string
  investor_name: string
  contact?: string | null
  start_date: string
  profit_share_pct: number
  reinvest_profit: boolean
  capital: number
  notes?: string | null
}

/** Creates the investment and its opening capital entry. */
export async function createInvestment(input: InvestmentInput, userId: string): Promise<Investment> {
  const { data, error } = await db()
    .from('investments')
    .insert({
      code: input.code.trim(),
      investor_name: input.investor_name.trim(),
      contact: input.contact?.trim() || null,
      start_date: input.start_date,
      profit_share_pct: input.profit_share_pct,
      reinvest_profit: input.reinvest_profit,
      notes: input.notes?.trim() || null,
      created_by: userId,
    })
    .select('*')
    .single()
  if (error) throw error
  const { error: ledgerErr } = await db().from('investment_ledger').insert({
    investment_id: data.id,
    entry_type: 'capital',
    amount: input.capital,
    entry_date: input.start_date,
    notes: 'Opening capital',
    created_by: userId,
  })
  if (ledgerErr) {
    // Don't leave an investment with no capital behind.
    await db().from('investments').delete().eq('id', data.id)
    throw ledgerErr
  }
  return data
}

/**
 * Profit share % and reinvest mode are fixed after creation: both are
 * applied to all past sales when figures are computed, so changing them
 * later would rewrite history.
 */
export async function updateInvestment(
  id: string,
  updates: Partial<Pick<Investment, 'investor_name' | 'contact' | 'notes' | 'status'>>
) {
  const { error } = await db()
    .from('investments')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function getLedger(investmentId: string): Promise<LedgerEntry[]> {
  const { data, error } = await db()
    .from('investment_ledger')
    .select('*')
    .eq('investment_id', investmentId)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r: any) => ({ ...r, amount: num(r.amount) }))
}

export async function addLedgerEntry(
  entry: { investment_id: string; entry_type: LedgerEntryType; amount: number; entry_date: string; notes?: string | null },
  userId: string
) {
  const { error } = await db().from('investment_ledger').insert({ ...entry, notes: entry.notes?.trim() || null, created_by: userId })
  if (error) throw error
}

export async function getInvestmentShares(investmentId: string): Promise<InvestmentShare[]> {
  const { data, error } = await db()
    .from('investment_lot_shares')
    .select(`
      id, lot_id, qty_tagged, qty_remaining, unit_cost, price_at_tag, tagged_at, notes,
      lot:inventory_lots(received_at, source, po_id,
        product:products(id, code, name),
        purchase_order:purchase_orders(po_number))
    `)
    .eq('investment_id', investmentId)
    .order('tagged_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    ...r,
    qty_tagged: num(r.qty_tagged),
    qty_remaining: num(r.qty_remaining),
    unit_cost: num(r.unit_cost),
    price_at_tag: r.price_at_tag == null ? null : num(r.price_at_tag),
  }))
}

export async function getInvestmentSales(investmentId: string): Promise<InvestmentSale[]> {
  const { data, error } = await db().rpc('get_investment_sales', { p_investment_id: investmentId })
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    ...r,
    qty_sold: num(r.qty_sold),
    unit_cost: num(r.unit_cost),
    unit_revenue: num(r.unit_revenue),
    paid_ratio: num(r.paid_ratio),
    investor_share: num(r.investor_share),
  }))
}

export async function getTaggableLots(poId: string): Promise<TaggableLot[]> {
  const { data, error } = await db().rpc('get_taggable_lots', { p_po_id: poId, p_product_id: null })
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    ...r,
    unit_cost: num(r.unit_cost),
    qty_received: num(r.qty_received),
    qty_remaining: num(r.qty_remaining),
    qty_tagged_remaining: num(r.qty_tagged_remaining),
    qty_taggable: num(r.qty_taggable),
  }))
}

/** Tags base-unit quantity of a lot to an investment. Errors explain why (budget, unsold units). */
export async function tagInvestment(investmentId: string, lotId: string, qty: number, notes?: string) {
  const { error } = await db().rpc('tag_investment', {
    p_investment_id: investmentId,
    p_lot_id: lotId,
    p_qty: qty,
    p_notes: notes ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function untagInvestment(shareId: string, qty: number) {
  const { error } = await db().rpc('untag_investment', { p_share_id: shareId, p_qty: qty })
  if (error) throw new Error(error.message)
}

/** Investor profit share collected in a date range (Manila dates), for the P&L. */
export async function getInvestorProfitShareForPeriod(dateFrom: string, dateTo: string): Promise<number> {
  const { data, error } = await db().rpc('get_investor_profit_share', { p_date_from: dateFrom, p_date_to: dateTo })
  if (error) throw error
  return num(data)
}
