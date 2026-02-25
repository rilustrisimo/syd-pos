/**
 * BLE Printer service for SYD POS Mobile.
 *
 * Features:
 *  - Scan all nearby BLE devices so the user can pick any printer
 *  - Connect to a specific device by ID and save it as the default
 *  - Send ESC/POS receipts AND delivery slips in 20-byte chunks
 *
 * Requires:
 *   - react-native-ble-plx  (npm install)
 *   - Bluetooth permissions in app.json (already added)
 *   - EAS custom build — does NOT work in Expo Go
 */

import { BleManager, Device, Characteristic, State } from 'react-native-ble-plx'
import { Platform, PermissionsAndroid, NativeModules } from 'react-native'
import { buildReceiptBytes, buildDeliverySlipBytes, ReceiptData } from './escpos-mobile'
import { usePrinterStore, ScannedDevice } from '../store/printer'

// BLE writes have a 20-byte limit without MTU negotiation.
const CHUNK_SIZE  = 20
const CHUNK_DELAY = 20  // ms between chunks so the printer doesn't overflow

// ── Singleton state ───────────────────────────────────────────────────────────
let manager:   BleManager | null      = null
let device:    Device | null          = null
let writeChar: Characteristic | null  = null
let scanTimeout: ReturnType<typeof setTimeout> | null = null

// ── Helpers ───────────────────────────────────────────────────────────────────

function getManager(): BleManager {
  if (!manager) {
    // react-native-ble-plx native module is only available in EAS/custom builds.
    // In Expo Go it is null, which causes NativeEventEmitter to throw.
    const nativeModule =
      NativeModules.BleClientManager ??   // Android
      NativeModules.BleClientManageriOS ?? // some iOS builds
      null

    if (!nativeModule) {
      throw new Error(
        'Bluetooth is not available in this build.\n\n' +
        'BLE printing requires an EAS custom development build (not Expo Go). ' +
        'Run: eas build --profile development --platform ios'
      )
    }

    manager = new BleManager()
  }
  return manager
}

/** Convert Uint8Array → base64 string (required for react-native-ble-plx writes). */
function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

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

// ── Permissions ───────────────────────────────────────────────────────────────

async function requestAndroidPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true
  const results = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  ])
  return Object.values(results).every((r) => r === PermissionsAndroid.RESULTS.GRANTED)
}

// ── Scan for all nearby BLE devices ──────────────────────────────────────────

/**
 * Scan for all nearby BLE devices and stream them to the caller.
 * Stops automatically after `timeoutMs` (default 10 s).
 */
async function scanForDevices(
  onDevice: (d: ScannedDevice) => void,
  onDone: () => void,
  timeoutMs = 10_000,
): Promise<void> {
  const m = getManager()

  const hasPermissions = await requestAndroidPermissions()
  if (!hasPermissions) throw new Error('Bluetooth permission denied. Please grant it in Settings.')

  const bleState = await m.state()
  if (bleState !== State.PoweredOn) throw new Error('Bluetooth is off. Please enable Bluetooth and try again.')

  // Clear previous scan results
  usePrinterStore.getState().clearScannedDevices()
  setStatus('scanning')

  if (scanTimeout) clearTimeout(scanTimeout)

  scanTimeout = setTimeout(() => {
    m.stopDeviceScan()
    const s = usePrinterStore.getState()
    if (s.status === 'scanning') setStatus('idle')
    onDone()
  }, timeoutMs)

  m.startDeviceScan(null, { allowDuplicates: false }, (error, peripheral) => {
    if (error) {
      if (scanTimeout) { clearTimeout(scanTimeout); scanTimeout = null }
      setError(error.message)
      onDone()
      return
    }
    if (!peripheral) return

    const scanned: ScannedDevice = {
      id:   peripheral.id,
      name: peripheral.name ?? peripheral.localName ?? null,
      rssi: peripheral.rssi ?? null,
    }
    usePrinterStore.getState().addScannedDevice(scanned)
    onDevice(scanned)
  })
}

function stopScan(): void {
  if (scanTimeout) { clearTimeout(scanTimeout); scanTimeout = null }
  try { getManager().stopDeviceScan() } catch { /* ignore */ }
  const s = usePrinterStore.getState()
  if (s.status === 'scanning') setStatus('idle')
}

