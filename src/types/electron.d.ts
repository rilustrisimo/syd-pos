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
 * Persistent-connection Bluetooth bridge (mirrors mobile bt-printer.ts).
 * Flow: connect(portPath) once → hold open → printBytes() → disconnect()
 */
interface ElectronBluetoothBridge {
  /** List available serial/COM ports (Bluetooth SPP printers appear after pairing on Windows) */
  listPorts(): Promise<ElectronSerialPort[]>
  /** Open and hold the COM port open (persistent connection) */
  connect(portPath: string): Promise<{ success: boolean; error?: string; path?: string }>
  /** Close the persistent COM port */
  disconnect(): Promise<{ success: boolean; error?: string }>
  /** Whether the port is currently open */
  isConnected(): Promise<{ connected: boolean; path: string | null }>
  /** Send raw ESC/POS bytes to the currently-open port */
  printBytes(bytesBase64: string): Promise<{ success: boolean; error?: string }>
}

declare global {
  interface Window {
    electronPrint?: ElectronPrintBridge
    electronBluetooth?: ElectronBluetoothBridge
  }
}

export {}
