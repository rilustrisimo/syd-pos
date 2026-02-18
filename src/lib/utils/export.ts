import type { Product } from '@/lib/supabase/queries/products'
import { format } from 'date-fns'

export type ExportColumn = {
  id: string
  label: string
  getValue: (product: Product) => string | number
}

export const EXPORT_COLUMNS: ExportColumn[] = [
  { id: 'code', label: 'Product Code', getValue: (p) => p.code },
  { id: 'name', label: 'Product Name', getValue: (p) => p.name },
  { id: 'category', label: 'Category', getValue: (p) => p.category?.name || 'N/A' },
  { id: 'subcategory', label: 'Subcategory', getValue: (p) => p.subcategory?.name || 'N/A' },
  { id: 'base_uom', label: 'Base UOM', getValue: (p) => p.base_uom?.name || 'N/A' },
  { id: 'selling_uom', label: 'Selling UOM', getValue: (p) => p.selling_uom?.name || 'N/A' },
  { id: 'conversion_factor', label: 'Conversion Factor', getValue: (p) => p.conversion_factor?.toString() || '1' },
  { id: 'base_unit_cost', label: 'Base Unit Cost', getValue: (p) => (p as any).base_unit_cost?.toFixed(2) || '0.00' },
  { id: 'latest_cogs', label: 'Cost per Selling Unit', getValue: (p) => p.latest_cogs?.toFixed(2) || '0.00' },
  { id: 'markup_percentage', label: 'Markup %', getValue: (p) => p.markup_percentage?.toString() || '0' },
  { id: 'current_selling_price', label: 'Selling Price', getValue: (p) => p.current_selling_price?.toFixed(2) || '0.00' },
  { id: 'reorder_point', label: 'Reorder Point', getValue: (p) => p.reorder_point?.toString() || '0' },
  { id: 'reorder_quantity', label: 'Reorder Quantity', getValue: (p) => p.reorder_quantity?.toString() || '0' },
  { id: 'description', label: 'Description', getValue: (p) => p.description || '' },
]

/**
 * Export products to CSV format
 */
export function exportToCSV(products: Product[], selectedColumns: string[]) {
  const columns = EXPORT_COLUMNS.filter(col => selectedColumns.includes(col.id))
  
  // Group products by category and sort
  const groupedProducts = products.reduce((acc, product) => {
    const categoryName = product.category?.name || 'Uncategorized'
    if (!acc[categoryName]) {
      acc[categoryName] = []
    }
    acc[categoryName].push(product)
    return acc
  }, {} as Record<string, Product[]>)

  // Sort categories alphabetically
  const sortedCategories = Object.keys(groupedProducts).sort()

  // Build CSV content
  const headers = columns.map(col => col.label).join(',')
  let csvContent = headers + '\n'

  sortedCategories.forEach(categoryName => {
    // Add category header
    csvContent += `\n"--- ${categoryName} ---"\n`
    
    // Add products in this category
    groupedProducts[categoryName].forEach(product => {
      const row = columns.map(col => {
        const value = col.getValue(product)
        // Escape quotes and wrap in quotes if contains comma
        const stringValue = String(value)
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`
        }
        return stringValue
      }).join(',')
      csvContent += row + '\n'
    })
  })

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `products_export_${format(new Date(), 'yyyy-MM-dd_HHmmss')}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Export products to PDF format
 * Note: This requires jsPDF and jspdf-autotable to be installed
 */
export async function exportToPDF(products: Product[], selectedColumns: string[]) {
  // Dynamic import to avoid loading jsPDF unless needed
  const { default: jsPDF } = await import('jspdf')
  await import('jspdf-autotable')

  const columns = EXPORT_COLUMNS.filter(col => selectedColumns.includes(col.id))
  
  // Group products by category and sort
  const groupedProducts = products.reduce((acc, product) => {
    const categoryName = product.category?.name || 'Uncategorized'
    if (!acc[categoryName]) {
      acc[categoryName] = []
    }
    acc[categoryName].push(product)
    return acc
  }, {} as Record<string, Product[]>)

  // Sort categories alphabetically
  const sortedCategories = Object.keys(groupedProducts).sort()

  // Create PDF
  const doc = new jsPDF({
    orientation: selectedColumns.length > 6 ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  // Add title
  doc.setFontSize(16)
  doc.text('SYD Construction Supplies - Products Export', 14, 15)
  doc.setFontSize(10)
  doc.text(format(new Date(), 'MMMM dd, yyyy HH:mm:ss'), 14, 22)

  let yPosition = 30

  sortedCategories.forEach((categoryName, categoryIndex) => {
    // Check if we need a new page
    if (yPosition > 250) {
      doc.addPage()
      yPosition = 20
    }

    // Add category header
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(categoryName, 14, yPosition)
    yPosition += 7

    // Prepare table data
    const tableData = groupedProducts[categoryName].map(product =>
      columns.map(col => String(col.getValue(product)))
    )

    // Add table
    ;(doc as any).autoTable({
      startY: yPosition,
      head: [columns.map(col => col.label)],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [255, 193, 7], textColor: [0, 0, 0], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: 14, right: 14 },
      didDrawPage: (data: any) => {
        // Footer
        const pageCount = (doc as any).internal.getNumberOfPages()
        doc.setFontSize(8)
        doc.text(
          `Page ${data.pageNumber} of ${pageCount}`,
          doc.internal.pageSize.width / 2,
          doc.internal.pageSize.height - 10,
          { align: 'center' }
        )
      }
    })

    yPosition = (doc as any).lastAutoTable.finalY + 10
  })

  // Save PDF
  doc.save(`products_export_${format(new Date(), 'yyyy-MM-dd_HHmmss')}.pdf`)
}
