# Thermal Printer Module Documentation (Mobile)

## 1. Module Overview

This document describes the thermal printer module in the SYD POS mobile app.

Current active printing path:
- Android Classic Bluetooth (SPP) direct printing from mobile app
- ESC/POS bytes built in-app and sent directly to paired printer

Legacy/inactive path present in codebase:
- HTTP print-server client module exists, but is currently not imported by any screen


## 2. Packages Used

Primary package for printer transport:
- react-native-bluetooth-classic (^1.73.0-rc.16)
  - Used for:
    - checking Bluetooth state
    - requesting Bluetooth enable
    - listing bonded (paired) devices
    - connecting to a selected paired device by MAC address
    - writing base64-encoded raw bytes to the printer socket

Supporting packages for module state/persistence/UI:
- zustand (^5.0.11)
  - printer connection state and user printer preferences
- @react-native-async-storage/async-storage (2.2.0)
  - persistence for saved printer and paper width preference via zustand persist
- react-native / expo runtime
  - Android permission requests via PermissionsAndroid


## 3. Platform and Build Requirements

### Android permissions (configured)
Configured in app.json:
- android.permission.BLUETOOTH
- android.permission.BLUETOOTH_ADMIN
- android.permission.BLUETOOTH_CONNECT

### Runtime permission behavior
- Android 12+ (API 31+): BLUETOOTH_CONNECT is requested at runtime
- Below Android 12: legacy Bluetooth permissions are install-time

### Build mode requirement
- Printing module relies on native module react-native-bluetooth-classic
- Requires custom dev build / EAS build / run:android
- Not supported in Expo Go


## 4. Core Files and Responsibilities

### Transport and connection service
- lib/bt-printer.ts
  - Single connection service (singleton-style connectedDevice in memory)
  - Permission handling
  - Paired device listing
  - Connect/disconnect lifecycle
  - Raw byte write with chunking and pacing
  - Public print methods:
    - printReceipt
    - printDeliverySlip
    - printCanvas

### ESC/POS byte builders
- lib/escpos-mobile.ts
  - Builds ESC/POS payloads as Uint8Array
  - Functions:
    - buildReceiptBytes
    - buildDeliverySlipBytes
    - buildCanvasBytes
  - Handles text sanitization for CP437/ascii-safe output
  - Handles alignment, totals formatting, feed, and cut commands

### Printer state store
- store/printer.ts
  - Connection status and runtime metadata
  - Persisted settings:
    - savedPrinterId
    - savedPrinterName
    - paperWidth
  - Non-persisted state:
    - current status/device/error
    - pairedDevices list

### Settings UI and manual connection flow
- components/SettingsModal.tsx
  - User actions:
    - Load Paired Printers
    - Connect to selected paired printer
    - Disconnect printer
    - Select paper width (58mm / 80mm)
  - Displays connection status and errors

### Print call sites
- app/(tabs)/sales/index.tsx
  - Auto-print after successful sale when printer is connected
  - Prints receipt, then delivery slip for delivery orders
- app/(tabs)/history/[id].tsx
  - Reprint receipt from transaction history details
  - Reprints delivery slip for delivery transactions
- app/(tabs)/canvas/index.tsx
  - Prints canvass sheet / quotation

### Status indicator only (no print action)
- app/(tabs)/history/index.tsx
- app/(tabs)/returns/index.tsx
- app/(tabs)/reports/index.tsx
  - These show connected-dot indicator from shared printer status

### Legacy/inactive module
- lib/print-server.ts
  - HTTP print-server client exists
  - No active imports found in mobile app screens


## 5. End-to-End Connection Flow

### User-side pairing prerequisite
1. User pairs thermal printer in Android system Bluetooth settings.
2. App only lists bonded devices; it does not do active discovery scan in the app flow.

### In-app connection sequence
1. User opens Settings modal.
2. User taps Load Paired Printers.
3. App calls btPrinter.getPairedDevices().
4. Module checks permission and Bluetooth power state.
5. Module calls getBondedDevices() and maps to { id: MAC, name }.
6. User taps Connect on selected device.
7. App calls btPrinter.connectToDevice(deviceId, deviceName).
8. Existing connection is disconnected first (if any).
9. Module connects with raw mode config:
   - delimiter: empty string
   - charset: ascii
