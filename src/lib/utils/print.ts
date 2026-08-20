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

