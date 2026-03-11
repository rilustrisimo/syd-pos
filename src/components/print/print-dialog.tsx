'use client'

import { useRef, useState } from 'react'
import { Printer, FileText, Receipt, X, Check, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ReceiptTemplate, ReceiptData } from './receipt-template'
import { InvoiceTemplate, InvoiceData } from './invoice-template'
import { PackingSlipTemplate, PackingSlipData } from './packing-slip-template'
import { printElement } from '@/lib/utils/print'

interface PrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  receiptData: ReceiptData | null
  invoiceData: InvoiceData | null
  packingSlipData?: PackingSlipData | null
  onComplete?: () => void
}

export function PrintDialog({
  open,
  onOpenChange,
  receiptData,
  invoiceData,
  packingSlipData,
  onComplete,
}: PrintDialogProps) {
  const hasReceiptTab = receiptData !== null && receiptData !== undefined
  const [activeTab, setActiveTab] = useState<'receipt' | 'invoice' | 'packing'>(
    hasReceiptTab ? 'receipt' : 'invoice'
  )
  const receiptRef = useRef<HTMLDivElement>(null)
  const invoiceRef = useRef<HTMLDivElement>(null)
  const packingRef = useRef<HTMLDivElement>(null)

  const handlePrintReceipt = () => {
    if (receiptRef.current) {
      printElement(receiptRef.current, {
        title: `Receipt - ${receiptData?.transaction_number}`,
        paperSize: 'a4',
      })
    }
  }

  const handlePrintInvoice = () => {
    if (invoiceRef.current) {
      printElement(invoiceRef.current, {
        title: `Invoice - ${invoiceData?.invoice_number}`,
        paperSize: 'a4',
      })
    }
  }

  const handlePrintDeliveryReceipt = () => {
    if (invoiceRef.current) {
      printElement(invoiceRef.current, {
        title: `Delivery Receipt - ${invoiceData?.invoice_number}`,
        paperSize: 'a4',
      })
    }
  }

  const handlePrintPackingSlip = () => {
    if (packingRef.current) {
      printElement(packingRef.current, {
        title: `Packing Slip - ${packingSlipData?.slip_number}`,
        paperSize: 'a4',
      })
    }
  }

  const handleDone = () => {
    onOpenChange(false)
    onComplete?.()
  }

  const hasPackingSlip = packingSlipData !== null && packingSlipData !== undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Print Document
          </DialogTitle>
          <DialogDescription>
            Preview and print the receipt, invoice, or packing slip
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'receipt' | 'invoice' | 'packing')}
          className="flex-1 overflow-hidden flex flex-col"
        >
          <TabsList className={`grid w-full ${hasReceiptTab && hasPackingSlip ? 'grid-cols-3' : hasReceiptTab || hasPackingSlip ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {hasReceiptTab && (
              <TabsTrigger value="receipt" className="flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Receipt
              </TabsTrigger>
            )}
            <TabsTrigger value="invoice" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              A4 Invoice
            </TabsTrigger>
            {hasPackingSlip && (
              <TabsTrigger value="packing" className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Packing Slip
              </TabsTrigger>
            )}
          </TabsList>

          {hasReceiptTab && (
            <TabsContent value="receipt" className="flex-1 overflow-auto mt-4 flex flex-col">
              <div className="flex-1 overflow-auto bg-gray-100 rounded-lg p-4 flex justify-center">
                <div className="bg-white shadow-lg">
                  {receiptData && (
                    <ReceiptTemplate ref={receiptRef} data={receiptData} />
                  )}
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={handlePrintReceipt}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print Receipt
                </Button>
              </div>
            </TabsContent>
          )}

          <TabsContent value="invoice" className="flex-1 overflow-auto mt-4 flex flex-col">
            <div className="flex-1 overflow-auto bg-gray-100 rounded-lg p-4">
              <div
                className="bg-white shadow-lg mx-auto"
                style={{ maxWidth: '210mm', transform: 'scale(0.7)', transformOrigin: 'top center' }}
              >
                {invoiceData && <InvoiceTemplate ref={invoiceRef} data={invoiceData} />}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 justify-end">
              {invoiceData?.delivery_type === 'delivery' && (
                <Button variant="outline" onClick={handlePrintDeliveryReceipt}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print Delivery Receipt
                </Button>
              )}
              <Button onClick={handlePrintInvoice}>
                <Printer className="mr-2 h-4 w-4" />
                Print Invoice
              </Button>
            </div>
          </TabsContent>

          {hasPackingSlip && (
            <TabsContent value="packing" className="flex-1 overflow-auto mt-4 flex flex-col">
              <div className="flex-1 overflow-auto bg-gray-100 rounded-lg p-4">
                <div
                  className="bg-white shadow-lg mx-auto"
                  style={{ maxWidth: '210mm', transform: 'scale(0.8)', transformOrigin: 'top center' }}
                >
                  {packingSlipData && (
                    <PackingSlipTemplate ref={packingRef} data={packingSlipData} />
                  )}
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={handlePrintPackingSlip}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print Packing Slip
                </Button>
              </div>
            </TabsContent>
          )}
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="mr-2 h-4 w-4" />
            Close
          </Button>
          <Button onClick={handleDone}>
            <Check className="mr-2 h-4 w-4" />
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
