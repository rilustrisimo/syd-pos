'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Trash2, Search, User, ClipboardList, AlertTriangle, CheckCircle2, X } from 'lucide-react'
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
  // Draft detection — evaluated once on mount before effects run
  const [showResumeBanner, setShowResumeBanner] = useState(() => store.items.length > 0)
  const hasDraft = store.items.length > 0 || !!store.canvasId

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

  const gross = store.getGrossTotal()           // actual items sold
  const withholding = store.getWithholdingAmount() // PO × rate
  const net = store.getNetReceivable()           // PO − withholding = cheque
  const spread = store.getSpread()               // cheque − items
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
          subtotal:          gross,            // actual items sold
          discount_amount:   store.items.reduce((s, i) => s + i.discount_amount, 0),
          delivery_fee:      0,
          other_fees:        0,
          total_amount:      store.canvasTotalBudget,  // PO amount — withholding is based on this
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
      {/* ── LEFT PANEL ── */}
      <div className="flex-1 flex flex-col overflow-hidden border-r">

        {/* ── STICKY ZONE: canvass + branch + search — never scrolls ── */}
        <div className="flex-shrink-0 bg-background border-b">

          {/* Header row */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b">
            <div className="flex items-center gap-2">
              <Link href="/government/sales">
                <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
              </Link>
              <h1 className="text-base font-bold">New Government Sale</h1>
              {store.items.length > 0 && (
                <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-1.5 py-0.5 rounded-full">
                  {store.items.length} item{store.items.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {hasDraft && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  Draft auto-saved
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:text-destructive"
                  onClick={() => { store.resetAll(); setShowResumeBanner(false); toast.info('Draft cleared') }}
                >
                  <X className="h-3 w-3 mr-1" />Discard
                </Button>
              </div>
            )}
          </div>

          {/* Resume draft banner */}
          {showResumeBanner && (
            <div className="flex items-center justify-between px-4 py-2 bg-amber-50 border-b border-amber-200 text-sm">
              <span className="text-amber-800">
                You have an unfinished draft with <strong>{store.items.length}</strong> item{store.items.length !== 1 ? 's' : ''}. Resume it or discard to start fresh.
              </span>
              <Button variant="ghost" size="sm" className="h-6 text-xs ml-3 flex-shrink-0" onClick={() => setShowResumeBanner(false)}>
                Dismiss
              </Button>
            </div>
          )}

          <div className="px-4 py-3 space-y-3">
            {/* Canvass picker (compact inline) */}
            <div className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${store.canvasId ? 'border-blue-200 bg-blue-50/40' : 'border-orange-200 bg-orange-50/40'}`}>
              <ClipboardList className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              {store.canvasId ? (
                <div className="flex-1 flex items-center justify-between min-w-0">
                  <div className="min-w-0">
                    <span className="font-semibold text-sm">{store.canvasNumber}</span>
                    <span className="text-xs text-muted-foreground ml-2">Budget: {fmt(store.canvasTotalBudget)}</span>
                    {store.canvasId && (
                      <span className={`text-xs ml-2 font-medium ${budgetExceeded ? 'text-destructive' : 'text-green-600'}`}>
                        ({budgetExceeded ? `over by ${fmt(-remainingBudget)}` : `${fmt(remainingBudget)} left`})
                      </span>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs h-6 flex-shrink-0" onClick={() => store.clearCanvasReference()}>
                    Change
                  </Button>
                </div>
              ) : (
                <Popover open={canvasOpen} onOpenChange={setCanvasOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" className="flex-1 justify-start h-7 text-sm text-muted-foreground p-0 hover:bg-transparent">
                      Select a government canvass… <span className="text-destructive ml-1">*</span>
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
                                <span className="text-sm font-semibold ml-4">{fmt(c.total_amount)}</span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* Budget bar */}
            {store.canvasId && (
              <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${budgetExceeded ? 'bg-destructive' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(100, store.canvasTotalBudget > 0 ? (gross / store.canvasTotalBudget) * 100 : 0)}%` }}
                />
              </div>
            )}

            {/* Branch + Date on their own row */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Branch <span className="text-destructive">*</span></Label>
                <Select value={store.branchId || ''} onValueChange={store.setBranchId}>
                  <SelectTrigger className="h-8 text-sm truncate"><SelectValue placeholder="Select branch" /></SelectTrigger>
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

            {/* Product search — full width */}
            <div className="space-y-1 relative">
              <Label className="text-xs">Add Product</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8 h-8 text-sm"
                  placeholder={!store.canvasId ? 'Select a canvass first' : !store.branchId ? 'Select a branch first' : 'Search by name or code…'}
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  disabled={!store.branchId || !store.canvasId}
                />
                {isSearching && <Loader2 className="absolute right-2.5 top-2 h-4 w-4 animate-spin text-muted-foreground" />}
                {searchResults && searchResults.length > 0 && productSearch.length >= 2 && (
                  <div className="absolute z-20 top-full mt-1 w-full bg-popover border rounded-md shadow-lg max-h-56 overflow-auto">
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
                        <span className="text-muted-foreground text-xs ml-4">{fmt(p.unit_price)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── SCROLLABLE ITEMS ZONE ── */}
        <div className="flex-1 overflow-y-auto">
          {store.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
              <Search className="h-8 w-8 opacity-20" />
              {store.canvasId ? 'Search and add products above' : 'Select a canvass reference first, then add products'}
            </div>
          ) : (
            <div className="p-4">
              {/* Column headers */}
              <div className="grid gap-2 text-xs font-medium text-muted-foreground mb-2 px-1"
                style={{ gridTemplateColumns: '20px 1fr 72px 44px 90px 78px 80px 28px' }}>
                <span>#</span>
                <span>Product</span>
                <span className="text-center">Qty</span>
                <span className="text-center">Unit</span>
                <span className="text-right">Unit Price</span>
                <span className="text-right">Discount</span>
                <span className="text-right">Total</span>
                <span />
              </div>
              {/* Item rows */}
              {store.items.map((item, idx) => (
                <div
                  key={item.id}
                  className="grid gap-2 items-center py-2 border-b last:border-0"
                  style={{ gridTemplateColumns: '20px 1fr 72px 44px 90px 78px 80px 28px' }}
                >
                  <span className="text-xs text-muted-foreground">{idx + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate leading-tight">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{item.product_code}</p>
                  </div>
                  <Input
                    type="number"
                    className="h-7 text-sm text-center px-1"
                    value={item.quantity}
                    min={0.01}
                    step="any"
                    onChange={e => store.updateItemQuantity(item.id, parseFloat(e.target.value) || 0)}
                  />
                  <span className="text-xs text-muted-foreground text-center">{item.uom_name}</span>
                  <Input
                    type="number"
                    className="h-7 text-sm text-right px-1"
                    value={item.unit_price}
                    min={0}
                    step="any"
                    onChange={e => store.updateItemUnitPrice(item.id, parseFloat(e.target.value) || 0)}
                  />
                  <Input
                    type="number"
                    className="h-7 text-sm text-right px-1"
                    value={item.discount_amount}
                    min={0}
                    step="any"
                    onChange={e => store.updateItemDiscount(item.id, parseFloat(e.target.value) || 0)}
                  />
                  <span className="text-sm font-semibold text-right">
                    {fmt(round2(item.quantity * item.unit_price - item.discount_amount))}
                  </span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => store.removeItem(item.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
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

        {/* Billing breakdown */}
        <div className="space-y-1.5 text-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Billing (based on PO)</p>
          <div className="flex justify-between">
            <span className="text-muted-foreground">PO / Canvass Amount</span>
            <span className="font-semibold">{fmt(store.canvasTotalBudget)}</span>
          </div>
          <div className="flex justify-between text-red-600">
            <span>Withholding ({store.withholdingRate}% of PO)</span>
            <span>−{fmt(withholding)}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-bold text-base">
            <span>Cheque Expected</span>
            <span className="text-blue-700">{fmt(net)}</span>
          </div>
        </div>

        <Separator />

        {/* Actual items + spread */}
        <div className="space-y-1.5 text-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actual Sale</p>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Items Total</span>
            <span className="font-semibold">{fmt(gross)}</span>
          </div>
          <Separator />
          <div className={`flex justify-between font-bold ${spread >= 0 ? 'text-green-600' : 'text-destructive'}`}>
            <span>{spread >= 0 ? 'Spread (Profit / Commission)' : 'Shortfall'}</span>
            <span>{spread >= 0 ? '+' : ''}{fmt(spread)}</span>
          </div>
          {spread !== 0 && (
            <p className="text-xs text-muted-foreground">
              {spread > 0
                ? 'Cheque exceeds actual items — difference is available as profit or commission.'
                : 'Items exceed cheque — you will absorb the shortfall.'}
            </p>
          )}
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
