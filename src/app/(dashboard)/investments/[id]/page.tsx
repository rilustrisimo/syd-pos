'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { ArrowLeft, Download, Loader2, Plus, Undo2 } from 'lucide-react'
import {
  useInvestment,
  useInvestmentLedger,
  useInvestmentShares,
  useInvestmentSales,
  useAddLedgerEntry,
  useUpdateInvestment,
  useUntagInvestment,
} from '@/hooks/useInvestments'
import type { InvestmentShare, LedgerEntryType } from '@/lib/supabase/queries/investments'
import { useAuthStore } from '@/lib/stores/auth'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils/formatting'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

const ENTRY_LABELS: Record<LedgerEntryType, string> = {
  capital: 'Capital',
  top_up: 'Top-up',
  payout: 'Profit payout',
  withdrawal: 'Capital withdrawal',
}

export default function InvestmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const user = useAuthStore((s) => s.user)
  const { data: inv, isLoading } = useInvestment(id)
  const { data: ledger = [] } = useInvestmentLedger(id)
  const { data: shares = [] } = useInvestmentShares(id)
  const { data: sales = [] } = useInvestmentSales(id)
  const addEntry = useAddLedgerEntry()
  const updateInv = useUpdateInvestment()
  const untag = useUntagInvestment()

  const [entryOpen, setEntryOpen] = useState(false)
  const [entry, setEntry] = useState({ entry_type: 'top_up' as LedgerEntryType, amount: '', entry_date: today(), notes: '' })
  const [untagShare, setUntagShare] = useState<InvestmentShare | null>(null)
  const [untagQty, setUntagQty] = useState('')

  if (isLoading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  }
  if (!inv) {
    return <p className="text-center text-muted-foreground py-24">Investment not found (admins only).</p>
  }
  const f = inv.figures

  const handleAddEntry = async () => {
    const amount = Number(entry.amount)
    if (!(amount > 0)) return toast.error('Amount must be greater than zero')
    if (entry.entry_type === 'payout' && f && !inv.reinvest_profit && amount > f.owed_to_investor + 0.005) {
      return toast.error(`Only ${formatCurrency(f.owed_to_investor)} is owed to the investor`)
    }
    if ((entry.entry_type === 'withdrawal' || (entry.entry_type === 'payout' && inv.reinvest_profit)) && f && amount > f.available + 0.005) {
      return toast.error(`Only ${formatCurrency(f.available)} is available (the rest is in stock or uncollected)`)
    }
    try {
      await addEntry.mutateAsync({
        entry: { investment_id: id, entry_type: entry.entry_type, amount, entry_date: entry.entry_date, notes: entry.notes },
        userId: user!.id,
      })
      toast.success(`${ENTRY_LABELS[entry.entry_type]} recorded`)
      setEntryOpen(false)
      setEntry({ entry_type: 'top_up', amount: '', entry_date: today(), notes: '' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record')
    }
  }

  const handleUntag = async () => {
    if (!untagShare) return
    const qty = Number(untagQty)
    if (!(qty > 0) || qty > untagShare.qty_remaining) {
      return toast.error(`Enter up to ${formatNumber(untagShare.qty_remaining, 4)} unsold unit(s)`)
    }
    try {
      await untag.mutateAsync({ shareId: untagShare.id, qty })
      toast.success('Untagged; the money is available again')
      setUntagShare(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to untag')
    }
  }

  const toggleStatus = async () => {
    try {
      await updateInv.mutateAsync({ id, updates: { status: inv.status === 'active' ? 'closed' : 'active' } })
      toast.success(inv.status === 'active' ? 'Investment closed' : 'Investment reopened')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update')
    }
  }

  const downloadStatement = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('Investment Statement', 14, 18)
    doc.setFontSize(10)
    doc.text('SYD Construction Supplies Trading', 14, 25)
    doc.text(`${inv.investor_name}  (${inv.code})`, 14, 33)
    doc.text(`Start: ${formatDate(inv.start_date)}   Profit share: ${inv.profit_share_pct}%   ${inv.reinvest_profit ? 'Profit reinvested' : 'Profit paid out'}`, 14, 39)
    doc.text(`As of ${formatDate(new Date())}`, 14, 45)

    autoTable(doc, {
      startY: 51,
      head: [['Summary', 'Amount']],
      body: f ? [
        ['Capital in (incl. top-ups)', formatCurrency(f.capital_in)],
        ['Capital withdrawn', formatCurrency(f.withdrawals)],
        ['Cost of stock tagged', formatCurrency(f.tagged_cost)],
        [`Stock on hand (${formatNumber(f.units_in_stock, 2)} units, at cost)`, formatCurrency(f.stock_value)],
        ['Sales collected', formatCurrency(f.revenue_collected)],
        ['Capital returned from sales', formatCurrency(f.capital_returned)],
        ['Profit share earned', formatCurrency(f.profit_earned)],
        ['Bought back by the store (damaged/lost, at cost)', formatCurrency(f.buybacks)],
        ['Profit paid out', formatCurrency(f.payouts)],
        ['Available to reinvest', formatCurrency(f.available)],
        ['Owed to investor', formatCurrency(f.owed_to_investor)],
      ] : [],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 41, 59] },
      columnStyles: { 1: { halign: 'right' } },
    })

    const afterSummary = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
    autoTable(doc, {
      startY: afterSummary,
      head: [['Tagged', 'Product', 'PO', 'Qty', 'Sold', 'Left', 'Cost/unit', 'Price at tag']],
      body: shares.map((s) => [
        formatDate(s.tagged_at),
        s.lot?.product?.name ?? '',
        s.lot?.purchase_order?.po_number ?? '',
        formatNumber(s.qty_tagged, 2),
        formatNumber(s.qty_tagged - s.qty_remaining, 2),
        formatNumber(s.qty_remaining, 2),
        formatCurrency(s.unit_cost),
        s.price_at_tag == null ? '' : formatCurrency(s.price_at_tag),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] },
    })

    const afterShares = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
    autoTable(doc, {
      startY: afterShares,
      head: [['Date', 'Sale', 'Product', 'Qty', 'Sold at', 'Cost', 'Paid', 'Investor gets']],
      body: sales.map((s) => [
        formatDate(s.transaction_date),
        s.transaction_number,
        s.product_name,
        formatNumber(s.qty_sold, 2),
        formatCurrency(s.unit_revenue),
        formatCurrency(s.unit_cost),
        `${Math.round(s.paid_ratio * 100)}%`,
        formatCurrency(s.investor_share),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] },
    })

    doc.save(`${inv.code}-statement.pdf`)
    toast.success('Statement downloaded')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/investments" aria-label="Back to investments"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{inv.investor_name}</h1>
              <Badge variant={inv.status === 'active' ? 'default' : 'secondary'}>{inv.status === 'active' ? 'Active' : 'Closed'}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {inv.code} · since {formatDate(inv.start_date)} · {inv.profit_share_pct}% of profit ·{' '}
              {inv.reinvest_profit ? 'profit reinvested' : 'profit paid out'}
              {inv.contact ? ` · ${inv.contact}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadStatement}><Download className="mr-2 h-4 w-4" />Statement</Button>
          <Button variant="outline" onClick={toggleStatus} disabled={updateInv.isPending}>
            {inv.status === 'active' ? 'Close' : 'Reopen'}
          </Button>
          <Button onClick={() => setEntryOpen(true)}><Plus className="mr-2 h-4 w-4" />Record Money</Button>
        </div>
      </div>

      {f && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Figure label="Capital in" value={formatCurrency(f.capital_in - f.withdrawals)} hint={f.withdrawals > 0 ? `after ${formatCurrency(f.withdrawals)} withdrawn` : undefined} />
          <Figure label="Available to tag" value={formatCurrency(f.available)} />
          <Figure label="In stock (at cost)" value={formatCurrency(f.stock_value)} hint={`${formatNumber(f.units_in_stock, 2)} units`} />
          <Figure label="Owed to investor" value={formatCurrency(f.owed_to_investor)} hint={inv.reinvest_profit ? 'reinvest mode' : undefined} />
          <Figure label="Units sold" value={formatNumber(f.units_sold, 2)} hint={`of ${formatNumber(f.units_tagged, 2)} tagged`} />
          <Figure label="Sales collected" value={formatCurrency(f.revenue_collected)} />
          <Figure label="Profit share earned" value={formatCurrency(f.profit_earned)} negative={f.profit_earned < 0} />
          <Figure label="Bought back (at cost)" value={formatCurrency(f.buybacks)} hint="damaged or lost units" />
        </div>
      )}

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Tagged Stock ({shares.length})</TabsTrigger>
          <TabsTrigger value="sales">Sales ({sales.length})</TabsTrigger>
          <TabsTrigger value="money">Money ({ledger.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Tagged Stock</CardTitle>
              <CardDescription>Tag stock from a received purchase order (Purchases → PO → Tag to investment).</CardDescription>
            </CardHeader>
            <CardContent>
              {shares.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nothing tagged yet.</p>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>PO</TableHead>
                        <TableHead className="text-right">Tagged</TableHead>
                        <TableHead className="text-right">Sold</TableHead>
                        <TableHead className="text-right">Left</TableHead>
                        <TableHead className="text-right">Cost / unit</TableHead>
                        <TableHead className="text-right">Price at tag</TableHead>
                        <TableHead>Tagged on</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shares.map((s) => (
                        <TableRow key={s.id} className={s.qty_tagged === 0 ? 'opacity-60' : ''}>
                          <TableCell className="font-medium">{s.lot?.product?.name ?? '—'}</TableCell>
                          <TableCell>
                            {s.lot?.po_id ? (
                              <Link href={`/purchases/${s.lot.po_id}`} className="hover:underline hover:text-primary">
                                {s.lot.purchase_order?.po_number ?? 'PO'}
                              </Link>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono">{formatNumber(s.qty_tagged, 2)}</TableCell>
                          <TableCell className="text-right font-mono">{formatNumber(s.qty_tagged - s.qty_remaining, 2)}</TableCell>
                          <TableCell className="text-right font-mono">{formatNumber(s.qty_remaining, 2)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(s.unit_cost)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{s.price_at_tag == null ? '—' : formatCurrency(s.price_at_tag)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(s.tagged_at)}</TableCell>
                          <TableCell className="text-right">
                            {s.qty_remaining > 0 && (
                              <Button size="sm" variant="ghost" onClick={() => { setUntagShare(s); setUntagQty(String(s.qty_remaining)) }}>
                                <Undo2 className="mr-1 h-3.5 w-3.5" />Untag
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Sales of This Investor&apos;s Stock</CardTitle>
              <CardDescription>
                &quot;Investor gets&quot; = cost + {inv.profit_share_pct}% of the profit, times the share of the sale the customer has paid.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sales.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No sales yet.</p>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Sale</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Sold at</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Investor gets</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sales.map((s) => (
                        <TableRow key={s.consumption_id}>
                          <TableCell className="text-sm">{formatDate(s.transaction_date)}</TableCell>
                          <TableCell className="text-sm">{s.transaction_number}</TableCell>
                          <TableCell className="font-medium">{s.product_name}</TableCell>
                          <TableCell className="text-right font-mono">{formatNumber(s.qty_sold, 2)}</TableCell>
                          <TableCell className={`text-right font-mono text-sm ${s.unit_revenue < s.unit_cost ? 'text-red-600' : ''}`}>
                            {formatCurrency(s.unit_revenue)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(s.unit_cost)}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={s.paid_ratio >= 1 ? 'default' : 'outline'}>{Math.round(s.paid_ratio * 100)}%</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(s.investor_share)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="money" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Money In and Out</CardTitle>
              <CardDescription>Capital, top-ups, profit payouts and withdrawals. Sales and tags are tracked automatically.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-sm">{formatDate(e.entry_date)}</TableCell>
                        <TableCell>{ENTRY_LABELS[e.entry_type]}</TableCell>
                        <TableCell className={`text-right font-mono text-sm ${e.entry_type === 'payout' || e.entry_type === 'withdrawal' ? 'text-red-600' : ''}`}>
                          {e.entry_type === 'payout' || e.entry_type === 'withdrawal' ? '−' : ''}{formatCurrency(e.amount)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{e.notes ?? ''}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={entryOpen} onOpenChange={setEntryOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Money</DialogTitle>
            <DialogDescription>
              Payouts come out of what&apos;s owed (or out of the available amount if profit is reinvested). Withdrawals take capital out of the available amount.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={entry.entry_type} onValueChange={(v) => setEntry({ ...entry, entry_type: v as LedgerEntryType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="top_up">Top-up (more capital)</SelectItem>
                  <SelectItem value="payout">Profit payout</SelectItem>
                  <SelectItem value="withdrawal">Capital withdrawal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="e-amount">Amount (₱)</Label>
                <Input id="e-amount" type="number" inputMode="decimal" min={0} value={entry.amount}
                  onChange={(e) => setEntry({ ...entry, amount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-date">Date</Label>
                <Input id="e-date" type="date" value={entry.entry_date} onChange={(e) => setEntry({ ...entry, entry_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-notes">Notes (optional)</Label>
              <Textarea id="e-notes" rows={2} value={entry.notes} onChange={(e) => setEntry({ ...entry, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntryOpen(false)}>Cancel</Button>
            <Button onClick={handleAddEntry} disabled={addEntry.isPending}>
              {addEntry.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!untagShare} onOpenChange={(o) => !o && setUntagShare(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Untag Stock</DialogTitle>
            <DialogDescription>
              {untagShare?.lot?.product?.name}: up to {formatNumber(untagShare?.qty_remaining ?? 0, 4)} unsold unit(s) can go back to the store.
              Their cost is added back to the available amount.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="untag-qty">Units to untag</Label>
            <Input id="untag-qty" type="number" inputMode="decimal" min={0} value={untagQty} onChange={(e) => setUntagQty(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUntagShare(null)}>Cancel</Button>
            <Button onClick={handleUntag} disabled={untag.isPending}>
              {untag.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Untag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Figure({ label, value, hint, negative }: { label: string; value: string; hint?: string; negative?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg sm:text-xl font-bold ${negative ? 'text-red-600' : ''}`}>{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}