10. On success:
   - connectedDevice singleton is set
   - savedPrinterId/savedPrinterName are persisted
   - store status transitions to connected

### Disconnect sequence
1. User taps Disconnect Printer.
2. Module disconnects active socket and clears in-memory connected device.
3. Store status set to idle.


## 6. End-to-End Printing Flow

### Common print pipeline
1. Screen constructs structured print payload (receipt/canvas data object).
2. Screen calls btPrinter.printReceipt / printDeliverySlip / printCanvas.
3. bt-printer maps paper width to char width:
   - 58mm -> 32 chars
   - 80mm -> 48 chars
4. escpos-mobile builder generates Uint8Array ESC/POS bytes.
5. Bytes are written in chunks over Bluetooth socket:
   - chunk size: 512 bytes
   - delay between chunks: 10ms
6. Printer executes commands and performs feed + cut.

### Sales flow
- Trigger: successful transaction creation
- Condition: btPrinter.isConnected() is true
- Output:
  - always prints receipt
  - additionally prints delivery slip if delivery_type is delivery
- Failure behavior:
  - sale remains saved
  - user gets print warning alert

### History reprint flow
- Trigger: user taps reprint from transaction details screen
- Condition: store printer status must be connected
- Output:
  - receipt reprint
  - delivery slip if original transaction delivery_type is delivery

### Canvas flow
- Trigger: save canvas and printer connected, or explicit print action
- Output:
  - canvass sheet / quotation format (explicitly marked not sales receipt)


## 7. ESC/POS Formatting and Commands

Implemented command groups:
- init/reset
- charset select (PC437)
- alignment (left/center/right)
- bold on/off
- double-size on/off
- line feed
- partial cut

Text safety behavior:
- Sanitizes unsupported unicode to ascii-friendly equivalents
- Removes unsupported non-ascii glyphs to avoid garbled printouts

Receipt/document sections include:
- branded header
- transaction metadata
- itemized lines and discounts
- totals and payment breakdown
- notes
- footer/policies/disclaimers
- delivery acknowledgement signature lines (delivery slip)


## 8. State Model and Persistence

Status enum:
- idle
- loading
- connecting
- connected
- error

Persisted values (AsyncStorage via zustand persist):
- savedPrinterId
- savedPrinterName
- paperWidth

Not persisted (ephemeral):
- live connection object
- current pairedDevices list
- live error/status runtime transitions

Important behavior note:
- Saved printer info is persisted for convenience display and selection memory.
- There is currently no automatic reconnect on app startup.
- Connection must be re-established manually after app restart.


## 9. Error Handling and User Messaging

Handled cases include:
- Bluetooth permission denied
- Bluetooth disabled
- no bonded devices found
- connection failure
- write attempt while disconnected
- print failure after sale save

UX behavior:
- Alerts explain corrective action for pairing and connection issues.
- Settings screen displays explicit status and error text.


## 10. Legacy Print-Server Path (Current Status)

A separate module exists for HTTP print-server integration:
- lib/print-server.ts

Capabilities in that module:
- health check endpoint call
- transaction-to-receipt mapping
- POST /print call
- width selection support

Current runtime status in mobile app:
- No active imports/callers detected
- Active production path appears to be direct Bluetooth printing only

Related environment values still present:
- EXPO_PUBLIC_PRINT_SERVER_URL in .env, .env.example, and eas.json


## 11. Operational Checklist for Field Testing

1. Pair printer in Android Settings first.
2. Open app Settings -> Thermal Printer.
3. Tap Load Paired Printers.
4. Connect to target printer.
5. Set paper width matching physical roll (58mm or 80mm).
6. Complete a sale and confirm receipt print.
7. If delivery order, confirm delivery slip prints as second document.
8. Reprint from History detail to verify repeatability.
9. Save and print a Canvas quotation.


## 12. Suggested Improvements

High-value improvements:
- Add optional auto-reconnect using savedPrinterId on app startup.
- Persist printer last-known connected timestamp and diagnostics.
- Add printer test page action in Settings.
- Add retry/backoff for transient socket write failures.
- Decide whether to remove or re-activate legacy print-server path to reduce confusion.

Maintenance improvement:
- Add a short architecture note in project root docs linking to this file.
