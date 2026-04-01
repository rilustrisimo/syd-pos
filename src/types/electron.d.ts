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

interface ElectronBluetoothBridge {
  /** List available serial/COM ports (includes Bluetooth SPP ports on Windows) */
  listPorts(): Promise<ElectronSerialPort[]>
  /** Send raw ESC/POS bytes to a COM port */
  printBytes(portPath: string, bytesBase64: string): Promise<{ success: boolean; error?: string }>
}

declare global {
  interface Window {
    electronPrint?: ElectronPrintBridge
    electronBluetooth?: ElectronBluetoothBridge
  }
}

export {}
