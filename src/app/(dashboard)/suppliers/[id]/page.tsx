'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  useSupplier,
  useSupplierStats,
  useSupplierTopProducts,
  useSupplierProductInventory,
  useSupplierPurchaseHistory,
  useUpdateSupplier,
} from '@/hooks/useSuppliers'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Building2,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Loader2,
  Pencil,
  Package,
  ShoppingCart,
  TrendingUp,
  Calendar,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  XCircle,
  Copy,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { UpdateTables } from '@/types/database'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatMonth(yyyymm: string) {
  const [y, m] = yyyymm.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-PH', { month: 'short', year: '2-digit' })
}

const poStatusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
  draft:               { label: 'Draft',              variant: 'outline',     icon: <Clock className="h-3 w-3" /> },
  sent:                { label: 'Sent',               variant: 'secondary',   icon: <Clock className="h-3 w-3" /> },
  confirmed:           { label: 'Confirmed',          variant: 'default',     icon: <Clock className="h-3 w-3" /> },
  partially_received:  { label: 'Partial',            variant: 'secondary',   icon: <Clock className="h-3 w-3" /> },
  received:            { label: 'Received',           variant: 'default',     icon: <CheckCircle2 className="h-3 w-3" /> },
  cancelled:           { label: 'Cancelled',          variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ title, value, sub, color }: {
  title: string
  value: string | number
  sub?: string
  color?: string
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-sm text-muted-foreground font-medium">{title}</div>
        <div className={`text-2xl font-bold mt-1 ${color ?? ''}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  )
}

// ── Spend Bar Chart ───────────────────────────────────────────────────────────

const BAR_HEIGHT = 140 // px — height of the bar area

function SpendChart({ data }: { data: { month: string; amount: number }[] }) {
  const max = Math.max(...data.map(d => d.amount), 1)
  return (
    <div className="w-full">
      {/* Bars */}
      <div className="flex items-end gap-1 w-full" style={{ height: BAR_HEIGHT }}>
        {data.map(d => {
          const barH = Math.round((d.amount / max) * BAR_HEIGHT)
          const displayH = d.amount > 0 ? Math.max(barH, 4) : 0
          return (
            <div
              key={d.month}
              className="flex-1 flex items-end"
              style={{ height: BAR_HEIGHT }}
            >
              <div
                className="w-full rounded-t-sm bg-primary/80 hover:bg-primary transition-colors cursor-default"
                style={{ height: displayH }}
                title={`${formatMonth(d.month)}: ${formatCurrency(d.amount)}`}
              />
            </div>
          )
        })}
      </div>
      {/* Labels */}
      <div className="flex gap-1 w-full mt-1">
        {data.map(d => (
          <div key={d.month} className="flex-1 flex justify-center overflow-hidden">
            <span className="text-[9px] text-muted-foreground whitespace-nowrap"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', maxHeight: 36 }}>
              {formatMonth(d.month)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Edit Dialog ───────────────────────────────────────────────────────────────

function EditSupplierDialog({ supplier, open, onClose }: {
  supplier: any
  open: boolean
  onClose: () => void
}) {
  const updateMutation = useUpdateSupplier()
  const [form, setForm] = useState({
    name: supplier.name,
    contact_person: supplier.contact_person || '',
    phone: supplier.phone || '',
    email: supplier.email || '',
    address: supplier.address || '',
    payment_terms: supplier.payment_terms || '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await updateMutation.mutateAsync({
        id: supplier.id,
        updates: {
          name: form.name.trim(),
          contact_person: form.contact_person.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          address: form.address.trim() || null,
          payment_terms: form.payment_terms.trim() || null,
        } as UpdateTables<'suppliers'>,
      })
      toast.success('Supplier updated')
      onClose()
    } catch (e: any) {
      toast.error(e.message || 'Failed to update')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Supplier</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="space-y-1">
            <Label>Contact Person</Label>
            <Input value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Address</Label>
            <Textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} rows={2} />
          </div>
          <div className="space-y-1">
            <Label>Payment Terms</Label>
            <Input value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })} placeholder="e.g. Net 30, COD" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [poPage, setPoPage] = useState(1)
  const [checkedRows, setCheckedRows] = useState<Set<string>>(new Set())

  const { data: supplier, isLoading: supplierLoading } = useSupplier(id)
  const { data: stats } = useSupplierStats(id)
  const { data: topProducts = [] } = useSupplierTopProducts(id)
  const { data: productInventory = [] } = useSupplierProductInventory(id)
  const { data: poHistory } = useSupplierPurchaseHistory(id, { page: poPage, limit: 15 })

  if (supplierLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!supplier) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Supplier not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/suppliers')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Suppliers
        </Button>
      </div>
    )
  }

  const totalPages = poHistory?.totalPages || 1

  // ── Inventory tab: checkbox selection + copy-names-to-clipboard ──────────
  const rowKey = (row: { product_id: string; branch_id: string }) => `${row.product_id}|${row.branch_id}`
  const allInventoryChecked = productInventory.length > 0 && productInventory.every(r => checkedRows.has(rowKey(r)))

  const toggleRow = (key: string, value: boolean) => {
    setCheckedRows(prev => {
      const next = new Set(prev)
      if (value) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const toggleAllRows = (value: boolean) => {
    setCheckedRows(value ? new Set(productInventory.map(rowKey)) : new Set())
  }

  const handleCopyNames = async () => {
    const checked = productInventory.filter(r => checkedRows.has(rowKey(r)))
    if (checked.length === 0) {
      toast.error('No items selected')
      return
    }
    // Dedupe — the same product can appear once per branch, but the paste
    // target only cares about the product, not which branch row it came from.
    const names = Array.from(new Set(checked.map(r => r.product_name)))
    try {
      await navigator.clipboard.writeText(names.join('\n'))
      toast.success(`Copied ${names.length} product name${names.length !== 1 ? 's' : ''} to clipboard`)
    } catch {
      toast.error('Failed to copy to clipboard')
    }
  }

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/suppliers')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{supplier.name}</h1>
              <span className="font-mono text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded">{supplier.code}</span>
              <Badge variant={supplier.is_active ? 'default' : 'secondary'}>
                {supplier.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
              {supplier.contact_person && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {supplier.contact_person}
                </span>
              )}
              {supplier.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  {supplier.phone}
                </span>
              )}
              {supplier.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" />
                  {supplier.email}
                </span>
              )}
              {supplier.address && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {supplier.address}
                </span>
              )}
              {supplier.payment_terms && (
                <span className="flex items-center gap-1">
                  <CreditCard className="h-3.5 w-3.5" />
                  {supplier.payment_terms}
                </span>
              )}
            </div>
          </div>
        </div>
        <Button variant="outline" onClick={() => setIsEditOpen(true)}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Purchase Orders"
          value={stats?.total_pos ?? '—'}
          sub={`${stats?.received_pos ?? 0} received · ${stats?.pending_pos ?? 0} pending`}
        />
        <StatCard
          title="Total Spend"
          value={stats ? formatCurrency(stats.total_spend) : '—'}
          color="text-primary"
          sub="across all POs"
        />
        <StatCard
          title="Received POs"
          value={stats?.received_pos ?? '—'}
          sub={`${stats?.cancelled_pos ?? 0} cancelled`}
          color="text-green-600"
        />
        <StatCard
          title="Last Order"
          value={stats?.last_order_date ? formatDate(stats.last_order_date) : 'Never'}
          sub={stats?.pending_pos ? `${stats.pending_pos} PO${stats.pending_pos > 1 ? 's' : ''} still open` : undefined}
        />
      </div>

      {/* Spend Chart */}
      {stats && stats.monthly_spend.some(d => d.amount > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Spend — Last 12 Months</CardTitle>
            <CardDescription>
              Total: {formatCurrency(stats.total_spend)}
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-8">
            <SpendChart data={stats.monthly_spend} />
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="purchase-orders">
        <TabsList>
          <TabsTrigger value="purchase-orders">
            Purchase Orders ({poHistory?.total ?? 0})
          </TabsTrigger>
          <TabsTrigger value="products">
            Top Products ({topProducts.length})
          </TabsTrigger>
          <TabsTrigger value="inventory">
            Inventory ({productInventory.length})
          </TabsTrigger>
        </TabsList>

        {/* Purchase Orders Tab */}
        <TabsContent value="purchase-orders" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Purchase Order History</CardTitle>
              <CardDescription>All POs raised for this supplier</CardDescription>
            </CardHeader>
            <CardContent>
              {!poHistory || poHistory.data.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No purchase orders yet.</p>
              ) : (
                <>
                  <div className="border rounded-lg overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>PO Number</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Branch</TableHead>
                          <TableHead>Expected Delivery</TableHead>
                          <TableHead>Actual Delivery</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(poHistory.data as any[]).map((po) => {
                          const cfg = poStatusConfig[po.status] ?? { label: po.status, variant: 'outline', icon: null }
                          return (
                            <TableRow key={po.id}>
                              <TableCell className="font-mono text-sm font-medium">{po.po_number}</TableCell>
                              <TableCell className="text-sm">{formatDate(po.po_date)}</TableCell>
                              <TableCell className="text-sm">{(po.branch as any)?.name || '—'}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatDate(po.expected_delivery_date)}
                              </TableCell>
                              <TableCell className="text-sm">
                                {po.actual_delivery_date
                                  ? <span className="text-green-600">{formatDate(po.actual_delivery_date)}</span>
                                  : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                              <TableCell>
                                <Badge variant={cfg.variant} className="flex items-center gap-1 w-fit">
                                  {cfg.icon}
                                  {cfg.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {formatCurrency(po.total_amount)}
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" asChild title="View PO">
                                  <Link href={`/purchases/${po.id}`}>
                                    <ExternalLink className="h-4 w-4" />
                                  </Link>
                                </Button>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <span className="text-sm text-muted-foreground">
                        Page {poPage} of {totalPages} · {poHistory.total} total
                      </span>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setPoPage(p => Math.max(1, p - 1))} disabled={poPage === 1}>
                          <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setPoPage(p => Math.min(totalPages, p + 1))} disabled={poPage === totalPages}>
                          Next <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Top Products Tab */}
        <TabsContent value="products" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Products Sourced from This Supplier</CardTitle>
              <CardDescription>Based on received and open purchase orders, ranked by total spend</CardDescription>
            </CardHeader>
            <CardContent>
              {topProducts.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No product data yet.</p>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Total Ordered</TableHead>
                        <TableHead className="text-right">PO Count</TableHead>
                        <TableHead className="text-right">Total Spend</TableHead>
                        <TableHead className="text-right">Avg / PO</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topProducts.map((p, i) => (
                        <TableRow key={p.product_id}>
                          <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                          <TableCell className="font-mono text-sm">{p.product_code}</TableCell>
                          <TableCell className="font-medium">
                            <Link href={`/products/${p.product_id}`} className="hover:underline hover:text-primary flex items-center gap-1">
                              {p.product_name}
                              <ExternalLink className="h-3 w-3 opacity-40" />
                            </Link>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {p.total_ordered.toLocaleString()} <span className="text-xs text-muted-foreground">{p.uom}</span>
                          </TableCell>
                          <TableCell className="text-right">{p.po_count}</TableCell>
                          <TableCell className="text-right font-semibold text-primary">
                            {formatCurrency(p.total_spend)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground text-sm">
                            {formatCurrency(p.po_count > 0 ? p.total_spend / p.po_count : 0)}
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

        {/* Inventory / Replenishment Tab */}
        <TabsContent value="inventory" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Stock Levels for Products Sourced from This Supplier</CardTitle>
                <CardDescription>
                  Sorted lowest quantity first — what needs replenishing. Items at zero for 30+ days
                  are greyed out at the bottom. Check items to copy their names for a restock request.
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={handleCopyNames}
                disabled={checkedRows.size === 0}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy Names ({checkedRows.size})
              </Button>
            </CardHeader>
            <CardContent>
              {productInventory.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No product data yet.</p>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">
                          <Checkbox
                            checked={allInventoryChecked}
                            onCheckedChange={v => toggleAllRows(!!v)}
                            aria-label="Select all"
                          />
                        </TableHead>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead className="text-right">On Hand</TableHead>
                        <TableHead>Last Movement</TableHead>
                        <TableHead>Price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productInventory.map((row, i) => {
                        const key = rowKey(row)
                        return (
                        <TableRow
                          key={key}
                          className={row.is_stale_zero ? 'opacity-60 bg-muted/30' : ''}
                        >
                          <TableCell>
                            <Checkbox
                              checked={checkedRows.has(key)}
                              onCheckedChange={v => toggleRow(key, !!v)}
                              aria-label={`Select ${row.product_name}`}
                            />
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                          <TableCell className="font-mono text-sm">{row.product_code}</TableCell>
                          <TableCell className="font-medium">
                            <Link href={`/products/${row.product_id}`} className="hover:underline hover:text-primary flex items-center gap-1">
                              {row.product_name}
                              <ExternalLink className="h-3 w-3 opacity-40" />
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm">{row.branch_name}</TableCell>
                          <TableCell className={`text-right font-mono ${row.quantity_on_hand === 0 ? 'text-red-600' : ''}`}>
                            {row.quantity_on_hand.toLocaleString()} <span className="text-xs text-muted-foreground">{row.uom}</span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {row.has_inventory_record ? formatDate(row.last_movement_at) : 'Not yet received'}
                          </TableCell>
                          <TableCell>
                            {row.own_best_unit_cost === null ? (
                              <span className="text-xs text-muted-foreground">No price history</span>
                            ) : row.supplier_count <= 1 ? (
                              <Badge variant="outline" className="text-muted-foreground">Only Supplier</Badge>
                            ) : row.is_cheapest_supplier ? (
                              <Badge variant="secondary" className="text-[10px] py-0 h-4">Cheapest</Badge>
                            ) : (
                              <Badge variant="outline">
                                {formatCurrency(row.price_diff ?? 0)} more than {row.cheapest_supplier_name}
                              </Badge>
                            )}
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
        </TabsContent>
      </Tabs>

      <EditSupplierDialog supplier={supplier} open={isEditOpen} onClose={() => setIsEditOpen(false)} />
    </div>
  )
}
