'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { User, Building, Bell, Lock, Printer, Loader2, RefreshCw } from 'lucide-react'
import { usePrinterStore } from '@/lib/stores/printer'
import { listCupsPrinters, printUSBTestReceipt, type CupsPrinter } from '@/lib/utils/usb-thermal-print'
import { toast } from 'sonner'

function PrinterSettingsCard() {
  const { cupsQueueName, setCupsQueueName } = usePrinterStore()

  const [printers, setPrinters]     = useState<CupsPrinter[]>([])
  const [isLoading, setIsLoading]   = useState(false)
  const [isTesting, setIsTesting]   = useState(false)

  const refreshPrinters = useCallback(async () => {
    setIsLoading(true)
    try {
      const list = await listCupsPrinters()
      setPrinters(list)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshPrinters()
  }, [refreshPrinters])

  const handleTestPrint = async () => {
    if (!cupsQueueName) {
      toast.error('No printer selected')
      return
    }
    setIsTesting(true)
    const toastId = toast.loading('Sending test print…')
    try {
      await printUSBTestReceipt(cupsQueueName)
      toast.success('Test receipt printed!', { id: toastId })
    } catch (err: any) {
      toast.error(err?.message || 'Test print failed', { id: toastId })
    } finally {
      setIsTesting(false)
    }
  }

  const selectedPrinter = printers.find((p) => p.name === cupsQueueName)

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            <CardTitle>Thermal Printer</CardTitle>
          </div>
          {selectedPrinter ? (
            selectedPrinter.status === 'idle' ? (
              <Badge variant="default">Ready</Badge>
            ) : selectedPrinter.status === 'disabled' ? (
              <Badge variant="destructive">Disabled</Badge>
            ) : (
              <Badge variant="secondary">Busy</Badge>
            )
          ) : cupsQueueName ? (
            <Badge variant="secondary">Not Found</Badge>
          ) : (
            <Badge variant="outline">Not Configured</Badge>
          )}
        </div>
        <CardDescription>
          VOZY G80 (80 mm) connected via USB — raw ESC/POS via CUPS
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Printer selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>CUPS Printer Queue</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={refreshPrinters}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-1">Refresh</span>
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Scanning for printers…
            </div>
          ) : printers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No CUPS printers found. Make sure the printer is connected and powered on.
            </p>
          ) : (
            <Select value={cupsQueueName} onValueChange={setCupsQueueName}>
              <SelectTrigger>
                <SelectValue placeholder="Select a printer…" />
              </SelectTrigger>
              <SelectContent>
                {printers.map((p) => (
                  <SelectItem key={p.name} value={p.name}>
                    <span>{p.name.replace(/_/g, ' ')}</span>
                    <span className="ml-2 text-xs text-muted-foreground capitalize">
                      ({p.status})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <p className="text-xs text-muted-foreground">
            The printer must be registered in macOS System Settings → Printers & Scanners.
          </p>
        </div>

        {/* Selected printer details */}
        {selectedPrinter && (
          <div className="rounded-lg border p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Queue name:</span>
              <span className="font-mono text-xs">{selectedPrinter.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paper width:</span>
              <span>80 mm (48 chars)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Auto-cut:</span>
              <span>Enabled</span>
            </div>
          </div>
        )}

        {/* Test print */}
        <Button
          onClick={handleTestPrint}
          disabled={isTesting || !cupsQueueName}
        >
          {isTesting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Printer className="mr-2 h-4 w-4" />
          )}
          Test Print
        </Button>
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and application settings</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Printer Settings — full width */}
        <PrinterSettingsCard />

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5" />
              <CardTitle>Profile Settings</CardTitle>
            </div>
            <CardDescription>
              Manage your profile information and preferences
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">
              Edit Profile
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              <CardTitle>Security</CardTitle>
            </div>
            <CardDescription>
              Update your password and security settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">
              Change Password
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              <CardTitle>Branch Settings</CardTitle>
            </div>
            <CardDescription>
              Configure your branch information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" disabled>
              Manage Branch
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              <CardTitle>Notifications</CardTitle>
            </div>
            <CardDescription>
              Configure notification preferences
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" disabled>
              Configure Notifications
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
