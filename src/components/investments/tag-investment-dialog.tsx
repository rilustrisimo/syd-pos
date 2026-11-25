'use client'

// Tag received stock from one PO to investments (admins only, opened from
// the PO page's "Tag to Investment" button). Only units still
// unsold and not already tagged can be tagged; the database enforces that
// and the investment's available amount (lots_private.tag, migration 00108).

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useInvestments, useTaggableLots, useTagInvestment } from '@/hooks/useInvestments'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils/formatting'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

type Row = { investmentId: string; qty: string }

/** Up to 4 decimals, no trailing zeros (20 → "20", 0.5 → "0.5"). */
const formatQty = (n: number) => n.toLocaleString('en-PH', { maximumFractionDigits: 4 })

export function TagInvestmentDialog({
  poId,
  open,
  onOpenChange,
}: {
  poId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: lots = [], isLoading: lotsLoading } = useTaggableLots(poId, open)
  const { data: investments = [], isLoading: invLoading } = useInvestments()
  const tagMutation = useTagInvestment()
  const [rows, setRows] = useState<Record<string, Row>>({})
  const [saving, setSaving] = useState(false)

  const active = useMemo(() => investments.filter((i) => i.status === 'active'), [investments])
  const taggable = lots.filter((l) => l.qty_taggable > 0)

  // Money each investment would use across all rows, to warn before saving.
  const plannedByInvestment = useMemo(() => {
    const totals = new Map<string, number>()
    for (const lot of lots) {
      const row = rows[lot.lot_id]
      const qty = Number(row?.qty)
      if (row?.investmentId && qty > 0) {
        totals.set(row.investmentId, (totals.get(row.investmentId) ?? 0) + qty * lot.unit_cost)
      }
    }
    return totals
  }, [rows, lots])

  const setRow = (lotId: string, patch: Partial<Row>) =>
    setRows((prev) => ({ ...prev, [lotId]: { ...(prev[lotId] ?? { investmentId: '', qty: '' }), ...patch } }))

  const handleSave = async () => {
    const toTag = taggable
      .map((lot) => ({ lot, row: rows[lot.lot_id] }))
      .filter(({ row }) => row?.investmentId && Number(row.qty) > 0)
    if (toTag.length === 0) return toast.error('Pick an investment and a quantity for at least one product')

    for (const { lot, row } of toTag) {
      if (Number(row!.qty) > lot.qty_taggable) {
        return toast.error(`${lot.product_name}: only ${formatQty(lot.qty_taggable)} unit(s) can be tagged`)
      }
    }
    for (const [invId, planned] of plannedByInvestment) {
      const inv = active.find((i) => i.id === invId)
      if (inv?.figures && planned > inv.figures.available + 0.005) {
        return toast.error(`${inv.investor_name} has ${formatCurrency(inv.figures.available)} available; these tags cost ${formatCurrency(planned)}`)
      }
    }

    setSaving(true)
    let done = 0
    try {
      for (const { lot, row } of toTag) {
        await tagMutation.mutateAsync({ investmentId: row!.investmentId, lotId: lot.lot_id, qty: Number(row!.qty) })
        done++
      }
      toast.success(`Tagged ${done} product${done !== 1 ? 's' : ''} to investments`)
      setRows({})
      onOpenChange(false)
    } catch (err) {
      // Earlier rows are already saved; say which one failed.
      toast.error(`${done > 0 ? `${done} saved; ` : ''}${err instanceof Error ? err.message : 'Failed to tag'}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Tag to Investment (optional)</DialogTitle>
          <DialogDescription>
            Choose which received products an investor paid for. Only units that are still unsold and untagged can be tagged.
            Leave a row empty to keep it as store stock. To split one product between investors, tag it again after saving.
          </DialogDescription>
        </DialogHeader>

        {lotsLoading || invLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : active.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No active investments. Create one under Investments first.</p>
        ) : taggable.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nothing left to tag on this PO: everything received is sold or already tagged.</p>
        ) : (
          <div className="border rounded-lg overflow-x-auto max-h-[55vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Can tag</TableHead>
                  <TableHead className="text-right">Cost / unit</TableHead>
                  <TableHead className="w-48">Investment</TableHead>
                  <TableHead className="w-28 text-right">Qty</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {taggable.map((lot) => {
                  const row = rows[lot.lot_id]
                  const qty = Number(row?.qty)
                  return (
                    <TableRow key={lot.lot_id}>
                      <TableCell>
                        <div className="font-medium">{lot.product_name}</div>
                        <div className="text-xs text-muted-foreground">Received {formatDate(lot.received_at)}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatNumber(lot.qty_taggable, 2)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(lot.unit_cost)}</TableCell>
                      <TableCell>
                        <Select value={row?.investmentId ?? ''} onValueChange={(v) => setRow(lot.lot_id, { investmentId: v })}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="Store stock" /></SelectTrigger>
                          <SelectContent>
                            {active.map((inv) => (
                              <SelectItem key={inv.id} value={inv.id}>
                                {inv.investor_name} · {formatCurrency(inv.figures?.available ?? 0)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          className="h-8 w-24 ml-auto text-right"
                          value={row?.qty ?? ''}
                          placeholder="0"
                          disabled={!row?.investmentId}
                          onChange={(e) => setRow(lot.lot_id, { qty: e.target.value })}
                          aria-label={`Quantity of ${lot.product_name} to tag`}
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {row?.investmentId && qty > 0 ? formatCurrency(qty * lot.unit_cost) : ''}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Skip</Button>
          <Button onClick={handleSave} disabled={saving || taggable.length === 0 || active.length === 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Tags
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
