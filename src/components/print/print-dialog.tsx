'use client'

import { useRef, useState, useEffect } from 'react'
import { Printer, FileText, Receipt, X, Check, Package, RefreshCw, Bluetooth } from 'lucide-react'
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
import { buildReceiptBytes } from '@/lib/utils/usb-thermal-print'
import { listCupsPrinters, printUSBReceipt, type CupsPrinter } from '@/lib/utils/usb-thermal-print'
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

  // ── Environment detection ────────────────────────────────────────────────
  const isElectron   = typeof window !== 'undefined' && !!window.electronPrint
  const hasBluetooth = typeof window !== 'undefined' && !!window.electronBluetooth

  // ── Printer store ────────────────────────────────────────────────────────
  const { btPortPath, setBtPortPath, paperWidth, setPaperWidth, cupsQueueName, setCupsQueueName } = usePrinterStore()

  // ── Bluetooth / COM port state ───────────────────────────────────────────
  type SerialPort = { path: string; displayName: string }
  const [serialPorts, setSerialPorts]     = useState<SerialPort[]>([])
  const [loadingPorts, setLoadingPorts]   = useState(false)
  const [btPrinting, setBtPrinting]       = useState(false)
  const [btError, setBtError]             = useState<string | null>(null)

  // ── macOS CUPS state (web / non-Electron) ────────────────────────────────
  const [cupsPrinters, setCupsPrinters]   = useState<CupsPrinter[]>([])
  const [cupsPrinting, setCupsPrinting]   = useState(false)

  // ── Load on open ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    setBtError(null)
    if (hasBluetooth) {
      loadSerialPorts()
    } else if (!isElectron) {
      listCupsPrinters().then(setCupsPrinters).catch(() => setCupsPrinters([]))
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadSerialPorts = () => {
    if (!window.electronBluetooth) return
    setLoadingPorts(true)
    window.electronBluetooth.listPorts()
      .then(setSerialPorts)
      .catch(() => setSerialPorts([]))
      .finally(() => setLoadingPorts(false))
  }

  // ── Bluetooth print ──────────────────────────────────────────────────────
  const handleBluetoothPrint = async () => {
    if (!receiptData || !btPortPath || !window.electronBluetooth) return
    setBtPrinting(true)
    setBtError(null)
    try {
      const bytes  = buildReceiptBytes(receiptData)
      let binary   = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const b64    = btoa(binary)
      const result = await window.electronBluetooth.printBytes(btPortPath, b64)
      if (!result.success) setBtError(result.error || 'Print failed')
    } catch (err: any) {
      setBtError(err?.message || 'Print failed')
    } finally {
      setBtPrinting(false)
    }
  }

  // ── macOS CUPS print ─────────────────────────────────────────────────────
  const handleCupsPrint = async () => {
    if (!receiptData) return
    setCupsPrinting(true)
    try {
      await printUSBReceipt(receiptData, cupsQueueName)
    } catch (err: any) {
      console.error('[cups] Print failed:', err)
    } finally {
      setCupsPrinting(false)
    }
  }

  // ── A4 print helpers ─────────────────────────────────────────────────────
  const handlePrintReceipt = () => {
    if (receiptRef.current) printElement(receiptRef.current, { title: `Receipt - ${receiptData?.transaction_number}`, paperSize: 'a4' })
  }
  const handlePrintInvoice = () => {
    if (invoiceRef.current) printElement(invoiceRef.current, { title: `Invoice - ${invoiceData?.invoice_number}`, paperSize: 'a4' })
  }
  const handlePrintDeliveryReceipt = () => {
    if (invoiceRef.current) printElement(invoiceRef.current, { title: `Delivery Receipt - ${invoiceData?.invoice_number}`, paperSize: 'a4' })
  }
  const handlePrintPackingSlip = () => {
    if (packingRef.current) printElement(packingRef.current, { title: `Packing Slip - ${packingSlipData?.slip_number}`, paperSize: 'a4' })
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
                  {receiptData && <ReceiptTemplate ref={receiptRef} data={receiptData} />}
                </div>
              </div>

              {/* ── Thermal printer section ── */}
              <div className="mt-4 border rounded-lg p-3 space-y-2 bg-muted/30">

                {hasBluetooth ? (
                  // ── Electron: Bluetooth / COM port ──────────────────────
                  <>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium flex items-center gap-1.5">
                        <Bluetooth className="h-3.5 w-3.5" />
                        Bluetooth Printer
                      </Label>
                      <Button variant="ghost" size="sm" onClick={loadSerialPorts} disabled={loadingPorts}>
                        <RefreshCw className={`h-3.5 w-3.5 ${loadingPorts ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>

                    <Select value={btPortPath} onValueChange={setBtPortPath}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder={loadingPorts ? 'Scanning ports…' : 'Select COM port'} />
                      </SelectTrigger>
                      <SelectContent>
                        {serialPorts.length === 0 && !loadingPorts && (
                          <SelectItem value="_none" disabled>No COM ports found — pair printer in Windows Bluetooth settings</SelectItem>
                        )}
                        {serialPorts.map((p) => (
                          <SelectItem key={p.path} value={p.path}>
                            {p.path} {p.displayName !== p.path ? `— ${p.displayName}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Paper width (mirrors mobile setting) */}
                    <div className="flex gap-2">
                      {(['58mm', '80mm'] as const).map((w) => (
                        <Button
                          key={w}
                          variant={paperWidth === w ? 'default' : 'outline'}
                          size="sm"
                          className="flex-1 h-7 text-xs"
                          onClick={() => setPaperWidth(w)}
                        >
                          {w}
                        </Button>
                      ))}
                    </div>

                    {btError && (
                      <p className="text-xs text-destructive">{btError}</p>
                    )}

                    <Button
                      className="w-full"
                      size="sm"
                      onClick={handleBluetoothPrint}
                      disabled={btPrinting || !btPortPath || btPortPath === '_none'}
                    >
                      <Bluetooth className="mr-2 h-3.5 w-3.5" />
                      {btPrinting ? 'Printing…' : 'Print to Bluetooth Printer'}
                    </Button>
                  </>
                ) : (
                  // ── macOS / web: CUPS ────────────────────────────────────
                  <>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Thermal Printer (CUPS)</Label>
                    </div>

                    {cupsPrinters.length > 0 ? (
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
                    )}

                    <Button
                      className="w-full"
                      size="sm"
                      onClick={handleCupsPrint}
                      disabled={cupsPrinting || !cupsQueueName}
                    >
                      <Printer className="mr-2 h-3.5 w-3.5" />
                      {cupsPrinting ? 'Printing…' : 'Print to Thermal Printer'}
                    </Button>
                  </>
                )}
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
                  {packingSlipData && <PackingSlipTemplate ref={packingRef} data={packingSlipData} />}
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
