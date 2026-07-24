'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Package, PenLine, Loader2 } from 'lucide-react'
import { usePOSProductSearch } from '@/hooks/useTransactions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function round2(n: number) { return Math.round(n * 100) / 100 }
export function fmt(n: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(n)
}

export interface CanvasLineRow {
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
  // normal (pre-markup) selling price; null for custom/ad hoc items, which
  // are always priced manually and unaffected by the markup %
  base_unit_price?: number | null
  discount_amount: number
}

interface CanvasLineEditorProps {
  branchId: string
  lines: CanvasLineRow[]
  setLines: React.Dispatch<React.SetStateAction<CanvasLineRow[]>>
  markupPercentage: number
  setMarkupPercentage: (value: number) => void
}

export function CanvasLineEditor({ branchId, lines, setLines, markupPercentage, setMarkupPercentage }: CanvasLineEditorProps) {
  const [productSearch, setProductSearch] = useState('')
  const { data: searchResults, isLoading: isSearching } = usePOSProductSearch(productSearch, branchId)

  // Government markup applies only to catalog-linked lines (those with a
  // known base_unit_price). Changing the % always recomputes from that base,
  // overwriting any prior manual edit to unit_price for those lines.
  useEffect(() => {
    setLines(prev => prev.map(l =>
      l.base_unit_price != null
        ? { ...l, unit_price: round2(l.base_unit_price * (1 + markupPercentage / 100)) }
        : l
    ))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markupPercentage])

  function addInventoryItem(product: any) {
    const basePrice = product.unit_price || 0
    setLines(prev => [...prev, {
      id: `${Date.now()}`,
      type: 'inventory',
      product_id: product.id,
      product_code: product.code,
      product_name: product.name,
      uom_id: product.selling_uom_id || product.uom_id,
      uom_name: product.selling_uom_abbreviation || product.uom_abbreviation || 'pc',
      cogs_per_unit: product.cogs || 0,
      quantity: 1,
      base_unit_price: basePrice,
      unit_price: round2(basePrice * (1 + markupPercentage / 100)),
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
      base_unit_price: null,
      discount_amount: 0,
    }])
  }

  function updateLine(id: string, field: keyof CanvasLineRow, value: any) {
    setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l))
  }

  function removeLine(id: string) {
    setLines(prev => prev.filter(l => l.id !== id))
  }

  const catalogNormalTotal = lines.reduce((s, l) => l.base_unit_price != null ? s + round2(l.quantity * l.base_unit_price) : s, 0)
  const catalogGovTotal = lines.reduce((s, l) => l.base_unit_price != null ? s + round2(l.quantity * l.unit_price) : s, 0)

  return (
    <div className="space-y-4">
      {/* Markup control */}
      <div className="flex items-end gap-4 flex-wrap p-3 rounded-md border bg-muted/20">
        <div className="space-y-1.5 w-44">
          <Label>Government Markup</Label>
          <div className="relative">
            <Input
              type="number"
              min={0}
              step="any"
              value={markupPercentage}
              onChange={e => setMarkupPercentage(parseFloat(e.target.value) || 0)}
              className="pr-7"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
          </div>
        </div>
        {catalogNormalTotal > 0 && (
          <div className="text-sm">
            <span className="text-muted-foreground">Normal price: </span>
            <span className="line-through text-muted-foreground">{fmt(catalogNormalTotal)}</span>
            <span className="text-muted-foreground"> → Government price: </span>
            <span className="font-semibold">{fmt(catalogGovTotal)}</span>
            {markupPercentage > 0 && (
              <span className="ml-1 text-green-600">(+{fmt(catalogGovTotal - catalogNormalTotal)})</span>
            )}
          </div>
        )}
      </div>

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
                    <span className="text-muted-foreground text-xs">{fmt(p.unit_price)}</span>
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
    </div>
  )
}
