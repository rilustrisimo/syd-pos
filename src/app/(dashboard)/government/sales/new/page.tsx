'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Trash2, Search, User, ClipboardList, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/stores/auth'
import { useBranches } from '@/hooks/useInventory'
import { usePOSProductSearch } from '@/hooks/useTransactions'
import { useAllActiveCustomers } from '@/hooks/useCustomers'
import { useCreateGovernmentTransaction } from '@/hooks/useGovernmentTransactions'
import { useGovernmentCanvases, useGovernmentCanvas } from '@/hooks/useGovernmentCanvases'
import { useGovernmentSaleStore } from '@/lib/stores/governmentSaleStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

function round2(n: number) { return Math.round(n * 100) / 100 }
function fmt(n: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(n)
}

function NewGovernmentSaleInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromCanvasId = searchParams.get('canvas')

  const { user } = useAuthStore()
  const store = useGovernmentSaleStore()
  const { data: branches = [] } = useBranches()
  const { data: allCustomers = [] } = useAllActiveCustomers()
  const createTxn = useCreateGovernmentTransaction()

  const [productSearch, setProductSearch] = useState('')
  const [customerOpen, setCustomerOpen] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [canvasSearch, setCanvasSearch] = useState('')
  const [canvasOpen, setCanvasOpen] = useState(false)

  // Load canvasses for picker
  const { data: canvasesData } = useGovernmentCanvases(1, 50)
  const allCanvases = canvasesData?.data || []
  const filteredCanvases = canvasSearch
    ? allCanvases.filter((c: any) =>
        c.canvas_number?.toLowerCase().includes(canvasSearch.toLowerCase()) ||
        c.government_agency?.toLowerCase().includes(canvasSearch.toLowerCase())
      )
    : allCanvases

  // If arriving from "Convert to Sale" on a canvass detail, pre-select that canvass
  const { data: preloadCanvas } = useGovernmentCanvas(fromCanvasId || undefined)
  useEffect(() => {
    if (preloadCanvas && !store.canvasId) {
      const c = preloadCanvas as any
      store.setCanvasReference(c.id, c.canvas_number, c.total_amount)
      if (c.government_agency) store.setGovernmentAgency(c.government_agency)
      if (c.po_number) store.setPoNumber(c.po_number)
      if (c.branch_id) store.setBranchId(c.branch_id)
      if (c.customer && !store.customer) {
        store.setCustomer({
          id: c.customer.id,
          name: c.customer.name,
          phone: c.customer.phone || null,
          customer_type: 'government',
          credit_limit: 0,
          outstanding_balance: 0,
        })
      }
    }
  }, [preloadCanvas])

  const govCustomers = (allCustomers as any[]).filter((c: any) => c.customer_type === 'government')
  const filteredCustomers = customerSearch
    ? govCustomers.filter((c: any) =>
        c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        (c.phone || '').includes(customerSearch)
      )
    : govCustomers

  const { data: searchResults, isLoading: isSearching } = usePOSProductSearch(
    productSearch,
    store.branchId || ''
  )

  const gross = store.getGrossTotal()
  const withholding = store.getWithholdingAmount()
  const net = store.getNetReceivable()
  const budgetExceeded = store.isBudgetExceeded()
  const remainingBudget = store.getRemainingBudget()

  function selectCanvas(c: any) {
    store.setCanvasReference(c.id, c.canvas_number, c.total_amount)
    if (c.government_agency) store.setGovernmentAgency(c.government_agency)
    if (c.po_number) store.setPoNumber(c.po_number)
    if (c.branch_id && !store.branchId) store.setBranchId(c.branch_id)
    // Auto-populate customer from canvass if one is linked and none is selected yet
    if (c.customer && !store.customer) {
      store.setCustomer({
        id: c.customer.id,
        name: c.customer.name,
        phone: c.customer.phone || null,
        customer_type: 'government',
        credit_limit: 0,
        outstanding_balance: 0,
      })
    }
    setCanvasOpen(false)
  }

  function handleAddProduct(p: any) {
    store.addItem({
      product_id:      p.id,
      product_code:    p.code,
      product_name:    p.name,
      variant_id:      null,
      variant_name:    null,
      quantity:        1,
      uom_id:          p.selling_uom_id || p.uom_id,
      uom_name:        p.selling_uom_abbreviation || p.uom_abbreviation || 'pc',
      unit_price:      p.unit_price || 0,
      cogs_per_unit:   p.cogs || 0,
      discount_amount: 0,
    })
    setProductSearch('')
  }

  function selectCustomer(c: any) {
    store.setCustomer({
      id: c.id,
      name: c.name,
      phone: c.phone || null,
      customer_type: 'government',
      credit_limit: c.credit_limit || 0,
      outstanding_balance: c.outstanding_balance || 0,
    })
    setCustomerOpen(false)
  }

  async function handleSubmit() {
    if (!store.canvasId) { toast.error('Select a canvass reference first'); return }
    if (!store.branchId) { toast.error('Select a branch'); return }
    if (!store.customer) { toast.error('Select a government customer'); return }
    if (!store.poNumber.trim()) { toast.error('PO Number is required'); return }
    if (store.items.length === 0) { toast.error('Add at least one item'); return }
    if (budgetExceeded) {
      toast.error(`Sale total (${fmt(gross)}) exceeds the canvass budget (${fmt(store.canvasTotalBudget)})`)
      return
    }

    try {
      const lines = store.items.map(item => ({
        product_id:      item.product_id,
        variant_id:      item.variant_id,
        quantity:        item.quantity,
        uom_id:          item.uom_id,
        unit_price:      item.unit_price,
        cogs_per_unit:   item.cogs_per_unit,
        discount_amount: item.discount_amount,
      }))

      const txn = await createTxn.mutateAsync({
        input: {
          branch_id:         store.branchId,
          customer_id:       store.customer.id,
          transaction_type:  'sale',
          delivery_type:     'pickup',
          notes:             store.notes || null,
          transaction_date:  store.saleDate,
          subtotal:          gross,
          discount_amount:   store.items.reduce((s, i) => s + i.discount_amount, 0),
          delivery_fee:      0,
          other_fees:        0,
          total_amount:      gross,
          amount_paid:       0,
          payment_status:    'unpaid',
          is_government_sale: true,
          po_number:         store.poNumber,
          government_agency: store.governmentAgency,
          withholding_rate:  store.withholdingRate,
          withholding_amount: withholding,
          canvas_id:         store.canvasId,
        } as any,
        lines,
        payments: [],
        userId: user?.id || '',
      })

      store.resetAll()
      toast.success('Government sale created!')
      router.push(`/government/sales/${(txn as any).id}`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create sale')
    }
  }

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* Left: canvass picker + product search + cart */}
      <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto border-r">
        <div className="flex items-center gap-2">
          <Link href="/government/sales">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
          </Link>
          <h1 className="text-lg font-bold">New Government Sale</h1>
        </div>

        {/* ── Step 1: Canvass Reference (required) ── */}
        <Card className={store.canvasId ? 'border-blue-200 bg-blue-50/40' : 'border-orange-200 bg-orange-50/40'}>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <ClipboardList className="h-4 w-4" />
              Canvass Reference
              <span className="text-destructive ml-0.5">*</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {store.canvasId ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">{store.canvasNumber}</p>
                  <p className="text-xs text-muted-foreground">Budget cap: {fmt(store.canvasTotalBudget)}</p>
                </div>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => store.clearCanvasReference()}>
                  Change
                </Button>
              </div>
            ) : (
              <Popover open={canvasOpen} onOpenChange={setCanvasOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start h-9 text-sm text-muted-foreground">
                    <ClipboardList className="h-4 w-4 mr-2" />
                    Select a government canvass…
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-96 p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search by canvass# or agency…"
                      value={canvasSearch}
                      onValueChange={setCanvasSearch}
                    />
                    <CommandList className="max-h-64">
                      <CommandEmpty>
                        No canvasses found.{' '}
                        <Link href="/government/canvass/new" className="underline text-xs">Create one</Link>
                      </CommandEmpty>
                      <CommandGroup>
                        {(filteredCanvases as any[]).map((c: any) => (
                          <CommandItem key={c.id} onSelect={() => selectCanvas(c)} className="cursor-pointer">
                            <div className="flex items-center justify-between w-full">
                              <div>
                                <p className="text-sm font-medium">{c.canvas_number}</p>
                                <p className="text-xs text-muted-foreground">{c.government_agency}</p>
                              </div>
                              <span className="text-sm font-semibold">{fmt(c.total_amount)}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </CardContent>
        </Card>

        {/* Budget warning */}
        {store.canvasId && budgetExceeded && (
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Sale total ({fmt(gross)}) exceeds canvass budget ({fmt(store.canvasTotalBudget)}) by {fmt(-remainingBudget)}.
              Reduce item quantities or prices to proceed.
            </AlertDescription>
          </Alert>
        )}

        {/* Branch + Date */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Branch</Label>
            <Select value={store.branchId || ''} onValueChange={store.setBranchId}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Select branch" /></SelectTrigger>
              <SelectContent>
                {(branches as any[]).map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sale Date</Label>
            <Input type="date" className="h-8 text-sm" value={store.saleDate} onChange={e => store.setSaleDate(e.target.value)} />
          </div>
        </div>

        {/* Product search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search product…"
            value={productSearch}
            onChange={e => setProductSearch(e.target.value)}
            disabled={!store.branchId}
          />
          {!store.branchId && <p className="text-xs text-muted-foreground mt-1">Select a branch first.</p>}
          {isSearching && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
          {searchResults && searchResults.length > 0 && productSearch.length >= 2 && (
            <div className="absolute z-10 mt-1 w-full bg-popover border rounded-md shadow-md max-h-56 overflow-auto">
              {(searchResults as any[]).map((p: any) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted/60 text-left"
                  onClick={() => handleAddProduct(p)}
                >
                  <span>
                    <span className="font-mono text-xs text-muted-foreground mr-2">{p.code}</span>
                    {p.name}
                  </span>
                  <span className="text-muted-foreground text-xs">{fmt(p.unit_price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cart items */}
        {store.items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            {store.canvasId ? 'Search and add products above' : 'Select a canvass first, then add products'}
          </div>
        ) : (
          <div className="space-y-2 flex-1">
            {store.items.map(item => (
              <Card key={item.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">{item.product_code}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 flex-shrink-0" onClick={() => store.removeItem(item.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div className="space-y-0.5">
                    <Label className="text-xs">Qty ({item.uom_name})</Label>
                    <Input
                      type="number"
                      className="h-7 text-sm"
                      value={item.quantity}
                      min={0.01}
                      step="any"
                      onChange={e => store.updateItemQuantity(item.id, parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-xs">Unit Price</Label>
                    <Input
                      type="number"
                      className="h-7 text-sm"
                      value={item.unit_price}
                      min={0}
                      step="any"
                      onChange={e => store.updateItemUnitPrice(item.id, parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-xs">Discount</Label>
                    <Input
                      type="number"
                      className="h-7 text-sm"
                      value={item.discount_amount}
                      min={0}
                      step="any"
                      onChange={e => store.updateItemDiscount(item.id, parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <div className="mt-1.5 text-right text-sm font-bold">
                  {fmt(round2(item.quantity * item.unit_price - item.discount_amount))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Right: customer + gov fields + totals */}
      <div className="w-80 flex flex-col p-4 gap-4 overflow-y-auto bg-muted/20">
        {/* Customer selector */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Government Customer <span className="text-destructive">*</span></Label>
          <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start h-9 text-sm">
                <User className="h-4 w-4 mr-2 text-muted-foreground" />
                {store.customer ? store.customer.name : 'Select agency customer'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput placeholder="Search government customers…" value={customerSearch} onValueChange={setCustomerSearch} />
                <CommandList>
                  <CommandEmpty>No government customers found. <Link href="/customers" className="underline text-xs">Add one</Link></CommandEmpty>
                  <CommandGroup>
                    {filteredCustomers.slice(0, 20).map((c: any) => (
                      <CommandItem key={c.id} onSelect={() => selectCustomer(c)} className="cursor-pointer">
                        <User className="h-4 w-4 mr-2 text-muted-foreground" />
                        {c.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* PO Number */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">PO Number <span className="text-destructive">*</span></Label>
          <Input className="h-8 text-sm" placeholder="Required" value={store.poNumber} onChange={e => store.setPoNumber(e.target.value)} />
        </div>

        {/* Agency */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Government Agency</Label>
          <Input className="h-8 text-sm" value={store.governmentAgency} onChange={e => store.setGovernmentAgency(e.target.value)} />
        </div>

        {/* Withholding rate */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Withholding Rate (%)</Label>
          <Input
            type="number"
            className="h-8 text-sm"
            value={store.withholdingRate}
            min={0}
            max={100}
            step="0.5"
            onChange={e => store.setWithholdingRate(parseFloat(e.target.value) || 0)}
          />
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Notes</Label>
          <Input className="h-8 text-sm" placeholder="Optional" value={store.notes} onChange={e => store.setNotes(e.target.value)} />
        </div>

        <Separator />

        {/* Budget tracker */}
        {store.canvasId && (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Canvass budget</span>
              <span>{fmt(store.canvasTotalBudget)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Sale total</span>
              <span className={budgetExceeded ? 'text-destructive' : ''}>{fmt(gross)}</span>
            </div>
            <div className={`flex justify-between text-xs font-medium ${budgetExceeded ? 'text-destructive' : 'text-green-600'}`}>
              <span>{budgetExceeded ? 'Over budget by' : 'Remaining budget'}</span>
              <span>{budgetExceeded ? fmt(-remainingBudget) : fmt(remainingBudget)}</span>
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-1">
              <div
                className={`h-full rounded-full transition-all ${budgetExceeded ? 'bg-destructive' : 'bg-green-500'}`}
                style={{ width: `${Math.min(100, store.canvasTotalBudget > 0 ? (gross / store.canvasTotalBudget) * 100 : 0)}%` }}
              />
            </div>
          </div>
        )}

        <Separator />

        {/* Withholding totals */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Gross Total</span>
            <span className="font-semibold">{fmt(gross)}</span>
          </div>
          <div className="flex justify-between text-red-600">
            <span>Withholding ({store.withholdingRate}%)</span>
            <span>−{fmt(withholding)}</span>
          </div>
          <Separator />
          <div className="flex justify-between text-base font-bold">
            <span>Net Receivable</span>
            <span className="text-blue-700">{fmt(net)}</span>
          </div>
        </div>

        <Button
          size="lg"
          className="w-full mt-auto"
          onClick={handleSubmit}
          disabled={createTxn.isPending || store.items.length === 0 || !store.canvasId || budgetExceeded}
        >
          {createTxn.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {budgetExceeded ? 'Budget Exceeded' : 'Create Government Sale'}
        </Button>
      </div>
    </div>
  )
}

export default function NewGovernmentSale() {
  return (
    <Suspense>
      <NewGovernmentSaleInner />
    </Suspense>
  )
}
