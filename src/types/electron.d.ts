/**
 * Type declarations for the Electron context bridge injected by preload.ts
 * in the syd-pos-desktop Electron app.
 *
 * When running inside Electron, `window.electronPrint` is available and
 * provides direct USB printer access via the main process.
 */

interface ElectronUsbPrinter {
  vendorId: number
  productId: number
  manufacturer?: string
  product?: string
}

interface ElectronPrintBridge {
  /** Always true — used to detect Electron environment */
  isElectron: true

  /** Lists USB devices that present as USB Printer class (bDeviceClass === 7) */
  listUsbPrinters(): Promise<ElectronUsbPrinter[]>

  /**
   * Sends raw ESC/POS bytes to a USB printer.
   * @param vendorId    USB Vendor ID (decimal)
   * @param productId   USB Product ID (decimal)
   * @param bytesBase64 Base64-encoded Uint8Array
   */
  printBytes(
    vendorId: number,
    productId: number,
    bytesBase64: string
  ): Promise<{ success: boolean; error?: string }>
}

declare global {
  interface Window {
    electronPrint?: ElectronPrintBridge
  }
}

export {}
