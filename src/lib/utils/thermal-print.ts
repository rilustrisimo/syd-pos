/**
 * Thermal printer client utilities.
 *
 * Communicates with the local print server (print-server/) over HTTP
 * to send ESC/POS print jobs to the Vozy G80 thermal printer.
 */

import type { ReceiptData } from '@/components/print/receipt-template'

export interface PrinterStatus {
  connected: boolean
  printer: string
  baudRate: number
}

export interface SerialPortInfo {
  path: string
  manufacturer?: string
  serialNumber?: string
  pnpId?: string
  friendlyName?: string
}

/**
 * Check if the print server is running and if the printer is connected.
 */
export async function checkPrinterStatus(serverUrl: string): Promise<PrinterStatus | null> {
  try {
    const response = await fetch(`${serverUrl}/status`, {
      signal: AbortSignal.timeout(3000),
    })
    if (!response.ok) return null
    return response.json()
  } catch {
    return null
  }
}

/**
 * List available serial ports from the print server.
 */
export async function listSerialPorts(serverUrl: string): Promise<SerialPortInfo[]> {
  try {
    const response = await fetch(`${serverUrl}/ports`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return []
    return response.json()
  } catch {
    return []
  }
}

/**
 * Send a receipt to the thermal printer via the print server.
 */
export async function printThermalReceipt(
  serverUrl: string,
  data: ReceiptData,
  width: '58mm' | '80mm' = '80mm'
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${serverUrl}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, width }),
    signal: AbortSignal.timeout(10000),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error || 'Print failed')
  }

  return result
}

/**
 * Print a test receipt to verify the printer is working.
 */
export async function printTestReceipt(
  serverUrl: string,
  width: '58mm' | '80mm' = '80mm'
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${serverUrl}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ width }),
    signal: AbortSignal.timeout(10000),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error || 'Test print failed')
  }

  return result
}

/**
 * Tell the print server to reconnect to the printer (optionally at a new path).
 */
export async function reconnectPrinter(
  serverUrl: string,
  path?: string
): Promise<void> {
  await fetch(`${serverUrl}/reconnect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(path ? { path } : {}),
    signal: AbortSignal.timeout(5000),
  })
}
