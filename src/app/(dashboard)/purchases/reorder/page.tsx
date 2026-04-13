'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAutoReorderSuggestions, useCreatePurchaseOrder } from '@/hooks/usePurchases'
import { useBranches } from '@/hooks/useInventory'
import { useAuthStore } from '@/lib/stores/auth'
import { formatCurrency, formatDate } from '@/lib/utils/formatting'
import { NumericInput } from '@/components/ui/numeric-input'
import type { ReorderSuggestion, SupplierPriceOption } from '@/lib/supabase/queries/purchases'
import { toast } from 'sonner'
import {
  ArrowLeft, PackagePlus, AlertTriangle, Loader2,
  ShoppingCart, CheckCircle2, ChevronRight, RefreshCw,
  TrendingDown, CircleSlash, History,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

// ── Local state shape per product ────────────────────────────────────────────

interface ProductReorderState {
  product_id: string
  selected: boolean
  quantity: number
  selected_supplier_id: string
  unit_cost: number          // resolved from selected supplier or user-entered
  unit_cost_input: string    // raw string for editable no-history rows
}

function initState(s: ReorderSuggestion): ProductReorderState {
  const cheapest = s.suppliers.find(sup => sup.is_cheapest)
  return {
    product_id: s.product_id,
    selected: !s.no_history,           // no-history items deselected by default
    quantity: s.suggested_quantity,
    selected_supplier_id: s.selected_supplier_id,
    unit_cost: cheapest?.best_unit_cost ?? 0,
    unit_cost_input: cheapest ? String(cheapest.best_unit_cost) : '',
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSupplierForProduct(s: ReorderSuggestion, supplierId: string): SupplierPriceOption | undefined {
  return s.suppliers.find(sup => sup.supplier_id === supplierId)
}

function rowTotal(state: ProductReorderState): number {
  return state.quantity * state.unit_cost
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ReorderPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const { data: branches = [] } = useBranches()
  const [branchId, setBranchId] = useState<string>('')
  const [activeSupplierKey, setActiveSupplierKey] = useState<string>('') // 'supplier_id' or 'NO_HISTORY'

  const { data: suggestions = [], isLoading, refetch } = useAutoReorderSuggestions(branchId || undefined)
  const createPO = useCreatePurchaseOrder()

  // Local per-product state
  const [productStates, setProductStates] = useState<Record<string, ProductReorderState>>({})

  // Merge suggestions into productStates when data loads (only add new, don't overwrite edits)
  const mergedStates = useMemo<Record<string, ProductReorderState>>(() => {
    const merged: Record<string, ProductReorderState> = {}
    for (const s of suggestions) {
      merged[s.product_id] = productStates[s.product_id] ?? initState(s)
    }
    return merged
  }, [suggestions, productStates])

  const updateProduct = useCallback((productId: string, patch: Partial<ProductReorderState>) => {
    setProductStates(prev => ({
      ...prev,
      [productId]: { ...(prev[productId] ?? mergedStates[productId]), ...patch },
    }))
  }, [mergedStates])

  // ── Group suggestions by supplier ─────────────────────────────────────────

  const supplierGroups = useMemo(() => {
    const groups: Record<string, { supplier_id: string; supplier_name: string; items: ReorderSuggestion[] }> = {}
    const noHistory: ReorderSuggestion[] = []

    for (const s of suggestions) {
      const st = mergedStates[s.product_id]
      const sid = st?.selected_supplier_id || s.selected_supplier_id

      if (s.no_history || !sid) {
        noHistory.push(s)
        continue
      }

      if (!groups[sid]) {
        const sup = s.suppliers.find(x => x.supplier_id === sid)
        groups[sid] = { supplier_id: sid, supplier_name: sup?.supplier_name ?? 'Unknown Supplier', items: [] }
      }
      groups[sid].items.push(s)
    }

    const result = Object.values(groups).sort((a, b) => a.supplier_name.localeCompare(b.supplier_name))
    if (noHistory.length > 0) result.push({ supplier_id: 'NO_HISTORY', supplier_name: 'No Purchase History', items: noHistory })
    return result
  }, [suggestions, mergedStates])

  // Set default active group when data loads
  const effectiveActiveKey = activeSupplierKey || supplierGroups[0]?.supplier_id || ''

  // ── Supplier-level totals ─────────────────────────────────────────────────

  function supplierTotal(supplierId: string): number {
    const group = supplierGroups.find(g => g.supplier_id === supplierId)
    if (!group) return 0
    return group.items.reduce((sum, s) => {
      const st = mergedStates[s.product_id]
      if (!st?.selected) return sum
      return sum + rowTotal(st)
    }, 0)
  }

  function supplierSelectedCount(supplierId: string): number {
    const group = supplierGroups.find(g => g.supplier_id === supplierId)
    if (!group) return 0
    return group.items.filter(s => mergedStates[s.product_id]?.selected).length
  }

  function allSupplierSelected(supplierId: string): boolean {
    const group = supplierGroups.find(g => g.supplier_id === supplierId)
    if (!group || group.items.length === 0) return false
    return group.items.every(s => mergedStates[s.product_id]?.selected)
  }

  function toggleAllSupplier(supplierId: string, value: boolean) {
    const group = supplierGroups.find(g => g.supplier_id === supplierId)
    if (!group) return
    setProductStates(prev => {
      const next = { ...prev }
      for (const s of group.items) {
        next[s.product_id] = { ...(prev[s.product_id] ?? mergedStates[s.product_id]), selected: value }
      }
      return next
    })
  }

  // ── Grand total & PO count ─────────────────────────────────────────────────

  const { grandTotal, poCount } = useMemo(() => {
    let total = 0
    let pos = 0
    for (const group of supplierGroups) {
      if (group.supplier_id === 'NO_HISTORY') continue
      const selected = group.items.filter(s => mergedStates[s.product_id]?.selected)
      if (selected.length > 0) {
        pos++
        total += selected.reduce((sum, s) => sum + rowTotal(mergedStates[s.product_id]), 0)
      }
    }
    return { grandTotal: total, poCount: pos }
  }, [supplierGroups, mergedStates])

  // ── Create POs ────────────────────────────────────────────────────────────

  const [isCreating, setIsCreating] = useState(false)

  async function handleCreatePOs() {
    if (!user?.id) { toast.error('Not authenticated'); return }

    const today = new Date().toISOString().split('T')[0]
    const toCreate = supplierGroups.filter(g => g.supplier_id !== 'NO_HISTORY' && supplierSelectedCount(g.supplier_id) > 0)

    if (toCreate.length === 0) { toast.error('No items selected'); return }

    // Validate: no-history items that are selected must have a cost entered
    for (const group of toCreate) {
      for (const s of group.items) {
        const st = mergedStates[s.product_id]
        if (st?.selected && (!st.unit_cost || st.unit_cost <= 0)) {
          toast.error(`Enter a unit cost for "${s.product_name}" before creating PO`)
          return
        }
      }
    }

    setIsCreating(true)
    const toastId = toast.loading(`Creating ${toCreate.length} purchase order${toCreate.length > 1 ? 's' : ''}…`)

    try {
      const branchTarget = branchId || (branches as any[])[0]?.id
      let created = 0

      for (const group of toCreate) {
        const selectedItems = group.items.filter(s => mergedStates[s.product_id]?.selected)
        const lines = selectedItems.map(s => {
          const st = mergedStates[s.product_id]
          return {
            product_id: s.product_id,
            uom_id: s.base_uom.id,
            quantity_ordered: st.quantity,
            unit_cost: st.unit_cost,
          }
        })

        await createPO.mutateAsync({
          po: {
            supplier_id: group.supplier_id,
            branch_id: branchTarget,
            po_date: today,
            status: 'draft' as const,
            notes: 'Auto-generated from low stock reorder',
            total_amount: 0,
            expected_delivery_date: null,
            actual_delivery_date: null,
            delivery_charge: 0,
            created_by: user.id,
          } as any,
          lines: lines as any,
        })
        created++
      }

      toast.success(`${created} PO${created > 1 ? 's' : ''} created as draft`, { id: toastId })
      router.push('/purchases')
    } catch (err: any) {
      toast.error(err.message || 'Failed to create POs', { id: toastId })
    } finally {
      setIsCreating(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const activeGroup = supplierGroups.find(g => g.supplier_id === effectiveActiveKey)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/purchases">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Smart Reorder</h1>
            <p className="text-sm text-muted-foreground">
              {isLoading ? 'Loading low stock items…' : `${suggestions.length} item${suggestions.length !== 1 ? 's' : ''} need restocking`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Branch selector */}
          <Select value={branchId} onValueChange={v => { setBranchId(v); setActiveSupplierKey(''); setProductStates({}) }}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Branches</SelectItem>
              {(branches as any[]).map((b: any) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" onClick={() => { setProductStates({}); refetch() }} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>

          <Button
            onClick={handleCreatePOs}
            disabled={poCount === 0 || isCreating}
            className="gap-2"
          >
            {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
            Create {poCount > 0 ? poCount : ''} PO{poCount !== 1 ? 's' : ''}
            {grandTotal > 0 && <span className="ml-1 opacity-75">· {formatCurrency(grandTotal)}</span>}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : suggestions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
          <CheckCircle2 className="h-16 w-16 text-green-500" />
          <p className="text-lg font-medium text-foreground">All stocked up!</p>
          <p className="text-sm">No products are below their reorder point.</p>
          <Link href="/purchases/new"><Button variant="outline" className="mt-2">Create Manual PO</Button></Link>
        </div>
      ) : (
        <div className="flex-1 flex gap-4 min-h-0">
          {/* Left: supplier group list */}
          <div className="w-72 shrink-0 flex flex-col gap-2 overflow-y-auto pr-1">
            {supplierGroups.map(group => {
              const isNoHistory = group.supplier_id === 'NO_HISTORY'
              const selCount = supplierSelectedCount(group.supplier_id)
              const total = supplierTotal(group.supplier_id)
              const isActive = group.supplier_id === effectiveActiveKey

              return (
                <button
                  key={group.supplier_id}
                  onClick={() => setActiveSupplierKey(group.supplier_id)}
                  className={cn(
                    'w-full text-left rounded-lg border p-3 transition-colors',
                    isActive ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50',
                    isNoHistory && 'border-amber-300 bg-amber-50'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm truncate flex-1 mr-2">
                      {isNoHistory ? (
                        <span className="flex items-center gap-1.5 text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          No Purchase History
                        </span>
                      ) : group.supplier_name}
                    </span>
                    <ChevronRight className={cn('h-4 w-4 text-muted-foreground shrink-0 transition-transform', isActive && 'text-primary rotate-90')} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{group.items.length} product{group.items.length !== 1 ? 's' : ''} · {selCount} selected</span>
                  </div>
                  {!isNoHistory && total > 0 && (
                    <div className="mt-1 text-xs font-semibold text-foreground">
                      Est. {formatCurrency(total)}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Right: product rows for active group */}
          <div className="flex-1 flex flex-col min-h-0">
            {activeGroup ? (
              <>
                <div className="flex items-center justify-between mb-3 shrink-0">
                  <h2 className="font-semibold text-lg">
                    {activeGroup.supplier_id === 'NO_HISTORY' ? 'Products with No Purchase History' : activeGroup.supplier_name}
                  </h2>
                  {activeGroup.supplier_id !== 'NO_HISTORY' && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => toggleAllSupplier(activeGroup.supplier_id, true)}>
                        Select All
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => toggleAllSupplier(activeGroup.supplier_id, false)}>
                        Clear
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {activeGroup.items.map(s => {
                    const st = mergedStates[s.product_id] ?? initState(s)
                    const isNoHistory = s.no_history
                    const lineTotal = st.selected ? rowTotal(st) : 0

                    return (
                      <div
                        key={s.product_id}
                        className={cn(
                          'border rounded-lg p-4 transition-colors',
                          st.selected ? 'border-border bg-card' : 'border-border/50 bg-muted/30 opacity-60',
                          isNoHistory && 'border-amber-300'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {/* Checkbox */}
                          <Checkbox
                            checked={st.selected}
                            onCheckedChange={v => updateProduct(s.product_id, { selected: !!v })}
                            className="mt-1 shrink-0"
                          />

                          <div className="flex-1 min-w-0">
                            {/* Product info */}
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div>
                                <p className="font-medium text-sm">{s.product_name}</p>
                                <p className="text-xs text-muted-foreground">{s.product_code} · {s.category}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-xs text-muted-foreground">On Hand</p>
                                <p className={cn('text-sm font-semibold', s.quantity_on_hand <= 0 ? 'text-red-600' : 'text-amber-600')}>
                                  {s.quantity_on_hand <= 0
                                    ? <span className="flex items-center gap-1"><CircleSlash className="h-3 w-3" /> Out of stock</span>
                                    : <span className="flex items-center gap-1"><TrendingDown className="h-3 w-3" /> {s.quantity_on_hand} {s.base_uom.code}</span>
                                  }
                                </p>
                                <p className="text-xs text-muted-foreground">Reorder at ≤{s.reorder_point}</p>
                              </div>
                            </div>

                            {/* Supplier selector (only if has history and multiple options) */}
                            {!isNoHistory && s.suppliers.length > 1 && (
                              <div className="mb-2">
                                <p className="text-xs text-muted-foreground mb-1">Supplier</p>
                                <Select
                                  value={st.selected_supplier_id}
                                  onValueChange={sid => {
                                    const sup = getSupplierForProduct(s, sid)
                                    updateProduct(s.product_id, {
                                      selected_supplier_id: sid,
                                      unit_cost: sup?.best_unit_cost ?? 0,
                                      unit_cost_input: String(sup?.best_unit_cost ?? ''),
                                    })
                                    // Reassign this product to the new supplier group
                                    setActiveSupplierKey(sid)
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {s.suppliers.map(sup => (
                                      <SelectItem key={sup.supplier_id} value={sup.supplier_id}>
                                        <span className="flex items-center gap-2">
                                          {sup.supplier_name}
                                          <span className="text-muted-foreground">{formatCurrency(sup.best_unit_cost)}/{s.base_uom.code}</span>
                                          {sup.is_cheapest && <Badge variant="secondary" className="text-[10px] py-0 h-4">Cheapest</Badge>}
                                        </span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}

                            {/* Pricing row */}
                            <div className="flex items-center gap-3">
                              {/* Unit cost */}
                              <div className="w-32">
                                <p className="text-xs text-muted-foreground mb-1">
                                  Unit Cost / {s.base_uom.code}
                                </p>
                                {isNoHistory ? (
                                  <NumericInput
                                    placeholder="Enter cost"
                                    value={st.unit_cost_input}
                                    className="h-8 text-sm"
                                    onChange={e => {
                                      const raw = e.target.value
                                      updateProduct(s.product_id, {
                                        unit_cost_input: raw,
                                        unit_cost: parseFloat(raw) || 0,
                                      })
                                    }}
                                  />
                                ) : (
                                  <div className="h-8 px-3 flex items-center rounded-md border bg-muted text-sm font-mono">
                                    {formatCurrency(st.unit_cost)}
                                  </div>
                                )}
                              </div>

                              <div className="text-muted-foreground text-sm">×</div>

                              {/* Quantity */}
                              <div className="w-28">
                                <p className="text-xs text-muted-foreground mb-1">Quantity</p>
                                <NumericInput
                                  value={st.quantity}
                                  className="h-8 text-sm"
                                  onChange={e => updateProduct(s.product_id, { quantity: parseFloat(e.target.value) || 0 })}
                                />
                              </div>

                              <div className="text-muted-foreground text-sm">=</div>

                              {/* Row total */}
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Total</p>
                                <p className="h-8 flex items-center text-sm font-semibold">
                                  {st.selected ? formatCurrency(lineTotal) : '—'}
                                </p>
                              </div>
                            </div>

                            {/* Alt supplier hints */}
                            {!isNoHistory && s.suppliers.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {s.suppliers.map(sup => (
                                  <span key={sup.supplier_id} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                    <History className="h-3 w-3" />
                                    {sup.supplier_name}: {formatCurrency(sup.best_unit_cost)} · {formatDate(sup.last_po_date)}
                                    {sup.is_cheapest && <span className="text-green-600 font-medium">✓ cheapest</span>}
                                  </span>
                                ))}
                              </div>
                            )}

                            {isNoHistory && (
                              <p className="mt-2 text-xs text-amber-700 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                No purchase history found. Enter unit cost manually or exclude this item.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Supplier footer total */}
                {activeGroup.supplier_id !== 'NO_HISTORY' && (
                  <>
                    <Separator className="my-3 shrink-0" />
                    <div className="flex items-center justify-between shrink-0">
                      <span className="text-sm text-muted-foreground">
                        {supplierSelectedCount(activeGroup.supplier_id)} of {activeGroup.items.length} items selected
                      </span>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-muted-foreground">Supplier Total:</span>
                        <span className="text-lg font-bold">{formatCurrency(supplierTotal(activeGroup.supplier_id))}</span>
                      </div>
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Select a supplier group to review items</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
