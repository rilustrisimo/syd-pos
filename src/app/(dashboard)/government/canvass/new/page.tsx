'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Package, PenLine, Loader2, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/stores/auth'
import { useBranches } from '@/hooks/useInventory'
import { usePOSProductSearch } from '@/hooks/useTransactions'
import { useCreateGovernmentCanvas } from '@/hooks/useGovernmentCanvases'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import Link from 'next/link'

function round2(n: number) { return Math.round(n * 100) / 100 }
function fmt(n: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(n)
}

interface CanvasLineRow {
  id: string
  type: 'inventory' | 'custom'
  // inventory
  product_id?: string
  product_code?: string
  product_name?: string
  uom_id?: string
  uom_name?: string
  cogs_per_unit?: number
  // custom
  line_description?: string
  unit_label?: string
  // common
  quantity: number
  unit_price: number
  discount_amount: number
}

export default function NewGovernmentCanvass() {
  const router = useRouter()
  const { user } = useAuthStore()
  const { data: branches = [] } = useBranches()

  const [branchId, setBranchId] = useState('')
  const [agency, setAgency] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [poNumber, setPoNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [canvasDate, setCanvasDate] = useState(new Date().toISOString().slice(0, 10))
  const [lines, setLines] = useState<CanvasLineRow[]>([])

  // Inventory search state
  const [productSearch, setProductSearch] = useState('')
  const { data: searchResults, isLoading: isSearching } = usePOSProductSearch(productSearch, branchId)

  const createCanvas = useCreateGovernmentCanvas()

  // Computed totals
  const subtotal = lines.reduce((s, l) => s + round2(l.quantity * l.unit_price), 0)
  const totalDiscount = lines.reduce((s, l) => s + l.discount_amount, 0)
  const totalAmount = round2(subtotal - totalDiscount)

  function addInventoryItem(product: any) {
    setLines(prev => [...prev, {
      id: `${Date.now()}`,
      type: 'inventory',
      product_id: product.id,
      product_code: product.code,
      product_name: product.name,
      uom_id: product.selling_uom_id || product.base_uom_id,
      uom_name: product.uom?.code || 'pc',
      cogs_per_unit: product.latest_cogs || 0,
      quantity: 1,
      unit_price: product.current_selling_price || 0,
      discount_amount: 0,
    }])
    setProductSearch('')
  }

  function addCustomItem() {
    setLines(prev => [...prev, {
      id: `custom-${Date.now()}`,
      type: 'custom',
      line_description: '',
      unit_label: 'pc',
      quantity: 1,
      unit_price: 0,
      discount_amount: 0,
    }])
  }

  function updateLine(id: string, field: keyof CanvasLineRow, value: any) {
    setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l))
  }

  function removeLine(id: string) {
    setLines(prev => prev.filter(l => l.id !== id))
  }

  async function handleSubmit() {
    if (!branchId) { toast.error('Select a branch'); return }
    if (!agency.trim()) { toast.error('Agency name is required'); return }
    if (lines.length === 0) { toast.error('Add at least one item'); return }

    const invalidLine = lines.find(l => l.type === 'custom' && !l.line_description?.trim())
    if (invalidLine) { toast.error('All custom items need a description'); return }

    try {
      const canvas = await createCanvas.mutateAsync({
        input: {
          branch_id: branchId,
          government_agency: agency,
          contact_person: contactPerson || null,
          po_number: poNumber || null,
          notes: notes || null,
          canvas_date: canvasDate,
          subtotal,
          discount_amount: totalDiscount,
          discount_percentage: subtotal > 0 ? round2((totalDiscount / subtotal) * 100) : 0,
          delivery_fee: 0,
          other_fees: 0,
          total_amount: totalAmount,
        },
        lines: lines.map(l => ({
          product_id: l.product_id || null,
          uom_id: l.uom_id || null,
          quantity: l.quantity,
          unit_price: l.unit_price,
          cogs_per_unit: l.cogs_per_unit || 0,
          discount_amount: l.discount_amount,
          line_description: l.line_description || null,
          unit_label: l.unit_label || null,
        })),
        userId: user?.id || '',
      })
      toast.success('Canvass created!')
      router.push(`/government/canvass/${(canvas as any).id}`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create canvass')
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/government/canvass">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
        </Link>
        <h1 className="text-2xl font-bold">New Government Canvass</h1>
      </div>

      {/* Header fields */}
      <Card>
        <CardHeader><CardTitle className="text-base">Canvass Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="col-span-2 grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Branch <span className="text-destructive">*</span></Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  {(branches as any[]).map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={canvasDate} onChange={e => setCanvasDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Government Agency <span className="text-destructive">*</span></Label>
            <Input placeholder="e.g. DepEd Division Office Bukidnon" value={agency} onChange={e => setAgency(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Contact Person</Label>
            <Input placeholder="Attention (optional)" value={contactPerson} onChange={e => setContactPerson(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>PO Number</Label>
            <Input placeholder="Leave blank if not yet awarded" value={poNumber} onChange={e => setPoNumber(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input placeholder="Optional notes" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Item entry */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs defaultValue="inventory">
            <TabsList>
              <TabsTrigger value="inventory"><Package className="h-4 w-4 mr-1.5" />From Inventory</TabsTrigger>
              <TabsTrigger value="custom"><PenLine className="h-4 w-4 mr-1.5" />Custom Item</TabsTrigger>
            </TabsList>
            <TabsContent value="inventory" className="mt-3">
              <div className="relative">
                <Input
                  placeholder="Search product by name or code…"
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  disabled={!branchId}
                />
                {!branchId && <p className="text-xs text-muted-foreground mt-1">Select a branch first to search products.</p>}
                {isSearching && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
                {searchResults && searchResults.length > 0 && productSearch.length >= 2 && (
                  <div className="absolute z-10 mt-1 w-full bg-popover border rounded-md shadow-md max-h-64 overflow-auto">
                    {(searchResults as any[]).map((p: any) => (
                      <button
                        key={p.id}
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted/60 text-left"
                        onClick={() => addInventoryItem(p)}
                      >
                        <span>
                          <span className="font-mono text-xs text-muted-foreground mr-2">{p.code}</span>
                          {p.name}
                        </span>
                        <span className="text-muted-foreground text-xs">{fmt(p.current_selling_price)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="custom" className="mt-3">
              <Button variant="outline" size="sm" onClick={addCustomItem}>
                <Plus className="h-4 w-4 mr-1" />Add Custom Item
              </Button>
            </TabsContent>
          </Tabs>

          {/* Lines table */}
          {lines.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="grid grid-cols-[1fr_80px_80px_100px_80px_36px] gap-2 text-xs font-semibold text-muted-foreground px-1">
                <span>Description</span><span className="text-center">Qty</span><span className="text-center">Unit</span><span className="text-right">Unit Price</span><span className="text-right">Total</span><span />
              </div>
              {lines.map((line) => (
                <div key={line.id} className="grid grid-cols-[1fr_80px_80px_100px_80px_36px] gap-2 items-center">
                  {line.type === 'inventory' ? (
                    <div className="text-sm">
                      <span className="font-mono text-xs text-muted-foreground mr-1">{line.product_code}</span>
                      {line.product_name}
                    </div>
                  ) : (
                    <Input
                      placeholder="Item description"
                      className="h-8 text-sm"
                      value={line.line_description || ''}
                      onChange={e => updateLine(line.id, 'line_description', e.target.value)}
                    />
                  )}
                  <Input
                    type="number"
                    className="h-8 text-sm text-center"
                    value={line.quantity}
                    min={0.01}
                    step="any"
                    onChange={e => updateLine(line.id, 'quantity', parseFloat(e.target.value) || 0)}
                  />
                  {line.type === 'inventory' ? (
                    <div className="text-sm text-center text-muted-foreground">{line.uom_name}</div>
                  ) : (
                    <Input
                      placeholder="unit"
                      className="h-8 text-sm text-center"
                      value={line.unit_label || ''}
                      onChange={e => updateLine(line.id, 'unit_label', e.target.value)}
                    />
                  )}
                  <Input
                    type="number"
                    className="h-8 text-sm text-right"
                    value={line.unit_price}
                    min={0}
                    step="any"
                    onChange={e => updateLine(line.id, 'unit_price', parseFloat(e.target.value) || 0)}
                  />
                  <div className="text-sm text-right font-medium">
                    {fmt(round2(line.quantity * line.unit_price))}
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => removeLine(line.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Totals + Submit */}
      <div className="flex justify-between items-end gap-4">
        <div className="text-sm text-muted-foreground">{lines.length} item{lines.length !== 1 ? 's' : ''}</div>
        <div className="flex items-center gap-6">
          <div className="text-right space-y-1">
            {totalDiscount > 0 && (
              <>
                <div className="text-sm text-muted-foreground">Subtotal: {fmt(subtotal)}</div>
                <div className="text-sm text-green-600">Discount: −{fmt(totalDiscount)}</div>
              </>
            )}
            <div className="text-xl font-bold">Total: {fmt(totalAmount)}</div>
          </div>
          <Button size="lg" onClick={handleSubmit} disabled={createCanvas.isPending}>
            {createCanvas.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Canvass
          </Button>
        </div>
      </div>
    </div>
  )
}
