'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Plus, Loader2, PiggyBank, Wallet, Package, HandCoins, ShieldAlert } from 'lucide-react'
import { useInvestments, useCreateInvestment } from '@/hooks/useInvestments'
import { useAuthStore } from '@/lib/stores/auth'
import { formatCurrency, formatNumber } from '@/lib/utils/formatting'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

const emptyForm = () => ({
  code: '',
  investor_name: '',
  contact: '',
  start_date: today(),
  capital: '',
  profit_share_pct: '50',
  reinvest_profit: false,
  notes: '',
})

export default function InvestmentsPage() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const { data: investments = [], isLoading } = useInvestments()
  const createMutation = useCreateInvestment()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
        <ShieldAlert className="h-10 w-10 mb-3" />
        <p>Only admins can view investments.</p>
      </div>
    )
  }

  const active = investments.filter((i) => i.status === 'active')
  const sum = (pick: (f: NonNullable<(typeof investments)[number]['figures']>) => number) =>
    active.reduce((s, i) => s + (i.figures ? pick(i.figures) : 0), 0)

  const handleCreate = async () => {
    const capital = Number(form.capital)
    const pct = Number(form.profit_share_pct)
    if (!form.code.trim() || !form.investor_name.trim()) return toast.error('Code and investor name are required')
    if (!(capital > 0)) return toast.error('Capital must be greater than zero')
    if (!(pct >= 0 && pct <= 100)) return toast.error('Profit share must be between 0 and 100%')
    try {
      await createMutation.mutateAsync({
        input: { ...form, capital, profit_share_pct: pct },
        userId: user!.id,
      })
      toast.success('Investment created')
      setOpen(false)
      setForm(emptyForm())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create investment')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Investments</h1>
          <p className="text-muted-foreground">
            Investor money tagged to received stock. Sales use the oldest stock first; investors earn when customers pay.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Investment
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <StatCard title="Capital In" icon={PiggyBank} value={formatCurrency(sum((f) => f.capital_in - f.withdrawals))} hint={`${active.length} active`} />
        <StatCard title="Available to Tag" icon={Wallet} value={formatCurrency(sum((f) => f.available))} hint="Ready for new POs" />
        <StatCard title="In Stock (at cost)" icon={Package} value={formatCurrency(sum((f) => f.stock_value))} hint={`${formatNumber(sum((f) => f.units_in_stock), 2)} units`} />
        <StatCard title="Owed to Investors" icon={HandCoins} value={formatCurrency(sum((f) => f.owed_to_investor))} hint="Profit share not yet paid out" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Investments</CardTitle>
          <CardDescription>Amounts update as tagged stock sells and customers pay.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : investments.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No investments yet.</p>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Investor</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                    <TableHead className="text-right">Capital</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">In Stock</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Profit Earned</TableHead>
                    <TableHead className="text-right">Owed</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {investments.map((inv) => {
                    const f = inv.figures
                    return (
                      <TableRow key={inv.id}>
                        <TableCell>
                          <Link href={`/investments/${inv.id}`} className="font-medium hover:underline hover:text-primary">
                            {inv.investor_name}
                          </Link>
                          <div className="text-xs text-muted-foreground">{inv.code}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          {inv.profit_share_pct}%
                          <div className="text-xs text-muted-foreground">{inv.reinvest_profit ? 'Reinvest' : 'Payout'}</div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(f ? f.capital_in - f.withdrawals : 0)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(f?.available ?? 0)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatCurrency(f?.stock_value ?? 0)}
                          <div className="text-xs text-muted-foreground">{formatNumber(f?.units_in_stock ?? 0, 2)} units</div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(f?.revenue_collected ?? 0)}</TableCell>
                        <TableCell className={`text-right font-mono text-sm ${(f?.profit_earned ?? 0) < 0 ? 'text-red-600' : ''}`}>
                          {formatCurrency(f?.profit_earned ?? 0)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(f?.owed_to_investor ?? 0)}</TableCell>
                        <TableCell>
                          <Badge variant={inv.status === 'active' ? 'default' : 'secondary'}>
                            {inv.status === 'active' ? 'Active' : 'Closed'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Investment</DialogTitle>
            <DialogDescription>
              The profit share and payout setting can&apos;t be changed later, because they apply to every sale of this investor&apos;s stock.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="inv-code">Code</Label>
                <Input id="inv-code" placeholder="INV-001" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-date">Start date</Label>
                <Input id="inv-date" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-name">Investor name</Label>
              <Input id="inv-name" value={form.investor_name} onChange={(e) => setForm({ ...form, investor_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-contact">Contact (optional)</Label>
              <Input id="inv-contact" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="inv-capital">Capital (₱)</Label>
                <Input id="inv-capital" type="number" inputMode="decimal" min={0} value={form.capital}
                  onChange={(e) => setForm({ ...form, capital: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-pct">Investor&apos;s profit share (%)</Label>
                <Input id="inv-pct" type="number" inputMode="decimal" min={0} max={100} value={form.profit_share_pct}
                  onChange={(e) => setForm({ ...form, profit_share_pct: e.target.value })} />
              </div>
            </div>
            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div>
                <Label htmlFor="inv-reinvest">Reinvest profit share</Label>
                <p className="text-xs text-muted-foreground">
                  On: the investor&apos;s profit adds to the amount available to tag. Off: it&apos;s held as owed until you record a payout.
                </p>
              </div>
              <Switch id="inv-reinvest" checked={form.reinvest_profit} onCheckedChange={(v) => setForm({ ...form, reinvest_profit: v })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-notes">Notes (optional)</Label>
              <Textarea id="inv-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Investment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatCard({ title, icon: Icon, value, hint }: { title: string; icon: React.ElementType; value: string; hint: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-xl sm:text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}
