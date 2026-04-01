'use client'

import { useRef, useState, useEffect } from 'react'
import { Printer, FileText, Receipt, X, Check, Package, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ReceiptTemplate, ReceiptData } from './receipt-template'
import { InvoiceTemplate, InvoiceData } from './invoice-template'
import { PackingSlipTemplate, PackingSlipData } from './packing-slip-template'
import { printElement } from '@/lib/utils/print'
import { printUSBReceipt, listCupsPrinters, type CupsPrinter } from '@/lib/utils/usb-thermal-print'
import { usePrinterStore } from '@/lib/stores/printer'

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

  // ── Thermal printer state ───────────────────────────────────────────────
  const { cupsQueueName, setCupsQueueName } = usePrinterStore()
  const isElectron = typeof window !== 'undefined' && !!window.electronPrint

  type UsbDevice = { vendorId: number; productId: number; manufacturer?: string; product?: string }
  const [usbDevices, setUsbDevices] = useState<UsbDevice[]>([])
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [cupsPrinters, setCupsPrinters] = useState<CupsPrinter[]>([])
  const [thermalPrinting, setThermalPrinting] = useState(false)

  // Load available printers when the dialog opens
  useEffect(() => {
    if (!open) return

    if (isElectron) {
      setLoadingDevices(true)
      window.electronPrint!.listUsbPrinters()
        .then(setUsbDevices)
        .catch(() => setUsbDevices([]))
        .finally(() => setLoadingDevices(false))
    } else {
      listCupsPrinters().then(setCupsPrinters).catch(() => setCupsPrinters([]))
    }
  }, [open, isElectron])

  const handleThermalPrint = async () => {
    if (!receiptData) return
    setThermalPrinting(true)
    try {
      await printUSBReceipt(receiptData, cupsQueueName)
    } catch (err: any) {
      console.error('[thermal] Print failed:', err)
    } finally {
      setThermalPrinting(false)
    }
  }

  const handleRefreshDevices = () => {
    if (isElectron) {
      setLoadingDevices(true)
      window.electronPrint!.listUsbPrinters()
        .then(setUsbDevices)
        .catch(() => setUsbDevices([]))
        .finally(() => setLoadingDevices(false))
    } else {
      listCupsPrinters().then(setCupsPrinters).catch(() => setCupsPrinters([]))
    }
  }

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

              {/* Thermal printer section */}
              <div className="mt-4 border rounded-lg p-3 space-y-2 bg-muted/30">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Thermal Printer</Label>
                  <Button variant="ghost" size="sm" onClick={handleRefreshDevices} disabled={loadingDevices}>
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingDevices ? 'animate-spin' : ''}`} />
                  </Button>
                </div>

                {isElectron ? (
                  // Electron: USB device picker
                  <Select
                    value={cupsQueueName}
                    onValueChange={setCupsQueueName}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder={loadingDevices ? 'Scanning USB…' : 'Select USB printer'} />
                    </SelectTrigger>
                    <SelectContent>
                      {usbDevices.length === 0 && !loadingDevices && (
                        <SelectItem value="_none" disabled>No USB printers found</SelectItem>
                      )}
                      {usbDevices.map((d) => {
                        const key = `usb:${d.vendorId}:${d.productId}`
                        return (
                          <SelectItem key={key} value={key}>
                            {d.product || `USB ${d.vendorId.toString(16).padStart(4,'0')}:${d.productId.toString(16).padStart(4,'0')}`}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                ) : (
                  // Browser / macOS: CUPS queue selector or manual input
                  cupsPrinters.length > 0 ? (
                    <Select value={cupsQueueName} onValueChange={setCupsQueueName}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select CUPS printer" />
                      </SelectTrigger>
                      <SelectContent>
                        {cupsPrinters.map((p) => (
                          <SelectItem key={p.name} value={p.name}>
                            {p.name} <span className="text-muted-foreground ml-1">({p.status})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      className="h-8 text-sm"
                      placeholder="CUPS queue name (e.g. STMicroelectronics_POS80…)"
                      value={cupsQueueName}
                      onChange={(e) => setCupsQueueName(e.target.value)}
                    />
                  )
                )}

                <Button
                  className="w-full"
                  size="sm"
                  onClick={handleThermalPrint}
                  disabled={thermalPrinting || !cupsQueueName || cupsQueueName === '_none'}
                >
                  <Printer className="mr-2 h-3.5 w-3.5" />
                  {thermalPrinting ? 'Printing…' : 'Print to Thermal Printer'}
                </Button>
              </div>

              <div className="mt-3 flex justify-end">
                <Button variant="outline" onClick={handlePrintReceipt}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print A4 Receipt
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
