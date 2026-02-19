'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { User, Building, Bell, Lock, Printer, Wifi, WifiOff, Loader2, RefreshCw } from 'lucide-react'
import { usePrinterStore } from '@/lib/stores/printer'
import { checkPrinterStatus, printTestReceipt, reconnectPrinter } from '@/lib/utils/thermal-print'
import { toast } from 'sonner'

function PrinterSettingsCard() {
  const { serverUrl, receiptWidth, setServerUrl, setReceiptWidth } = usePrinterStore()
  const [printerStatus, setPrinterStatus] = useState<{
    connected: boolean
    printer: string
    baudRate: number
  } | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [urlInput, setUrlInput] = useState(serverUrl)

  const checkStatus = useCallback(async () => {
    setIsChecking(true)
    try {
      const status = await checkPrinterStatus(serverUrl)
      setPrinterStatus(status)
    } catch {
      setPrinterStatus(null)
    } finally {
      setIsChecking(false)
    }
  }, [serverUrl])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  const handleSaveUrl = () => {
    setServerUrl(urlInput.trim())
    toast.success('Print server URL saved')
    // Re-check status with new URL
    setTimeout(checkStatus, 500)
  }

  const handleTestPrint = async () => {
    setIsTesting(true)
    try {
      await printTestReceipt(serverUrl, receiptWidth)
      toast.success('Test receipt printed!')
    } catch (error: any) {
      toast.error(error.message || 'Test print failed')
    } finally {
      setIsTesting(false)
    }
  }

  const handleReconnect = async () => {
    setIsReconnecting(true)
    try {
      await reconnectPrinter(serverUrl)
      toast.success('Reconnecting to printer...')
      // Check status after a short delay
      setTimeout(checkStatus, 3000)
    } catch (error: any) {
      toast.error(error.message || 'Failed to reconnect')
    } finally {
      setIsReconnecting(false)
    }
  }

  const serverOnline = printerStatus !== null
  const printerConnected = printerStatus?.connected === true

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            <CardTitle>Thermal Printer</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {isChecking ? (
              <Badge variant="secondary">
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Checking...
              </Badge>
            ) : serverOnline ? (
              printerConnected ? (
                <Badge variant="default">
                  <Wifi className="mr-1 h-3 w-3" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <WifiOff className="mr-1 h-3 w-3" />
                  Printer Offline
                </Badge>
              )
            ) : (
              <Badge variant="secondary">
                <WifiOff className="mr-1 h-3 w-3" />
                Server Not Running
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>
          Configure the thermal print server for direct receipt printing to Vozy G80
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Server URL */}
        <div className="space-y-2">
          <Label htmlFor="server-url">Print Server URL</Label>
          <div className="flex gap-2">
            <Input
              id="server-url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="http://localhost:9100"
            />
            <Button
              variant="outline"
              onClick={handleSaveUrl}
              disabled={urlInput === serverUrl}
            >
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The URL of the local print server running on the POS machine
          </p>
        </div>

        {/* Receipt Width */}
        <div className="space-y-2">
          <Label>Default Receipt Width</Label>
          <div className="flex gap-2">
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

        {/* Status Details */}
        {printerStatus && (
          <div className="rounded-lg border p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Printer Port:</span>
              <span className="font-mono">{printerStatus.printer}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Baud Rate:</span>
              <span className="font-mono">{printerStatus.baudRate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status:</span>
              <span>{printerStatus.connected ? 'Ready' : 'Disconnected'}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={checkStatus}
            disabled={isChecking}
          >
            {isChecking ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Check Status
          </Button>
          <Button
            variant="outline"
            onClick={handleReconnect}
            disabled={isReconnecting || !serverOnline}
          >
            {isReconnecting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Reconnect Printer
          </Button>
          <Button
            onClick={handleTestPrint}
            disabled={isTesting || !printerConnected}
          >
            {isTesting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Printer className="mr-2 h-4 w-4" />
            )}
            Test Print
          </Button>
        </div>

        {/* Setup Instructions */}
        {!serverOnline && (
          <div className="rounded-lg border border-dashed p-4 text-sm space-y-2">
            <p className="font-medium">Setup Instructions:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Open a terminal on the POS machine</li>
              <li>Navigate to the print server: <code className="bg-muted px-1 rounded">cd print-server</code></li>
              <li>Install dependencies: <code className="bg-muted px-1 rounded">npm install</code></li>
              <li>Start the server: <code className="bg-muted px-1 rounded">npm start</code></li>
              <li>Make sure the Vozy G80 is powered on and Bluetooth is paired</li>
            </ol>
          </div>
        )}
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
        {/* Printer Settings - full width */}
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
