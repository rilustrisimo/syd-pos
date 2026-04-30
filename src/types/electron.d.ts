/**
 * Type declarations for the Electron context bridge injected by preload.ts
 * in the syd-pos-desktop Electron app.
 */

interface ElectronUsbPrinter {
  vendorId: number
  productId: number
  manufacturer?: string
  product?: string
}

interface ElectronPrintBridge {
  isElectron: true
  listUsbPrinters(): Promise<ElectronUsbPrinter[]>
  printBytes(
    vendorId: number,
    productId: number,
    bytesBase64: string
  ): Promise<{ success: boolean; error?: string }>
}

interface ElectronSerialPort {
  path: string
  displayName: string
}

/**
 * Bluetooth / COM port bridge for Electron on Windows.
 * Each print job is self-contained: open → settle → write → close.
 * No persistent connection is held between prints.
 */
interface ElectronBluetoothBridge {
  /** List available serial/COM ports (Bluetooth SPP printers appear after pairing on Windows) */
  listPorts(): Promise<ElectronSerialPort[]>
  /** Test that a port can be opened (quick open+close verification) */
  connect(portPath: string): Promise<{ success: boolean; error?: string; path?: string }>
  /** No-op — ports are not held open */
  disconnect(): Promise<{ success: boolean }>
  /** Returns connected=true when a portPath is saved */
  isConnected(portPath?: string): Promise<{ connected: boolean; path: string | null }>
  /** Open port, write bytes, close — portPath must be the saved COM port (e.g. "COM4") */
  printBytes(portPath: string, bytesBase64: string): Promise<{ success: boolean; error?: string }>
}

declare global {
  interface Window {
    electronPrint?: ElectronPrintBridge
    electronBluetooth?: ElectronBluetoothBridge
  }
}

export {}
