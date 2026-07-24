'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ArrowLeft, User } from 'lucide-react'
import { toast } from 'sonner'
import type { Canvas } from '@syd/api'
import { useBranches } from '@/hooks/useInventory'
import { useAllActiveCustomers } from '@/hooks/useCustomers'
import {
  useGovernmentCanvas,
  useCanvasLinkedTransaction,
  useUpdateGovernmentCanvasFull,
} from '@/hooks/useGovernmentCanvases'
import { CanvasLineEditor, round2, fmt, type CanvasLineRow } from '@/components/government/canvas-line-editor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

function toLineRow(l: any): CanvasLineRow {
  return {
    id: l.id,
    type: l.product_id ? 'inventory' : 'custom',
    product_id: l.product_id || undefined,
    product_code: l.product?.code,
    product_name: l.product?.name,
    uom_id: l.uom_id || undefined,
    uom_name: l.unit_label || l.uom?.code || l.uom?.name || 'pc',
    cogs_per_unit: l.cogs_per_unit || 0,
    line_description: l.line_description || undefined,
    unit_label: l.unit_label || undefined,
    quantity: l.quantity,
    unit_price: l.unit_price,
    base_unit_price: l.base_unit_price ?? null,
    discount_amount: l.discount_amount || 0,
  }
}

export default function EditGovernmentCanvass() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: canvas, isLoading } = useGovernmentCanvas(id)
  const { data: linkedTransaction, isLoading: isLoadingLinked } = useCanvasLinkedTransaction(id)

  // Redirect away once we know the canvass is already tied to a sale — it
  // can no longer be edited.
  useEffect(() => {
    if (!isLoadingLinked && linkedTransaction) {
      toast.error(`Cannot edit — linked to sale ${linkedTransaction.transaction_number}`)
      router.replace(`/government/canvass/${id}`)
    }
  }, [isLoadingLinked, linkedTransaction, id, router])

  if (isLoading || isLoadingLinked || linkedTransaction) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (!canvas) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Canvass not found.</p>
        <Link href="/government/canvass"><Button variant="link">Back to canvasses</Button></Link>
      </div>
    )
  }

  return <CanvasEditForm canvas={canvas} />
}

// Mounted only once the canvas has loaded, so all form state can be
// initialized directly from it — no prefill effect needed.
function CanvasEditForm({ canvas }: { canvas: Canvas }) {
  const c = canvas as any
  const router = useRouter()
  const { data: branches = [] } = useBranches()
  const { data: allCustomers = [] } = useAllActiveCustomers()
  const updateCanvas = useUpdateGovernmentCanvasFull()

  const [branchId, setBranchId] = useState(c.branch_id || '')
  const [customerId, setCustomerId] = useState<string | null>(c.customer_id || null)
  const [customerName, setCustomerName] = useState(c.customer?.name || '')
  const [agency, setAgency] = useState(c.government_agency || '')
  const [contactPerson, setContactPerson] = useState(c.contact_person || '')
  const [poNumber, setPoNumber] = useState(c.po_number || '')
  const [notes, setNotes] = useState(c.notes || '')
  const [canvasDate, setCanvasDate] = useState((c.canvas_date || '').slice(0, 10) || new Date().toISOString().slice(0, 10))
  const [lines, setLines] = useState<CanvasLineRow[]>((c.lines || []).map(toLineRow))
  const [markupPercentage, setMarkupPercentage] = useState(c.markup_percentage || 0)

  const [customerOpen, setCustomerOpen] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')

  const govCustomers = (allCustomers as any[]).filter((cu: any) => cu.customer_type === 'government')
  const filteredCustomers = customerSearch
    ? govCustomers.filter((cu: any) =>
        cu.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        (cu.phone || '').includes(customerSearch)
      )
    : govCustomers

  function selectCustomer(cu: any) {
    setCustomerId(cu.id)
    setCustomerName(cu.name)
    setCustomerOpen(false)
    setCustomerSearch('')
  }

  function clearCustomer() {
    setCustomerId(null)
    setCustomerName('')
  }

  const subtotal = lines.reduce((s, l) => s + round2(l.quantity * l.unit_price), 0)
  const totalDiscount = lines.reduce((s, l) => s + l.discount_amount, 0)
  const totalAmount = round2(subtotal - totalDiscount)

  async function handleSubmit() {
    if (!branchId) { toast.error('Select a branch'); return }
    if (!agency.trim()) { toast.error('Agency name is required'); return }
    if (lines.length === 0) { toast.error('Add at least one item'); return }

    const invalidLine = lines.find(l => l.type === 'custom' && !l.line_description?.trim())
    if (invalidLine) { toast.error('All custom items need a description'); return }

    try {
      await updateCanvas.mutateAsync({
        id: c.id,
        input: {
          branch_id: branchId,
          customer_id: customerId || null,
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
          markup_percentage: markupPercentage,
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
          base_unit_price: l.base_unit_price ?? null,
        })),
      })
      toast.success('Canvass updated!')
      router.push(`/government/canvass/${c.id}`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to update canvass')
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/government/canvass/${c.id}`}>
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
        </Link>
        <h1 className="text-2xl font-bold">Edit Canvass {c.canvas_number}</h1>
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

          {/* Customer picker */}
          <div className="col-span-2 space-y-1.5">
            <Label>Government Customer Account</Label>
            {customerId ? (
              <div className="flex items-center gap-2 h-9 px-3 border rounded-md bg-muted/30 text-sm">
                <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="flex-1 font-medium">{customerName}</span>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearCustomer}>Change</Button>
              </div>
            ) : (
              <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start h-9 text-sm text-muted-foreground font-normal">
                    <User className="h-4 w-4 mr-2" />
                    Select government customer…
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search by name…"
                      value={customerSearch}
                      onValueChange={setCustomerSearch}
                    />
                    <CommandList className="max-h-56">
                      <CommandEmpty>
                        No government customers found.{' '}
                        <Link href="/customers" className="underline text-xs">Add one</Link>
                      </CommandEmpty>
                      <CommandGroup>
                        {filteredCustomers.slice(0, 20).map((cu: any) => (
                          <CommandItem key={cu.id} onSelect={() => selectCustomer(cu)} className="cursor-pointer">
                            <User className="h-4 w-4 mr-2 text-muted-foreground" />
                            {cu.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
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
        <CardContent>
          <CanvasLineEditor
            branchId={branchId}
            lines={lines}
            setLines={setLines}
            markupPercentage={markupPercentage}
            setMarkupPercentage={setMarkupPercentage}
          />
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
          <Button size="lg" onClick={handleSubmit} disabled={updateCanvas.isPending}>
            {updateCanvas.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  )
}
