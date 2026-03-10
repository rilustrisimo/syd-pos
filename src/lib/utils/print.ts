/**
 * Print utilities for A4 standard printer
 */

export interface PrintOptions {
  title?: string
  paperSize?: 'a4'
  orientation?: 'portrait' | 'landscape'
}

/**
 * Print content from a DOM element
 */
export function printElement(
  element: HTMLElement,
  options: PrintOptions = {}
): void {
  const { title = 'Print', paperSize = 'a4', orientation = 'portrait' } = options

  // Create print window
  const printWindow = window.open('', '_blank', 'width=800,height=600')
  if (!printWindow) {
    alert('Please allow popups to print')
    return
  }

  // A4 paper styles
  const paperStyles = `
    @page {
      size: A4 ${orientation};
      margin: 10mm;
    }
    body {
      width: 210mm;
      margin: 0 auto;
    }
  `

  // Write print content
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <meta charset="utf-8">
        <style>
          ${paperStyles}

          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          body {
            font-family: Arial, sans-serif;
            color: #000;
            background: #fff;
          }

          /* Thermal receipt styles */
          .receipt-print {
            font-family: 'Courier New', monospace;
          }

          /* Invoice styles */
          .invoice-print {
            font-family: Arial, sans-serif;
          }

          /* Hide non-printable elements */
          .no-print {
            display: none !important;
          }

          /* Table styles */
          table {
            border-collapse: collapse;
          }

          /* Ensure colors print */
          .bg-gray-50 { background-color: #f9fafb !important; }
          .bg-gray-100 { background-color: #f3f4f6 !important; }
          .bg-gray-800 { background-color: #1f2937 !important; }
          .bg-yellow-50 { background-color: #fefce8 !important; }
          .text-white { color: #ffffff !important; }
          .text-gray-600 { color: #4b5563 !important; }
          .text-gray-700 { color: #374151 !important; }
          .text-green-600 { color: #16a34a !important; }
          .text-red-600 { color: #dc2626 !important; }

          @media print {
            body {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
        </style>
      </head>
      <body>
        ${element.outerHTML}
      </body>
    </html>
  `)

  printWindow.document.close()

  // Wait for content to load, then print
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 250)
  }
}

/**
 * Generate invoice number from transaction number
 */
export function generateInvoiceNumber(transactionNumber: string): string {
  // Replace TXN with INV
  return transactionNumber.replace('TXN', 'INV')
}

/**
 * Format transaction data for receipt
 */
export function formatReceiptData(transaction: any, branch: any, user: any): any {
  const transactionDate = new Date(transaction.transaction_date)

  return {
    transaction_number: transaction.transaction_number,
    date: transactionDate.toLocaleDateString('en-PH'),
    time: transactionDate.toLocaleTimeString('en-PH', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    cashier: user?.full_name || user?.email || 'Staff',
    branch: branch?.name || 'Main Branch',
    customer: {
      name: transaction.customer?.name || 'Walk-in Customer',
      phone: transaction.customer?.phone,
    },
    delivery_type: transaction.delivery_type,
    delivery_address: transaction.delivery_address,
    items: (transaction.lines || []).map((line: any) => ({
      name: line.product?.name || 'Product',
      quantity: line.quantity,
      unit_price: line.unit_price,
      uom: line.uom?.abbreviation || line.uom?.name || 'pc',
      discount: line.discount_amount || 0,
      total: line.line_total || line.quantity * line.unit_price - (line.discount_amount || 0),
    })),
    subtotal: transaction.subtotal,
    discount: transaction.discount_amount,
    tax: transaction.tax_amount,
    total: transaction.total_amount,
    payments: (transaction.payments || []).map((p: any) => ({
      method: p.payment_method,
      amount: p.amount,
      reference: p.reference_number,
    })),
    amount_paid: transaction.amount_paid,
    change: Math.max(0, transaction.amount_paid - transaction.total_amount),
    notes: transaction.notes,
  }
}

/**
 * Format transaction data for invoice
 */
export function formatInvoiceData(
  transaction: any,
  branch: any,
  user: any
): any {
  return {
    invoice_number: generateInvoiceNumber(transaction.transaction_number),
    transaction_number: transaction.transaction_number,
    date: transaction.transaction_date,
    due_date: null, // Can be calculated based on payment terms
    branch: {
      name: branch?.name || 'Main Branch',
      address: branch?.address || '',
      phone: branch?.phone || '',
      email: branch?.email,
    },
    customer: {
      name: transaction.customer?.name || 'Walk-in Customer',
      address: transaction.customer?.address,
      phone: transaction.customer?.phone,
      email: transaction.customer?.email,
    },
    delivery_type: transaction.delivery_type,
    delivery_address: transaction.delivery_address,
    delivery_phone: transaction.delivery_phone,
    items: (transaction.lines || []).map((line: any) => ({
      code: line.product?.code || '',
      name: line.product?.name || 'Product',
      quantity: line.quantity,
      uom: line.uom?.abbreviation || line.uom?.name || 'pc',
      unit_price: line.unit_price,
      discount: line.discount_amount || 0,
      total: line.line_total || line.quantity * line.unit_price - (line.discount_amount || 0),
    })),
    subtotal: transaction.subtotal,
    discount: transaction.discount_amount,
    tax: transaction.tax_amount,
    total: transaction.total_amount,
    amount_paid: transaction.amount_paid,
    balance_due: Math.max(0, transaction.total_amount - transaction.amount_paid),
    payments: (transaction.payments || []).map((p: any) => ({
      method: p.payment_method,
      amount: p.amount,
      reference: p.reference_number,
      date: p.payment_date,
    })),
    notes: transaction.notes,
    prepared_by: user?.full_name || user?.email || 'Staff',
  }
}