// ── Connect to a specific device by ID ───────────────────────────────────────

/**
 * Connect to a BLE device by its ID (MAC address / UUID).
 * Saves the device as the persistent default printer.
 */
async function connectToDevice(deviceId: string, deviceName?: string | null): Promise<void> {
  const m = getManager()

  const hasPermissions = await requestAndroidPermissions()
  if (!hasPermissions) throw new Error('Bluetooth permission denied.')

  const bleState = await m.state()
  if (bleState !== State.PoweredOn) throw new Error('Bluetooth is off. Please enable it first.')

  // Disconnect any existing connection
  if (device) {
    try { await device.cancelConnection() } catch { /* ignore */ }
    device    = null
    writeChar = null
  }

  stopScan()
  setStatus('connecting', deviceId, deviceName ?? null)

  const connected = await m.connectToDevice(deviceId, { timeout: 10_000 })
  await connected.discoverAllServicesAndCharacteristics()

  // Find a writable characteristic
  const services = await connected.services()
  let found: Characteristic | null = null
  for (const svc of services) {
    const chars = await svc.characteristics()
    found =
      chars.find((c) => c.isWritableWithResponse) ??
      chars.find((c) => c.isWritableWithoutResponse) ??
      null
    if (found) break
  }

  if (!found) {
    throw new Error('Connected but no writable characteristic found. This device may not be a supported printer.')
  }

  device    = connected
  writeChar = found

  const resolvedName = connected.name ?? deviceName ?? deviceId

  // Persist as default/saved printer
  usePrinterStore.getState().setSavedPrinter(deviceId, resolvedName)

  // Reset status to idle when printer disconnects
  connected.onDisconnected(() => {
    device    = null
    writeChar = null
    setStatus('idle')
  })

  setStatus('connected', deviceId, resolvedName)
}

// ── Write ─────────────────────────────────────────────────────────────────────

async function writeBytes(bytes: Uint8Array): Promise<void> {
  if (!writeChar) throw new Error('Not connected to printer.')

  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    const chunk = bytes.slice(offset, offset + CHUNK_SIZE)
    const b64   = toBase64(chunk)

    if (writeChar.isWritableWithResponse) {
      await writeChar.writeWithResponse(b64)
    } else {
      await writeChar.writeWithoutResponse(b64)
    }

    if (offset + CHUNK_SIZE < bytes.length) {
      await new Promise((r) => setTimeout(r, CHUNK_DELAY))
    }
  }
}

// ── Print receipt ─────────────────────────────────────────────────────────────

async function printReceipt(data: ReceiptData, width: '58mm' | '80mm' = '80mm'): Promise<void> {
  if (!device || !writeChar) {
    throw new Error('Printer not connected. Connect a printer in Settings first.')
  }
  const charWidth = width === '58mm' ? 32 : 48
  await writeBytes(buildReceiptBytes(data, charWidth))
}

// ── Print delivery slip ───────────────────────────────────────────────────────

/**
 * Print a delivery slip (separate document for the delivery person).
 * For delivery orders, call this AFTER printReceipt — the printer will
 * auto-cut between the two documents.
 */
async function printDeliverySlip(data: ReceiptData, width: '58mm' | '80mm' = '80mm'): Promise<void> {
  if (!device || !writeChar) {
    throw new Error('Printer not connected.')
  }
  const charWidth = width === '58mm' ? 32 : 48
  await writeBytes(buildDeliverySlipBytes(data, charWidth))
}

// ── Disconnect ────────────────────────────────────────────────────────────────

async function disconnect(): Promise<void> {
  if (device) {
    try { await device.cancelConnection() } catch { /* ignore */ }
    device    = null
    writeChar = null
  }
  setStatus('idle')
}

// ── Status getters ────────────────────────────────────────────────────────────

function isConnected(): boolean {
  return device !== null && writeChar !== null
}

function getDeviceName(): string | null {
  return device?.name ?? null
}

// ── Public API ────────────────────────────────────────────────────────────────

export const blePrinter = {
  scanForDevices,
  stopScan,
  connectToDevice,
  disconnect,
  printReceipt,
  printDeliverySlip,
  isConnected,
  getDeviceName,
}
