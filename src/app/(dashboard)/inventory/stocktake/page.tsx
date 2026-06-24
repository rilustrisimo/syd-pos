'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
import { useAuthStore } from '@/lib/stores/auth'
import { useBranches } from '@/hooks/useInventory'
import { getProductsByCodesWithInventory } from '@/lib/supabase/queries/inventory'
import { getTodayPH } from '@/lib/utils/datetime'
import { printElement } from '@/lib/utils/print'
import { toast } from 'sonner'
import {
  ScanLine,
  Upload,
  ChevronRight,
  ChevronLeft,
  Check,
  AlertTriangle,
  Loader2,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Minus,
  Printer,
  Download,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3

interface ReviewRow {
  product_id: string
  product_code: string
  product_name: string
  base_uom_id: string
  base_uom_code: string
  system_qty: number
  counted_qty: number
  variance: number
  allow_negative_inventory: boolean
}

interface UnmatchedRow {
  sku: string
  counted_qty: number
}

type FilterMode = 'all' | 'variances'

// ── CSV parsing (native, no library) ─────────────────────────────────────────

function parseCSV(text: string): string[][] {
  return text
    .trim()
    .split('\n')
    .map((line) =>
      line
        .match(/("([^"]*)"|[^,]*)/g)
        ?.map((cell) => cell.trim().replace(/^"|"$/g, '').trim()) ?? []
    )
    .filter((row) => row.some((c) => c !== ''))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/\.?0+$/, '')
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function downloadCSV(
  rows: ReviewRow[],
  unmatched: UnmatchedRow[],
  branchName: string,
  sessionDate: string,
  sessionLabel: string
) {
  const header = ['SKU', 'Product Name', 'UOM', 'System Qty', 'Counted Qty', 'Variance', 'Status']
  const dataRows = rows.map((r) => [
    r.product_code,
    r.product_name,
    r.base_uom_code,
    formatQty(r.system_qty),
    formatQty(r.counted_qty),
    (r.variance >= 0 ? '+' : '') + formatQty(r.variance),
    r.variance === 0 ? 'Match' : r.variance > 0 ? 'Over' : 'Under',
  ])

  const lines: string[][] = [header, ...dataRows]

  if (unmatched.length > 0) {
    lines.push([])
    lines.push(['Unmatched SKUs (not found in system)'])
    lines.push(['SKU', 'Counted Qty', '', '', '', '', ''])
    unmatched.forEach((u) => lines.push([u.sku, formatQty(u.counted_qty), '', '', '', '', '']))
  }

  const csv = lines.map((row) => row.map((c) => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const label = (sessionLabel || 'stocktake').replace(/\s+/g, '-').toLowerCase()
  a.download = `${label}-${branchName.replace(/\s+/g, '-').toLowerCase()}-${sessionDate}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StocktakePage() {
  const { user } = useAuthStore()

  // ── Step 1 state ─────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(1)
  const [selectedBranch, setSelectedBranch] = useState('')
  const [sessionLabel, setSessionLabel] = useState('')
  const [sessionDate, setSessionDate] = useState(getTodayPH())
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<string[][]>([])
  const [skuCol, setSkuCol] = useState('')
  const [qtyCol, setQtyCol] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Step 2 state ─────────────────────────────────────────────────────────
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([])
  const [unmatchedRows, setUnmatchedRows] = useState<UnmatchedRow[]>([])
  const [isLoadingReview, setIsLoadingReview] = useState(false)
  const [filterMode, setFilterMode] = useState<FilterMode>('all')

  // ── Step 3 (report) ref ───────────────────────────────────────────────────
  const reportRef = useRef<HTMLDivElement>(null)

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: branches = [] } = useBranches()

  const selectedBranchName =
    (branches as any[]).find((b: any) => b.id === selectedBranch)?.name || ''

  // ── Step 1: CSV upload ────────────────────────────────────────────────────
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = parseCSV(text)
      if (parsed.length < 2) {
        toast.error('CSV must have a header row and at least one data row')
        return
      }
      setCsvHeaders(parsed[0])
      setCsvRows(parsed.slice(1))
      setSkuCol('')
      setQtyCol('')
      toast.success(`Loaded ${parsed.length - 1} rows from ${file.name}`)
    } catch {
      toast.error('Failed to read CSV file')
    }
  }, [])

  const canProceedToReview =
    selectedBranch && csvRows.length > 0 && skuCol !== '' && qtyCol !== '' && skuCol !== qtyCol

  // ── Step 2: load products and build review rows ───────────────────────────
  const handleGoToReview = useCallback(async () => {
    if (!canProceedToReview) return

    const skuColIdx = csvHeaders.indexOf(skuCol)
    const qtyColIdx = csvHeaders.indexOf(qtyCol)

    const csvMap = new Map<string, number>()
    for (const row of csvRows) {
      const sku = row[skuColIdx]?.trim()
      const qty = parseFloat(row[qtyColIdx])
      if (sku && !isNaN(qty)) {
        csvMap.set(sku.toUpperCase(), (csvMap.get(sku.toUpperCase()) ?? 0) + qty)
      }
    }

    const skus = Array.from(csvMap.keys())
    if (skus.length === 0) {
      toast.error('No valid SKU/quantity rows found in CSV')
      return
    }

    setIsLoadingReview(true)
    setStep(2)

    try {
      const originalSkus = [...new Set(csvRows.map((r) => r[skuColIdx]?.trim()).filter(Boolean))]
      const products = await getProductsByCodesWithInventory(selectedBranch, originalSkus)
      const productMap = new Map(products.map((p) => [p.product_code.toUpperCase(), p]))

      const matched: ReviewRow[] = []
      const unmatched: UnmatchedRow[] = []

      for (const [sku, countedQty] of csvMap) {
        const product = productMap.get(sku)
        if (product) {
          matched.push({
            product_id: product.product_id,
            product_code: product.product_code,
            product_name: product.product_name,
            base_uom_id: product.base_uom_id,
            base_uom_code: product.base_uom_code,
            system_qty: product.quantity_on_hand,
            counted_qty: countedQty,
            variance: countedQty - product.quantity_on_hand,
            allow_negative_inventory: product.allow_negative_inventory,
          })
        } else {
          unmatched.push({ sku, counted_qty: countedQty })
        }
      }

      matched.sort((a, b) => {
        if (a.variance !== 0 && b.variance === 0) return -1
        if (a.variance === 0 && b.variance !== 0) return 1
        return a.product_name.localeCompare(b.product_name)
      })

      setReviewRows(matched)
      setUnmatchedRows(unmatched)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load inventory data')
      setStep(1)
    } finally {
      setIsLoadingReview(false)
    }
  }, [canProceedToReview, csvHeaders, csvRows, selectedBranch, skuCol, qtyCol])

  // ── Computed stats ────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: reviewRows.length,
    over: reviewRows.filter((r) => r.variance > 0).length,
    under: reviewRows.filter((r) => r.variance < 0).length,
    exact: reviewRows.filter((r) => r.variance === 0).length,
    unmatched: unmatchedRows.length,
  }), [reviewRows, unmatchedRows])

  const displayedRows = useMemo(
    () => (filterMode === 'variances' ? reviewRows.filter((r) => r.variance !== 0) : reviewRows),
    [reviewRows, filterMode]
  )

  // ── Step 3: print / download ──────────────────────────────────────────────
  const handlePrint = useCallback(() => {
    if (!reportRef.current) return
    const label = sessionLabel.trim() || 'Physical Count Report'
    printElement(reportRef.current, {
      title: `${label} — ${selectedBranchName}`,
      paperSize: 'a4',
    })
  }, [sessionLabel, selectedBranchName])

  const handleDownloadCSV = useCallback(() => {
    downloadCSV(reviewRows, unmatchedRows, selectedBranchName, sessionDate, sessionLabel)
  }, [reviewRows, unmatchedRows, selectedBranchName, sessionDate, sessionLabel])

  // ── Reset ─────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setStep(1)
    setSelectedBranch('')
    setSessionLabel('')
    setSessionDate(getTodayPH())
    setCsvHeaders([])
    setCsvRows([])
    setSkuCol('')
    setQtyCol('')
    setReviewRows([])
    setUnmatchedRows([])
    setFilterMode('all')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────
  const stepLabels = ['1. Setup', '2. Review', '3. Report']

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ScanLine className="h-7 w-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold">Physical Stock Count</h1>
          <p className="text-sm text-muted-foreground">
            Import a CSV count sheet and generate a variance report
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {stepLabels.map((label, idx) => {
          const n = (idx + 1) as Step
          const done = step > n
          const active = step === n
          return (
            <div key={label} className="flex items-center gap-2">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                done ? 'bg-green-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
              }`}>
                {done ? <Check className="h-3 w-3" /> : n}
              </div>
              <span className={active ? 'font-semibold text-blue-600' : done ? 'text-green-600' : 'text-muted-foreground'}>
                {label}
              </span>
              {idx < 2 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          )
        })}
      </div>

      <Separator />

      {/* ── STEP 1: SETUP ──────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Session Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label>Branch *</Label>
                  <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select branch…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(branches as any[]).map((b: any) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Count Label (optional)</Label>
                  <Input
                    placeholder="e.g. Monthly Count June 2026"
                    value={sessionLabel}
                    onChange={(e) => setSessionLabel(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Count Date</Label>
                  <Input
                    type="date"
                    value={sessionDate}
                    max={getTodayPH()}
                    onChange={(e) => setSessionDate(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Import Count CSV</CardTitle>
              <CardDescription>
                Upload a CSV with at least two columns: one for the product SKU/code and one for
                the physically counted quantity (in base units).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">Click to upload CSV file</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {csvRows.length > 0
                    ? `${csvRows.length} data rows loaded · ${csvHeaders.length} columns`
                    : 'Supports .csv files'}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {csvHeaders.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>SKU / Product Code column *</Label>
                    <Select value={skuCol} onValueChange={setSkuCol}>
                      <SelectTrigger><SelectValue placeholder="Select column…" /></SelectTrigger>
                      <SelectContent>
                        {csvHeaders.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Counted Quantity column *</Label>
                    <Select value={qtyCol} onValueChange={setQtyCol}>
                      <SelectTrigger><SelectValue placeholder="Select column…" /></SelectTrigger>
                      <SelectContent>
                        {csvHeaders.map((h) => (
                          <SelectItem key={h} value={h} disabled={h === skuCol}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Preview first 3 rows */}
              {csvRows.length > 0 && skuCol && qtyCol && (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 text-xs">
                        {csvHeaders.map((h) => (
                          <TableHead key={h} className="py-1.5 px-3">
                            {h}
                            {h === skuCol && <Badge variant="secondary" className="ml-1 text-[10px]">SKU</Badge>}
                            {h === qtyCol && <Badge variant="secondary" className="ml-1 text-[10px]">Qty</Badge>}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {csvRows.slice(0, 3).map((row, i) => (
                        <TableRow key={i} className="text-xs">
                          {row.map((cell, j) => <TableCell key={j} className="py-1.5 px-3">{cell}</TableCell>)}
                        </TableRow>
                      ))}
                      {csvRows.length > 3 && (
                        <TableRow>
                          <TableCell colSpan={csvHeaders.length} className="py-1.5 px-3 text-xs text-muted-foreground text-center">
                            … and {csvRows.length - 3} more rows
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              disabled={!canProceedToReview}
              onClick={handleGoToReview}
              className="bg-blue-600 hover:bg-blue-700 gap-2"
            >
              Next: Review Discrepancies
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 2: REVIEW ─────────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          {isLoadingReview ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Loading inventory data…</p>
            </div>
          ) : (
            <>
              {/* Summary chips */}
              <div className="flex flex-wrap gap-2 items-center text-sm">
                <Badge variant="outline" className="gap-1">
                  <Check className="h-3 w-3 text-green-500" />{stats.exact} exact match
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <TrendingUp className="h-3 w-3 text-amber-500" />{stats.over} over
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <TrendingDown className="h-3 w-3 text-red-500" />{stats.under} under
                </Badge>
                {stats.unmatched > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {stats.unmatched} unmatched SKU{stats.unmatched !== 1 ? 's' : ''}
                  </Badge>
                )}
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant={filterMode === 'all' ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setFilterMode('all')}>
                    All ({stats.total})
                  </Button>
                  <Button size="sm" variant={filterMode === 'variances' ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setFilterMode('variances')}>
                    Variances only ({stats.over + stats.under})
                  </Button>
                </div>
              </div>

              {/* Review table */}
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 text-xs">
                      <TableHead className="py-2">Code</TableHead>
                      <TableHead className="py-2">Product</TableHead>
                      <TableHead className="py-2 w-16 text-center">UOM</TableHead>
                      <TableHead className="py-2 w-28 text-right">System Qty</TableHead>
                      <TableHead className="py-2 w-28 text-right">Counted Qty</TableHead>
                      <TableHead className="py-2 w-28 text-right">Variance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                          No rows to display
                        </TableCell>
                      </TableRow>
                    ) : (
                      displayedRows.map((row) => (
                        <TableRow key={row.product_id} className={row.variance === 0 ? 'opacity-60' : ''}>
                          <TableCell className="py-2 font-mono text-xs">{row.product_code}</TableCell>
                          <TableCell className="py-2 text-sm font-medium">{row.product_name}</TableCell>
                          <TableCell className="py-2 text-center text-xs text-muted-foreground">{row.base_uom_code}</TableCell>
                          <TableCell className="py-2 text-right font-mono text-sm">{formatQty(row.system_qty)}</TableCell>
                          <TableCell className="py-2 text-right font-mono text-sm">{formatQty(row.counted_qty)}</TableCell>
                          <TableCell className="py-2 text-right">
                            {row.variance === 0 ? (
                              <span className="flex items-center justify-end gap-1 text-green-600 text-sm font-mono">
                                <Minus className="h-3 w-3" />0
                              </span>
                            ) : row.variance > 0 ? (
                              <span className="flex items-center justify-end gap-1 text-amber-600 text-sm font-mono font-semibold">
                                <TrendingUp className="h-3 w-3" />+{formatQty(row.variance)}
                              </span>
                            ) : (
                              <span className="flex items-center justify-end gap-1 text-red-600 text-sm font-mono font-semibold">
                                <TrendingDown className="h-3 w-3" />{formatQty(row.variance)}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Unmatched SKUs */}
              {unmatchedRows.length > 0 && (
                <Card className="border-amber-200 bg-amber-50">
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm flex items-center gap-2 text-amber-700">
                      <AlertTriangle className="h-4 w-4" />
                      {unmatchedRows.length} SKU{unmatchedRows.length !== 1 ? 's' : ''} not found in system
                    </CardTitle>
                    <CardDescription className="text-xs text-amber-600">
                      These codes from the CSV did not match any active product and will appear in the report for follow-up.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="flex flex-wrap gap-2">
                      {unmatchedRows.map((r) => (
                        <Badge key={r.sku} variant="outline" className="border-amber-300 text-amber-700 font-mono">
                          {r.sku} (counted: {formatQty(r.counted_qty)})
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
                  <ChevronLeft className="h-4 w-4" />Back
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  className="bg-blue-600 hover:bg-blue-700 gap-2"
                  disabled={reviewRows.length === 0}
                >
                  <FileText className="h-4 w-4" />
                  Generate Report
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── STEP 3: REPORT ─────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Toolbar (not printed) */}
          <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
            <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
              <ChevronLeft className="h-4 w-4" />Back to Review
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2" onClick={handleDownloadCSV}>
                <Download className="h-4 w-4" />Download CSV
              </Button>
              <Button className="gap-2 bg-blue-600 hover:bg-blue-700" onClick={handlePrint}>
                <Printer className="h-4 w-4" />Print Report
              </Button>
              <Button variant="ghost" className="gap-2 text-muted-foreground" onClick={handleReset}>
                <RotateCcw className="h-4 w-4" />New Count
              </Button>
            </div>
          </div>

          {/* ── Printable report ─────────────────────────────────────────── */}
          <div ref={reportRef} className="bg-white rounded-lg border p-6 space-y-6">
            {/* Report header */}
            <div className="space-y-1">
              <h2 className="text-xl font-bold tracking-tight">
                Physical Count Variance Report
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-sm text-muted-foreground mt-2">
                <div><span className="font-medium text-foreground">Branch:</span> {selectedBranchName}</div>
                <div><span className="font-medium text-foreground">Count Date:</span> {formatDate(sessionDate)}</div>
                <div>
                  <span className="font-medium text-foreground">Session:</span>{' '}
                  {sessionLabel.trim() || '—'}
                </div>
                <div>
                  <span className="font-medium text-foreground">Prepared by:</span>{' '}
                  {user?.fullName || user?.email || 'Staff'}
                </div>
                <div>
                  <span className="font-medium text-foreground">Generated:</span>{' '}
                  {new Date().toLocaleString('en-PH')}
                </div>
              </div>
            </div>

            <Separator />

            {/* Summary cards */}
            <div>
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                Summary
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: 'Total Products', value: stats.total, color: 'text-foreground' },
                  { label: 'Exact Match', value: stats.exact, color: 'text-green-600' },
                  { label: 'Over Count', value: stats.over, color: 'text-amber-600' },
                  { label: 'Under Count', value: stats.under, color: 'text-red-600' },
                  { label: 'Unmatched SKUs', value: stats.unmatched, color: stats.unmatched > 0 ? 'text-red-600' : 'text-muted-foreground' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-lg border p-3 text-center">
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Variances section (only rows with variance) ─────────────── */}
            {(stats.over > 0 || stats.under > 0) && (
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                  Discrepancies ({stats.over + stats.under})
                </h3>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 text-xs">
                        <TableHead className="py-2">#</TableHead>
                        <TableHead className="py-2">SKU</TableHead>
                        <TableHead className="py-2">Product Name</TableHead>
                        <TableHead className="py-2 w-16 text-center">UOM</TableHead>
                        <TableHead className="py-2 w-28 text-right">System Qty</TableHead>
                        <TableHead className="py-2 w-28 text-right">Counted Qty</TableHead>
                        <TableHead className="py-2 w-28 text-right">Variance</TableHead>
                        <TableHead className="py-2 w-20 text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reviewRows
                        .filter((r) => r.variance !== 0)
                        .map((row, idx) => (
                          <TableRow key={row.product_id}>
                            <TableCell className="py-2 text-xs text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell className="py-2 font-mono text-xs">{row.product_code}</TableCell>
                            <TableCell className="py-2 text-sm font-medium">{row.product_name}</TableCell>
                            <TableCell className="py-2 text-center text-xs text-muted-foreground">{row.base_uom_code}</TableCell>
                            <TableCell className="py-2 text-right font-mono text-sm">{formatQty(row.system_qty)}</TableCell>
                            <TableCell className="py-2 text-right font-mono text-sm">{formatQty(row.counted_qty)}</TableCell>
                            <TableCell className="py-2 text-right font-mono text-sm font-semibold">
                              {row.variance > 0
                                ? <span className="text-amber-600">+{formatQty(row.variance)}</span>
                                : <span className="text-red-600">{formatQty(row.variance)}</span>
                              }
                            </TableCell>
                            <TableCell className="py-2 text-center">
                              {row.variance > 0
                                ? <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">Over</Badge>
                                : <Badge variant="outline" className="text-[10px] border-red-300 text-red-700">Under</Badge>
                              }
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* ── Exact matches section ───────────────────────────────────── */}
            {stats.exact > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                  Exact Matches ({stats.exact})
                </h3>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 text-xs">
                        <TableHead className="py-2">#</TableHead>
                        <TableHead className="py-2">SKU</TableHead>
                        <TableHead className="py-2">Product Name</TableHead>
                        <TableHead className="py-2 w-16 text-center">UOM</TableHead>
                        <TableHead className="py-2 w-28 text-right">System Qty</TableHead>
                        <TableHead className="py-2 w-28 text-right">Counted Qty</TableHead>
                        <TableHead className="py-2 w-28 text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reviewRows
                        .filter((r) => r.variance === 0)
                        .map((row, idx) => (
                          <TableRow key={row.product_id} className="opacity-80">
                            <TableCell className="py-2 text-xs text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell className="py-2 font-mono text-xs">{row.product_code}</TableCell>
                            <TableCell className="py-2 text-sm">{row.product_name}</TableCell>
                            <TableCell className="py-2 text-center text-xs text-muted-foreground">{row.base_uom_code}</TableCell>
                            <TableCell className="py-2 text-right font-mono text-sm">{formatQty(row.system_qty)}</TableCell>
                            <TableCell className="py-2 text-right font-mono text-sm">{formatQty(row.counted_qty)}</TableCell>
                            <TableCell className="py-2 text-center">
                              <Badge variant="outline" className="text-[10px] border-green-300 text-green-700">Match</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* ── Unmatched SKUs section ──────────────────────────────────── */}
            {unmatchedRows.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Unmatched SKUs — Not Found in System ({unmatchedRows.length})
                </h3>
                <div className="rounded-md border border-amber-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-amber-50 text-xs">
                        <TableHead className="py-2">#</TableHead>
                        <TableHead className="py-2">SKU from CSV</TableHead>
                        <TableHead className="py-2 text-right">Counted Qty</TableHead>
                        <TableHead className="py-2">Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unmatchedRows.map((row, idx) => (
                        <TableRow key={row.sku} className="bg-amber-50/40">
                          <TableCell className="py-2 text-xs text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="py-2 font-mono text-sm font-semibold text-amber-700">{row.sku}</TableCell>
                          <TableCell className="py-2 text-right font-mono text-sm">{formatQty(row.counted_qty)}</TableCell>
                          <TableCell className="py-2 text-xs text-muted-foreground">
                            No active product found with this code — verify SKU or add product to system
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Report footer */}
            <Separator />
            <p className="text-xs text-muted-foreground text-center">
              This report is for reference only. No inventory adjustments have been made.
              To apply corrections, use <strong>Adjust Stock</strong> in the Inventory module.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
