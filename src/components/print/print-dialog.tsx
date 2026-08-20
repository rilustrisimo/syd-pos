'use client'

import { useRef, useState, useEffect } from 'react'
import { Printer, FileText, Truck, X, Check, Package, RefreshCw, Bluetooth, ClipboardCheck } from 'lucide-react'
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
import { InvoiceTemplate, InvoiceData } from './invoice-template'
import { PackingSlipTemplate, PackingSlipData } from './packing-slip-template'
import { printElement } from '@/lib/utils/print'
import { printDeliverySlip, printPickupSlip, listCupsPrinters, type CupsPrinter, type ReceiptData } from '@/lib/utils/usb-thermal-print'
import { usePrinterStore } from '@/lib/stores/printer'

interface PrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Holds the ReceiptData for whichever slip applies to this order — its
  // own delivery_type decides whether the Delivery Slip or Pickup Slip tab
  // is shown; the two are mutually exclusive per order.
  deliverySlipData: ReceiptData | null
  invoiceData: InvoiceData | null
  packingSlipData?: PackingSlipData | null
  onComplete?: () => void
}

export function PrintDialog({
  open,
  onOpenChange,
  deliverySlipData,
  invoiceData,
  packingSlipData,
  onComplete,
}: PrintDialogProps) {
  const hasDeliverySlipTab = deliverySlipData !== null && deliverySlipData !== undefined && deliverySlipData.delivery_type === 'delivery'
  const hasPickupSlipTab   = deliverySlipData !== null && deliverySlipData !== undefined && deliverySlipData.delivery_type === 'pickup'
  const [activeTab, setActiveTab] = useState<'delivery' | 'pickup' | 'invoice' | 'packing'>('delivery')

  // Always reset to the relevant slip tab (or Sales Summary if neither) when dialog opens
  useEffect(() => {
    if (!open) return
    setActiveTab(hasDeliverySlipTab ? 'delivery' : hasPickupSlipTab ? 'pickup' : 'invoice')
  }, [open, hasDeliverySlipTab, hasPickupSlipTab])
  const invoiceRef = useRef<HTMLDivElement>(null)
  const packingRef = useRef<HTMLDivElement>(null)

  // ── Environment detection ────────────────────────────────────────────────
  const isElectron   = typeof window !== 'undefined' && !!window.electronPrint
  const hasBluetooth = typeof window !== 'undefined' && !!window.electronBluetooth

  // ── Printer store ────────────────────────────────────────────────────────
  const { btPortPath, setBtPortPath, paperWidth, setPaperWidth, cupsQueueName, setCupsQueueName } = usePrinterStore()

  // ── Bluetooth / COM port + USB state ─────────────────────────────────────
  type SerialPort = { path: string; displayName: string }
  type UsbPrinter = { vendorId: number; productId: number; label: string }
  const [serialPorts, setSerialPorts]     = useState<SerialPort[]>([])
  const [usbPrinters, setUsbPrinters]     = useState<UsbPrinter[]>([])
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
    if (hasBluetooth || isElectron) {
      loadPrinters()
    } else {
      listCupsPrinters().then(setCupsPrinters).catch(() => setCupsPrinters([]))
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadPrinters = () => {
    setLoadingPorts(true)
    const tasks: Promise<void>[] = []

    if (window.electronBluetooth) {
      tasks.push(
        window.electronBluetooth.listPorts()
          .then(setSerialPorts)
          .catch(() => setSerialPorts([]))
      )
    }
    if (window.electronPrint) {
      tasks.push(
        window.electronPrint.listUsbPrinters()
          .then((devices) => setUsbPrinters(
            devices.map((d) => ({
              vendorId:  d.vendorId,
              productId: d.productId,
              label: d.manufacturer && d.product
                ? `${d.manufacturer} ${d.product}`
                : `USB Printer (${d.vendorId.toString(16)}:${d.productId.toString(16)})`,
            }))
          ))
          .catch(() => setUsbPrinters([]))
      )
    }

    Promise.all(tasks).finally(() => setLoadingPorts(false))
  }

  // ── Bluetooth print ──────────────────────────────────────────────────────
  const charWidth = paperWidth === '58mm' ? 32 : 48

  // Same "amount to collect" logic as buildDeliverySlipBytes — shown as a
  // sanity check before printing, now that printing is a deliberate action.
  const cashToCollect = (deliverySlipData?.payments ?? [])
    .filter((p) => p.method === 'cash')
    .reduce((sum, p) => sum + p.amount, 0)

  const handleBluetoothPrint = async () => {
    if (!deliverySlipData || !btPortPath) return
    setBtPrinting(true)
    setBtError(null)
    try {
      // printDeliverySlip uses the unified sendBytes routing:
      // "usb:vid:pid" → electronPrint (node-usb), else → electronBluetooth COM
      await printDeliverySlip(deliverySlipData, btPortPath, charWidth)
    } catch (err: any) {
      setBtError(err?.message || 'Print failed')
    } finally {
      setBtPrinting(false)
    }
  }

  // ── macOS CUPS print ─────────────────────────────────────────────────────
  const handleCupsPrint = async () => {
    if (!deliverySlipData) return
    setCupsPrinting(true)
    try {
      await printDeliverySlip(deliverySlipData, cupsQueueName, charWidth)
    } catch (err: any) {
      console.error('[cups] Print failed:', err)
    } finally {
      setCupsPrinting(false)
    }
  }

  // ── Pickup slip print (staff-internal, thermal only) ────────────────────
  const handlePickupBluetoothPrint = async () => {
    if (!deliverySlipData || !btPortPath) return
    setBtPrinting(true)
    setBtError(null)
    try {
      await printPickupSlip(deliverySlipData, btPortPath, charWidth)
    } catch (err: any) {
      setBtError(err?.message || 'Print failed')
    } finally {
      setBtPrinting(false)
    }
  }

  const handlePickupCupsPrint = async () => {
    if (!deliverySlipData) return
    setCupsPrinting(true)
    try {
      await printPickupSlip(deliverySlipData, cupsQueueName, charWidth)
    } catch (err: any) {
      console.error('[cups] Print failed:', err)
    } finally {
      setCupsPrinting(false)
    }
  }

  // ── A4 print helpers ─────────────────────────────────────────────────────
  const handlePrintInvoice = () => {
    if (invoiceRef.current) printElement(invoiceRef.current, { title: `Sales Summary - ${invoiceData?.transaction_number}`, paperSize: 'a4' })
  }
  const handlePrintPackingSlip = () => {
    if (packingRef.current) printElement(packingRef.current, { title: `Packing Slip - ${packingSlipData?.slip_number}`, paperSize: 'a4' })
  }

  const handleDone = () => {
    onOpenChange(false)
    onComplete?.()
  }

  const hasPackingSlip = packingSlipData !== null && packingSlipData !== undefined
  const hasInvoice     = invoiceData !== null && invoiceData !== undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Print Document
          </DialogTitle>
          <DialogDescription>
            Preview and print the delivery slip, pickup slip, sales summary, or packing slip
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'delivery' | 'pickup' | 'invoice' | 'packing')}
          className="flex-1 overflow-hidden flex flex-col"
        >
          <TabsList className={`grid w-full grid-cols-${[hasDeliverySlipTab, hasPickupSlipTab, hasInvoice, hasPackingSlip].filter(Boolean).length || 1}`}>
            {hasDeliverySlipTab && (
              <TabsTrigger value="delivery" className="flex items-center gap-2">
                <Truck className="h-4 w-4" />
                Delivery Slip
              </TabsTrigger>
            )}
            {hasPickupSlipTab && (
              <TabsTrigger value="pickup" className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4" />
                Pickup Slip
              </TabsTrigger>
            )}
            {hasInvoice && (
            <TabsTrigger value="invoice" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Sales Summary
            </TabsTrigger>
            )}
            {hasPackingSlip && (
              <TabsTrigger value="packing" className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Packing Slip
              </TabsTrigger>
            )}
          </TabsList>

          {hasDeliverySlipTab && (
            <TabsContent value="delivery" className="flex-1 overflow-auto mt-4 flex flex-col">
              {/* Small sanity-check preview — no full receipt template anymore,
                  this is a logistics document (recipient + amount to collect),
                  not a priced document to review line by line. */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-1.5 text-sm">
                <p className="font-medium">{deliverySlipData?.customer.name}</p>
                {deliverySlipData?.customer.phone && (
                  <p className="text-muted-foreground">{deliverySlipData.customer.phone}</p>
                )}
                {deliverySlipData?.delivery_address && (
                  <p className="text-muted-foreground">{deliverySlipData.delivery_address}</p>
                )}
                <p className="text-xs text-muted-foreground pt-1">
                  {(deliverySlipData?.items.length ?? 0)} item{(deliverySlipData?.items.length ?? 0) === 1 ? '' : 's'}
                </p>
                {cashToCollect > 0 ? (
                  <p className="font-semibold pt-1">
                    Amount to collect: {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(cashToCollect)}
                  </p>
                ) : (
                  <p className="text-muted-foreground pt-1">No cash to collect on delivery</p>
                )}
              </div>

              {/* ── Thermal printer section ── */}
              <div className="mt-4 border rounded-lg p-3 space-y-2 bg-muted/30">

                {(hasBluetooth || isElectron) ? (
                  // ── Electron: Bluetooth/COM + USB ────────────────────────
                  <>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium flex items-center gap-1.5">
                        <Bluetooth className="h-3.5 w-3.5" />
                        Thermal Printer
                      </Label>
                      <Button variant="ghost" size="sm" onClick={loadPrinters} disabled={loadingPorts}>
                        <RefreshCw className={`h-3.5 w-3.5 ${loadingPorts ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>

                    <Select value={btPortPath} onValueChange={setBtPortPath}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder={loadingPorts ? 'Scanning…' : 'Select printer'} />
                      </SelectTrigger>
                      <SelectContent>
                        {serialPorts.length === 0 && usbPrinters.length === 0 && !loadingPorts && (
                          <SelectItem value="_none" disabled>No printers found — pair Bluetooth or connect USB printer</SelectItem>
                        )}
                        {serialPorts.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-xs text-muted-foreground font-medium">Bluetooth / COM</div>
                            {serialPorts.map((p) => (
                              <SelectItem key={p.path} value={p.path}>
                                {p.path} {p.displayName !== p.path ? `— ${p.displayName}` : ''}
                              </SelectItem>
                            ))}
                          </>
                        )}
                        {usbPrinters.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-xs text-muted-foreground font-medium">USB</div>
                            {usbPrinters.map((u) => (
                              <SelectItem key={`usb:${u.vendorId}:${u.productId}`} value={`usb:${u.vendorId}:${u.productId}`}>
                                {u.label}
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>

                    {/* Paper width */}
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
                      <Printer className="mr-2 h-3.5 w-3.5" />
                      {btPrinting ? 'Printing…' : 'Print to Thermal Printer'}
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
            </TabsContent>
          )}

          {hasPickupSlipTab && (
            <TabsContent value="pickup" className="flex-1 overflow-auto mt-4 flex flex-col">
              {/* Staff-internal only — never shown to or handed to the customer.
                  This is the copy staff use to pull stock and hand-write the
                  real Invoice/OR into the BIR-registered booklet. */}
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">Staff use only — not for the customer.</p>
                <p className="text-xs mt-0.5">Use this to pull stock and copy details into the paper Invoice/OR.</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4 space-y-1.5 text-sm mt-3">
                <p className="font-medium">{deliverySlipData?.customer.name}</p>
                <p className="text-xs text-muted-foreground pt-1">
                  {(deliverySlipData?.items.length ?? 0)} item{(deliverySlipData?.items.length ?? 0) === 1 ? '' : 's'}
                </p>
                <p className="font-semibold pt-1">
                  Total: {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(deliverySlipData?.total ?? 0)}
                </p>
              </div>

              {/* ── Thermal printer section (same printer selection as the delivery slip) ── */}
              <div className="mt-4 border rounded-lg p-3 space-y-2 bg-muted/30">

                {(hasBluetooth || isElectron) ? (
                  <>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium flex items-center gap-1.5">
                        <Bluetooth className="h-3.5 w-3.5" />
                        Thermal Printer
                      </Label>
                      <Button variant="ghost" size="sm" onClick={loadPrinters} disabled={loadingPorts}>
                        <RefreshCw className={`h-3.5 w-3.5 ${loadingPorts ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>

                    <Select value={btPortPath} onValueChange={setBtPortPath}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder={loadingPorts ? 'Scanning…' : 'Select printer'} />
                      </SelectTrigger>
                      <SelectContent>
                        {serialPorts.length === 0 && usbPrinters.length === 0 && !loadingPorts && (
                          <SelectItem value="_none" disabled>No printers found — pair Bluetooth or connect USB printer</SelectItem>
                        )}
                        {serialPorts.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-xs text-muted-foreground font-medium">Bluetooth / COM</div>
                            {serialPorts.map((p) => (
                              <SelectItem key={p.path} value={p.path}>
                                {p.path} {p.displayName !== p.path ? `— ${p.displayName}` : ''}
                              </SelectItem>
                            ))}
                          </>
                        )}
                        {usbPrinters.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-xs text-muted-foreground font-medium">USB</div>
                            {usbPrinters.map((u) => (
                              <SelectItem key={`usb:${u.vendorId}:${u.productId}`} value={`usb:${u.vendorId}:${u.productId}`}>
                                {u.label}
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>

                    {/* Paper width */}
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
                      onClick={handlePickupBluetoothPrint}
                      disabled={btPrinting || !btPortPath || btPortPath === '_none'}
                    >
                      <Printer className="mr-2 h-3.5 w-3.5" />
                      {btPrinting ? 'Printing…' : 'Print Pickup Slip'}
                    </Button>
                  </>
                ) : (
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
                      onClick={handlePickupCupsPrint}
                      disabled={cupsPrinting || !cupsQueueName}
                    >
                      <Printer className="mr-2 h-3.5 w-3.5" />
                      {cupsPrinting ? 'Printing…' : 'Print Pickup Slip'}
                    </Button>
                  </>
                )}
              </div>
            </TabsContent>
          )}

          <TabsContent value="invoice" className="flex-1 overflow-auto mt-4 flex flex-col">
            <div className="flex-1 overflow-auto bg-gray-100 rounded-lg p-4 flex justify-center items-start">
              <div className="bg-white shadow-lg" style={{ width: '210mm', transformOrigin: 'top center', transform: 'scale(0.7)' }}>
                {invoiceData && <InvoiceTemplate ref={invoiceRef} data={invoiceData} />}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 justify-end">
              <Button onClick={handlePrintInvoice}>
                <Printer className="mr-2 h-4 w-4" />
                Print Sales Summary
              </Button>
            </div>
          </TabsContent>

          {hasPackingSlip && (
            <TabsContent value="packing" className="flex-1 overflow-auto mt-4 flex flex-col">
              <div className="flex-1 overflow-auto bg-gray-100 rounded-lg p-4 flex justify-center items-start">
                <div className="bg-white shadow-lg" style={{ width: '210mm', transformOrigin: 'top center', transform: 'scale(0.7)' }}>
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
