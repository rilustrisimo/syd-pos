'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, ClipboardList, Eye, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useGovernmentCanvases, useDeleteGovernmentCanvas } from '@/hooks/useGovernmentCanvases'

function fmt(n: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(n)
}

export default function GovernmentCanvassList() {
  const [page, setPage] = useState(1)
  const limit = 20
  const { data, isLoading } = useGovernmentCanvases(page, limit)
  const deleteMutation = useDeleteGovernmentCanvas()

  async function handleDelete(id: string, num: string) {
    if (!confirm(`Delete canvass ${num}?`)) return
    try {
      await deleteMutation.mutateAsync(id)
      toast.success('Canvass deleted')
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete canvass')
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-blue-600" />
          Government Canvasses
        </h1>
        <Link href="/government/canvass/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Canvass
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !data?.data?.length ? (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <ClipboardList className="h-10 w-10 opacity-25" />
              <p>No government canvasses yet.</p>
              <Link href="/government/canvass/new">
                <Button variant="outline" size="sm">Create first canvass</Button>
              </Link>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Canvass #</TableHead>
                    <TableHead>Agency</TableHead>
                    <TableHead>PO Number</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((canvas: any) => (
                    <TableRow key={canvas.id}>
                      <TableCell className="font-mono text-sm">{canvas.canvas_number}</TableCell>
                      <TableCell className="font-medium">{canvas.government_agency || '—'}</TableCell>
                      <TableCell>{canvas.po_number ? `PO# ${canvas.po_number}` : <span className="text-muted-foreground text-xs italic">Pending</span>}</TableCell>
                      <TableCell>{canvas.canvas_date?.slice(0, 10)}</TableCell>
                      <TableCell className="text-right font-bold">{fmt(canvas.total_amount)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Link href={`/government/canvass/${canvas.id}`}>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(canvas.id, canvas.canvas_number)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {/* Pagination */}
              {(data.total > limit) && (
                <div className="flex justify-center gap-2 py-4">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                  <span className="flex items-center text-sm text-muted-foreground px-2">
                    Page {page} of {Math.ceil(data.total / limit)}
                  </span>
                  <Button variant="outline" size="sm" disabled={page >= Math.ceil(data.total / limit)} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
