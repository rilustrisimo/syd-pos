'use client'

import { useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Printer, ShoppingCart, Loader2, Pencil, Check, X, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/stores/auth'
import { useGovernmentCanvas, useUpdateGovernmentCanvas, useDeleteGovernmentCanvas } from '@/hooks/useGovernmentCanvases'
import { useGovernmentSaleStore } from '@/lib/stores/governmentSaleStore'
import { GovernmentCanvasTemplate } from '@/components/print/government-canvas-template'
import type { GovCanvasTemplateData } from '@/components/print/government-canvas-template'
import { printElement } from '@/lib/utils/print'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

function fmt(n: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(n)
}

export default function GovernmentCanvassDetail() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuthStore()
  const templateRef = useRef<HTMLDivElement>(null)

  const { data: canvas, isLoading } = useGovernmentCanvas(id)
  const updateCanvas = useUpdateGovernmentCanvas()
  const deleteCanvas = useDeleteGovernmentCanvas()
  const govStore = useGovernmentSaleStore()

  const [editingPO, setEditingPO] = useState(false)
  const [poInput, setPoInput] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)

  function buildTemplateData(c: any): GovCanvasTemplateData {
    return {
      canvas_number:     c.canvas_number,
      date:              c.canvas_date,
      prepared_by:       user?.fullName || user?.email || 'Staff',
      branch: {
        name:    c.branch?.name    || '',
        address: c.branch?.address || null,
        phone:   c.branch?.phone   || null,
      },
      government_agency: c.government_agency || '',
      contact_person:    c.contact_person   || null,
      po_number:         c.po_number        || null,
      notes:             c.notes            || null,
      items: (c.lines || []).map((l: any, idx: number) => ({
        line_number: l.line_number || idx + 1,
        code:        l.product?.code || null,
        name:        l.line_description || l.product?.name || '—',
        quantity:    l.quantity,
        uom:         l.unit_label || l.uom?.code || l.uom?.name || 'pc',
        unit_price:  l.unit_price,
        discount:    l.discount_amount || 0,
        line_total:  l.line_total ?? (l.quantity * l.unit_price - (l.discount_amount || 0)),
      })),
      subtotal:        c.subtotal        || 0,
      discount_amount: c.discount_amount || 0,
      delivery_fee:    c.delivery_fee    || 0,
      other_fees:      c.other_fees      || 0,
      other_fees_notes: c.other_fees_notes || null,
      total_amount:    c.total_amount    || 0,
    }
  }

  function handlePrint() {
    if (!templateRef.current) return
    printElement(templateRef.current, {
      title: `Government Canvass ${canvas?.canvas_number || ''}`,
      paperSize: 'a4',
    })
  }

  async function savePO() {
    if (!canvas) return
    try {
      await updateCanvas.mutateAsync({ id: canvas.id, updates: { po_number: poInput || null } })
      toast.success('PO Number saved')
      setEditingPO(false)
    } catch {
      toast.error('Failed to save PO number')
    }
  }

  function handleConvertToSale() {
    if (!canvas) return
    // Reset any previous sale draft and navigate — the new sale page reads
    // the ?canvas= param to pre-select this canvass as the budget reference.
    govStore.resetAll()
    router.push(`/government/sales/new?canvas=${canvas.id}`)
  }

  async function handleDelete() {
    if (!canvas) return
    try {
      await deleteCanvas.mutateAsync(canvas.id)
      toast.success('Canvass deleted')
      router.push('/government/canvass')
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete canvass')
    }
    setDeleteOpen(false)
  }

  if (isLoading) {
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

  const c = canvas as any

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/government/canvass">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">{c.canvas_number}</h1>
            <p className="text-sm text-muted-foreground">{c.canvas_date?.slice(0, 10)} · {c.government_agency}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4 mr-1" />Delete
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />Print
          </Button>
          <Button onClick={handleConvertToSale}>
            <ShoppingCart className="h-4 w-4 mr-2" />Convert to Sale
          </Button>
        </div>
      </div>

      {/* Details card */}
      <Card>
        <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Agency</span>
            <p className="font-semibold mt-0.5">{c.government_agency || '—'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Contact Person</span>
            <p className="font-semibold mt-0.5">{c.contact_person || '—'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">PO Number</span>
            {editingPO ? (
              <div className="flex items-center gap-1 mt-0.5">
                <Input className="h-7 text-sm" value={poInput} onChange={e => setPoInput(e.target.value)} placeholder="Enter PO#" />
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={savePO} disabled={updateCanvas.isPending}>
                  <Check className="h-3.5 w-3.5 text-green-600" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditingPO(false)}>
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1 mt-0.5">
                <p className="font-semibold">{c.po_number || <span className="text-muted-foreground italic text-xs">Not yet awarded</span>}</p>
                <Button variant="ghost" size="sm" className="h-6 px-1 ml-1" onClick={() => { setPoInput(c.po_number || ''); setEditingPO(true) }}>
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            )}
          </div>
          <div>
            <span className="text-muted-foreground">Branch</span>
            <p className="font-semibold mt-0.5">{c.branch?.name || '—'}</p>
          </div>
          {c.notes && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Notes</span>
              <p className="mt-0.5">{c.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader><CardTitle className="text-base">Items ({c.lines?.length || 0})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead className="text-center">Unit</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(c.lines || []).map((line: any, idx: number) => (
                <TableRow key={line.id}>
                  <TableCell className="text-muted-foreground text-xs">{line.line_number || idx + 1}</TableCell>
                  <TableCell>
                    {line.product?.code && <span className="font-mono text-xs text-muted-foreground mr-1.5">{line.product.code}</span>}
                    {line.line_description || line.product?.name || '—'}
                  </TableCell>
                  <TableCell className="text-center">{line.quantity}</TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">
                    {line.unit_label || line.uom?.code || line.uom?.name || 'pc'}
                  </TableCell>
                  <TableCell className="text-right">{fmt(line.unit_price)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {fmt(line.line_total ?? (line.quantity * line.unit_price - (line.discount_amount || 0)))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex justify-end p-4">
            <div className="w-52 space-y-1 text-sm">
              {c.discount_amount > 0 && (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmt(c.subtotal)}</span></div>
                  <div className="flex justify-between text-green-600"><span>Discount</span><span>−{fmt(c.discount_amount)}</span></div>
                </>
              )}
              <Separator />
              <div className="flex justify-between font-bold text-base"><span>Total</span><span>{fmt(c.total_amount)}</span></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hidden print template */}
      <div className="hidden">
        <GovernmentCanvasTemplate
          ref={templateRef}
          data={buildTemplateData(c)}
          logoUrl={typeof window !== 'undefined' ? window.location.origin + '/syd-logo.svg' : undefined}
        />
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Canvass?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete canvass <strong>{c.canvas_number}</strong>.
              If this canvass is linked to a sale, deletion will be blocked — delete the sale first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteCanvas.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCanvas.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Canvass
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
