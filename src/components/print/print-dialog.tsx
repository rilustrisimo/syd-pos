'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { Printer, FileText, Receipt, X, Check, Package, Loader2, Wifi, WifiOff } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { ReceiptTemplate, ReceiptData } from './receipt-template'
import { InvoiceTemplate, InvoiceData } from './invoice-template'
import { PackingSlipTemplate, PackingSlipData } from './packing-slip-template'
import { printElement } from '@/lib/utils/print'
import { checkPrinterStatus, printThermalReceipt } from '@/lib/utils/thermal-print'
import { usePrinterStore } from '@/lib/stores/printer'
import { toast } from 'sonner'

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
  const [activeTab, setActiveTab] = useState<'receipt' | 'invoice' | 'packing'>('receipt')
  const [receiptWidth, setReceiptWidth] = useState<'58mm' | '80mm'>('80mm')
  const [printerConnected, setPrinterConnected] = useState<boolean | null>(null)
  const [isThermalPrinting, setIsThermalPrinting] = useState(false)
  const receiptRef = useRef<HTMLDivElement>(null)
  const invoiceRef = useRef<HTMLDivElement>(null)
  const packingRef = useRef<HTMLDivElement>(null)

  const { serverUrl, receiptWidth: savedWidth } = usePrinterStore()

  // Use saved width preference
  useEffect(() => {
    setReceiptWidth(savedWidth)
  }, [savedWidth])

  // Check printer status when dialog opens
  const checkStatus = useCallback(async () => {
    const status = await checkPrinterStatus(serverUrl)
    setPrinterConnected(status?.connected ?? null)
  }, [serverUrl])

  useEffect(() => {
    if (open) {
      checkStatus()
    }
  }, [open, checkStatus])

  // Thermal print (sends to local print server → Vozy G80)
  const handleThermalPrint = async () => {
    if (!receiptData) return

    setIsThermalPrinting(true)
    try {
      await printThermalReceipt(serverUrl, receiptData, receiptWidth)
      toast.success('Receipt sent to thermal printer')
    } catch (error: any) {
      const message = error.message || 'Failed to print'
      if (message.includes('not connected')) {
        toast.error('Printer not connected. Make sure the Vozy G80 is on and Bluetooth is connected.')
      } else if (message.includes('not responding') || message.includes('Failed to fetch')) {
        toast.error('Print server not running. Start it with: cd print-server && npm start')
      } else {
        toast.error(message)
      }
    } finally {
      setIsThermalPrinting(false)
    }
  }

  // Browser print (fallback)
  const handlePrintReceipt = () => {
    if (receiptRef.current) {
      printElement(receiptRef.current, {
        title: `Receipt - ${receiptData?.transaction_number}`,
        paperSize: receiptWidth === '58mm' ? 'thermal-58mm' : 'thermal-80mm',
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
            {/* Printer status indicator */}
            {printerConnected !== null && (
              <Badge
                variant={printerConnected ? 'default' : 'secondary'}
                className="ml-2 text-xs"
              >
                {printerConnected ? (
                  <><Wifi className="mr-1 h-3 w-3" /> Thermal Printer Connected</>
                ) : (
                  <><WifiOff className="mr-1 h-3 w-3" /> Thermal Printer Offline</>
                )}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Preview and print receipt, invoice, or packing slip for this transaction
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'receipt' | 'invoice' | 'packing')}
          className="flex-1 overflow-hidden flex flex-col"
        >
          <TabsList className={`grid w-full ${hasPackingSlip ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <TabsTrigger value="receipt" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Thermal Receipt
            </TabsTrigger>
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

          <TabsContent
            value="receipt"
            className="flex-1 overflow-auto mt-4 flex flex-col"
          >
            {/* Receipt Size Toggle */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-muted-foreground">Paper width:</span>
              <div className="flex gap-1">
                <Button
                  variant={receiptWidth === '58mm' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setReceiptWidth('58mm')}
                >
                  58mm
                </Button>
                <Button
                  variant={receiptWidth === '80mm' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setReceiptWidth('80mm')}
                >
                  80mm
                </Button>
              </div>
            </div>

            {/* Receipt Preview */}
            <div className="flex-1 overflow-auto bg-gray-100 rounded-lg p-4 flex justify-center">
              <div className="bg-white shadow-lg">
                {receiptData && (
                  <ReceiptTemplate
                    ref={receiptRef}
                    data={receiptData}
                    width={receiptWidth}
                  />
                )}
              </div>
            </div>

            {/* Print Buttons */}
            <div className="mt-4 flex flex-wrap gap-2 justify-end">
              {/* Thermal Print (direct to printer — no dialog) */}
              <Button
                onClick={handleThermalPrint}
                disabled={isThermalPrinting || printerConnected === false}
                className="w-full sm:w-auto"
              >
                {isThermalPrinting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="mr-2 h-4 w-4" />
                )}
                {isThermalPrinting ? 'Printing...' : 'Print to Thermal'}
              </Button>

              {/* Browser print (fallback) */}
              <Button
                variant="outline"
                onClick={handlePrintReceipt}
                className="w-full sm:w-auto"
              >
                <FileText className="mr-2 h-4 w-4" />
                Browser Print
              </Button>
            </div>
          </TabsContent>

          <TabsContent
            value="invoice"
            className="flex-1 overflow-auto mt-4 flex flex-col"
          >
            {/* Invoice Preview */}
            <div className="flex-1 overflow-auto bg-gray-100 rounded-lg p-4">
              <div
                className="bg-white shadow-lg mx-auto"
                style={{ maxWidth: '210mm', transform: 'scale(0.7)', transformOrigin: 'top center' }}
              >
                {invoiceData && (
                  <InvoiceTemplate ref={invoiceRef} data={invoiceData} />
                )}
              </div>
            </div>

            {/* Print Buttons */}
            <div className="mt-4 flex flex-wrap gap-2 justify-end">
              {invoiceData?.delivery_type === 'delivery' && (
                <Button
                  variant="outline"
                  onClick={handlePrintDeliveryReceipt}
                >
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
            <TabsContent
              value="packing"
              className="flex-1 overflow-auto mt-4 flex flex-col"
            >
              {/* Packing Slip Preview */}
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

              {/* Print Button */}
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
