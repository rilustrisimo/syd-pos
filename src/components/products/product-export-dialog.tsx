'use client'

import { useState } from 'react'
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EXPORT_COLUMNS, exportToCSV, exportToPDF } from '@/lib/utils/export'
import type { Product } from '@/lib/supabase/queries/products'
import { toast } from 'sonner'

interface ProductExportDialogProps {
  products: Product[]
  isLoading?: boolean
}

const DEFAULT_COLUMNS = ['code', 'name', 'category', 'base_unit_cost', 'latest_cogs', 'current_selling_price']

export function ProductExportDialog({ products, isLoading }: ProductExportDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedColumns, setSelectedColumns] = useState<string[]>(DEFAULT_COLUMNS)
  const [format, setFormat] = useState<'csv' | 'pdf'>('csv')
  const [exporting, setExporting] = useState(false)

  const toggleColumn = (columnId: string) => {
    setSelectedColumns(prev =>
      prev.includes(columnId)
        ? prev.filter(id => id !== columnId)
        : [...prev, columnId]
    )
  }

  const selectAll = () => {
    setSelectedColumns(EXPORT_COLUMNS.map(col => col.id))
  }

  const deselectAll = () => {
    setSelectedColumns([])
  }

  const handleExport = async () => {
    if (selectedColumns.length === 0) {
      toast.error('Please select at least one column to export')
      return
    }

    if (products.length === 0) {
      toast.error('No products to export')
      return
    }

    setExporting(true)

    try {
      if (format === 'csv') {
        exportToCSV(products, selectedColumns)
        toast.success(`Exported ${products.length} products to CSV`)
      } else {
        await exportToPDF(products, selectedColumns)
        toast.success(`Exported ${products.length} products to PDF`)
      }
      setOpen(false)
    } catch (error) {
      console.error('Export error:', error)
      toast.error('Failed to export products')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={isLoading}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Export Products</DialogTitle>
          <DialogDescription>
            Choose the columns and format for exporting products. Products will be grouped and sorted by category.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Format selection */}
          <div className="space-y-3">
            <Label>Export Format</Label>
            <RadioGroup value={format} onValueChange={(value) => setFormat(value as 'csv' | 'pdf')}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="csv" id="csv" />
                <Label htmlFor="csv" className="flex items-center cursor-pointer font-normal">
                  <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" />
                  CSV (Comma Separated Values)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pdf" id="pdf" />
                <Label htmlFor="pdf" className="flex items-center cursor-pointer font-normal">
                  <FileText className="mr-2 h-4 w-4 text-red-600" />
                  PDF (Portable Document Format)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Column selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Select Columns</Label>
              <div className="space-x-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={selectAll}
                  className="h-7 text-xs"
                >
                  Select All
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={deselectAll}
                  className="h-7 text-xs"
                >
                  Deselect All
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[300px] rounded-md border p-4">
              <div className="space-y-3">
                {EXPORT_COLUMNS.map((column) => (
                  <div key={column.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={column.id}
                      checked={selectedColumns.includes(column.id)}
                      onCheckedChange={() => toggleColumn(column.id)}
                    />
                    <Label
                      htmlFor={column.id}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {column.label}
                    </Label>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <p className="text-xs text-muted-foreground">
              {selectedColumns.length} column(s) selected • {products.length} product(s) to export
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={exporting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={exporting || selectedColumns.length === 0}
          >
            {exporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Export {format.toUpperCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
