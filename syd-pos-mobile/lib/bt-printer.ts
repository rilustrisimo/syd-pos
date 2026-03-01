/**
 * Classic Bluetooth printer service for SYD POS Mobile.
 *
 * Uses react-native-bluetooth-classic (SPP profile) so the app connects
 * to the thermal printer the same way Android System Bluetooth does —
 * no BLE scan required, just list already-paired devices and connect.
 *
 * Flow:
 *   1. User pairs printer once in Android Settings → Bluetooth
 *   2. In-app Settings: tap "Load Paired Printers" → instant list
 *   3. Tap printer → connects via SPP in ~1 second
 *   4. Sale complete → receipt auto-prints
 *
 * Requires:
 *   - react-native-bluetooth-classic (npm install)
 *   - BLUETOOTH_CONNECT permission in app.json (already present)
 *   - EAS custom build or expo run:android — does NOT work in Expo Go
 */

import RNBluetoothClassic, {
  BluetoothDevice,
} from 'react-native-bluetooth-classic'
import { PermissionsAndroid, Platform } from 'react-native'
import { buildReceiptBytes, buildDeliverySlipBytes, ReceiptData } from './escpos-mobile'
import { usePrinterStore, PairedDevice } from '../store/printer'

// Classic Bluetooth SPP can handle larger packets than BLE (no 20-byte MTU limit).
// 512 bytes per chunk with a short delay prevents printer buffer overflow.
const CHUNK_SIZE  = 512
const CHUNK_DELAY = 10  // ms between chunks

// ── Singleton connection state ─────────────────────────────────────────────
let connectedDevice: BluetoothDevice | null = null

// ── Helpers ───────────────────────────────────────────────────────────────

function setStatus(
  status: Parameters<ReturnType<typeof usePrinterStore.getState>['setStatus']>[0],
  deviceId?: string | null,
  deviceName?: string | null,
) {
  usePrinterStore.getState().setStatus(status, deviceId, deviceName)
}

function setError(msg: string) {
  usePrinterStore.getState().setError(msg)
}

// ── Permissions ───────────────────────────────────────────────────────────

async function requestAndroidPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true

  // Android 12+ (API 31+): BLUETOOTH_CONNECT is required for listing paired
  // devices and connecting. No location permission needed for bonded devices.
  if (Platform.Version >= 31) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    )
    return result === PermissionsAndroid.RESULTS.GRANTED
  }

  // Below Android 12: legacy BLUETOOTH + BLUETOOTH_ADMIN (declared in manifest,
  // no runtime request needed — they are install-time permissions)
  return true
}

// ── List paired devices ───────────────────────────────────────────────────

/**
 * Returns the list of Bluetooth devices already paired (bonded) in Android
 * System Bluetooth settings. No scan required — instant result.
 */
async function getPairedDevices(): Promise<PairedDevice[]> {
  const hasPermission = await requestAndroidPermissions()
  if (!hasPermission) {
    throw new Error('Bluetooth permission denied. Please grant it in Settings.')
  }

  const isEnabled = await RNBluetoothClassic.isBluetoothEnabled()
  if (!isEnabled) {
    // Prompt user to enable Bluetooth
    if (Platform.OS === 'android') {
      await RNBluetoothClassic.requestBluetoothEnabled()
    }
    const enabledNow = await RNBluetoothClassic.isBluetoothEnabled()
    if (!enabledNow) {
      throw new Error('Bluetooth is off. Please enable it in Settings.')
    }
  }

  const devices = await RNBluetoothClassic.getBondedDevices()
  return devices.map((d) => ({
    id:   d.address,
    name: d.name ?? null,
  }))
}

// ── Connect ───────────────────────────────────────────────────────────────

/**
 * Connect to a paired Bluetooth device by its MAC address.
 * Saves it as the persistent default printer.
 */
async function connectToDevice(deviceId: string, deviceName?: string | null): Promise<void> {
  const hasPermission = await requestAndroidPermissions()
  if (!hasPermission) throw new Error('Bluetooth permission denied.')

  // Disconnect any existing connection first
  if (connectedDevice) {
    try { await connectedDevice.disconnect() } catch { /* ignore */ }
    connectedDevice = null
  }

  setStatus('connecting', deviceId, deviceName ?? null)

  try {
    const device = await RNBluetoothClassic.connectToDevice(deviceId, {
      delimiter: '',  // raw mode — no line delimiter framing
      charset:   'ascii',
    })

    connectedDevice = device

    const resolvedName = device.name ?? deviceName ?? deviceId

    // Persist as default printer
    usePrinterStore.getState().setSavedPrinter(deviceId, resolvedName)

    setStatus('connected', deviceId, resolvedName)
  } catch (err: unknown) {
    connectedDevice = null
    const msg = err instanceof Error ? err.message : String(err)
    setError(msg)
    throw err
  }
}

// ── Write raw bytes ───────────────────────────────────────────────────────

/** Convert Uint8Array → base64 string for react-native-bluetooth-classic writes. */
function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

async function writeBytes(bytes: Uint8Array): Promise<void> {
  if (!connectedDevice) throw new Error('Not connected to printer.')

  const isConn = await connectedDevice.isConnected()
  if (!isConn) {
    connectedDevice = null
    setStatus('idle')
    throw new Error('Printer disconnected. Please reconnect in Settings.')
  }

  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    const chunk = bytes.slice(offset, offset + CHUNK_SIZE)
    await connectedDevice.write(toBase64(chunk), 'base64')

    if (offset + CHUNK_SIZE < bytes.length) {
      await new Promise((r) => setTimeout(r, CHUNK_DELAY))
    }
  }
}

// ── Print receipt ─────────────────────────────────────────────────────────

async function printReceipt(data: ReceiptData, width: '58mm' | '80mm' = '80mm'): Promise<void> {
  if (!connectedDevice) {
    throw new Error('Printer not connected. Connect a printer in Settings first.')
  }
  const charWidth = width === '58mm' ? 32 : 48
  await writeBytes(buildReceiptBytes(data, charWidth))
}

// ── Print delivery slip ───────────────────────────────────────────────────

async function printDeliverySlip(data: ReceiptData, width: '58mm' | '80mm' = '80mm'): Promise<void> {
  if (!connectedDevice) {
    throw new Error('Printer not connected.')
  }
  const charWidth = width === '58mm' ? 32 : 48
  await writeBytes(buildDeliverySlipBytes(data, charWidth))
}

// ── Disconnect ────────────────────────────────────────────────────────────

async function disconnect(): Promise<void> {
  if (connectedDevice) {
    try { await connectedDevice.disconnect() } catch { /* ignore */ }
    connectedDevice = null
  }
  setStatus('idle')
}

// ── Status getters ────────────────────────────────────────────────────────

function isConnected(): boolean {
  return connectedDevice !== null
}

function getDeviceName(): string | null {
  return connectedDevice?.name ?? null
}

// ── Public API ────────────────────────────────────────────────────────────

export const btPrinter = {
  getPairedDevices,
  connectToDevice,
  disconnect,
  printReceipt,
  printDeliverySlip,
  isConnected,
  getDeviceName,
}
