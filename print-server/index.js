/**
 * SYD POS Local Print Server
 *
 * Runs on the POS machine (Mac/Windows/Linux) and accepts print jobs from
 * the web app over HTTP.  Sends raw ESC/POS commands to the thermal printer
 * via Bluetooth serial port.
 *
 * Usage:
 *   cd print-server
 *   npm install
 *   npm start
 *
 * Environment variables (all optional):
 *   PORT         – HTTP port (default 9100)
 *   SERIAL_PATH  – serial device path (default: auto-detect Vozy G80)
 *   BAUD_RATE    – serial baud rate (default 9600)
 */

const express = require('express')
const cors = require('cors')
const { SerialPort } = require('serialport')
const { buildReceipt } = require('./escpos')

const app = express()
const PORT = process.env.PORT || 9100
const BAUD_RATE = parseInt(process.env.BAUD_RATE || '9600', 10)

let serialPort = null
let isConnected = false
let printerPath = process.env.SERIAL_PATH || null

// ── Auto-detect printer ─────────────────────────────────────────────────────

async function detectPrinter() {
  if (printerPath) return printerPath

  try {
    const ports = await SerialPort.list()
    // Look for known Vozy / thermal printer paths
    const candidates = ports.filter(
      (p) =>
        p.path.includes('VOZY') ||
        p.path.includes('Thermal') ||
        p.path.includes('POS') ||
        p.path.includes('Printer')
    )
    if (candidates.length > 0) {
      printerPath = candidates[0].path
      console.log(`Auto-detected printer: ${printerPath}`)
      return printerPath
    }

    // Fallback: try the known path
    printerPath = '/dev/tty.VOZYG80'
    return printerPath
  } catch (err) {
    console.error('Error listing serial ports:', err.message)
    printerPath = '/dev/tty.VOZYG80'
    return printerPath
  }
}

// ── Serial connection ───────────────────────────────────────────────────────

async function connectPrinter() {
  const path = await detectPrinter()

  try {
    // Close existing connection
    if (serialPort && serialPort.isOpen) {
      serialPort.close()
    }

    serialPort = new SerialPort({
      path,
      baudRate: BAUD_RATE,
      autoOpen: false,
    })

    serialPort.open((err) => {
      if (err) {
        console.error(`Failed to open ${path}: ${err.message}`)
        isConnected = false
        console.log('Will retry in 10 seconds...')
        setTimeout(connectPrinter, 10000)
      } else {
        console.log(`Connected to printer at ${path} (${BAUD_RATE} baud)`)
        isConnected = true
      }
    })

    serialPort.on('close', () => {
      console.log('Printer disconnected')
      isConnected = false
      console.log('Will retry in 10 seconds...')
      setTimeout(connectPrinter, 10000)
    })

    serialPort.on('error', (err) => {
      console.error('Serial port error:', err.message)
      isConnected = false
    })
  } catch (err) {
    console.error('Error creating serial port:', err.message)
    isConnected = false
    setTimeout(connectPrinter, 10000)
  }
}

// ── HTTP API ────────────────────────────────────────────────────────────────

app.use(cors())
app.use(express.json({ limit: '1mb' }))

// Health / status check
app.get('/status', (req, res) => {
  res.json({
    connected: isConnected,
    printer: printerPath,
    baudRate: BAUD_RATE,
  })
})

// List available serial ports
app.get('/ports', async (req, res) => {
  try {
    const ports = await SerialPort.list()
    // Filter to relevant ports (skip debug, wlan, etc.)
    const relevant = ports.filter(
      (p) =>
        p.path.includes('tty.') &&
        !p.path.includes('debug') &&
        !p.path.includes('wlan') &&
        !p.path.includes('Bluetooth-Incoming')
    )
    res.json(relevant)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Print a receipt
app.post('/print', (req, res) => {
  if (!isConnected || !serialPort || !serialPort.isOpen) {
    return res.status(503).json({
      error: 'Printer not connected',
      hint: 'Make sure the Vozy G80 is turned on and Bluetooth is connected.',
    })
  }

  try {
    const { data, width } = req.body

    if (!data) {
      return res.status(400).json({ error: 'Missing receipt data' })
    }

    const charWidth = width === '58mm' ? 32 : 48
    const escposData = buildReceipt(data, charWidth)
    const buffer = Buffer.from(escposData, 'binary')

    serialPort.write(buffer, (err) => {
      if (err) {
        console.error('Write error:', err.message)
        return res.status(500).json({ error: 'Failed to send to printer: ' + err.message })
      }

      serialPort.drain((drainErr) => {
        if (drainErr) {
          console.error('Drain error:', drainErr.message)
        }
        console.log(`Printed receipt ${data.transaction_number || '(unknown)'} (${buffer.length} bytes)`)
        res.json({ success: true, message: 'Receipt printed successfully' })
      })
    })
  } catch (err) {
    console.error('Print error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Send raw ESC/POS data (for testing)
app.post('/raw', (req, res) => {
  if (!isConnected || !serialPort || !serialPort.isOpen) {
    return res.status(503).json({ error: 'Printer not connected' })
  }

  try {
    const { data } = req.body
    const buffer = Buffer.from(data, 'base64')

    serialPort.write(buffer, (err) => {
      if (err) return res.status(500).json({ error: err.message })

      serialPort.drain(() => {
        res.json({ success: true, bytes: buffer.length })
      })
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Reconnect to printer
app.post('/reconnect', async (req, res) => {
  // Allow changing the serial path
  if (req.body && req.body.path) {
    printerPath = req.body.path
  }

  if (serialPort && serialPort.isOpen) {
    serialPort.close(() => {
      connectPrinter()
      res.json({ message: 'Reconnecting...', printer: printerPath })
    })
  } else {
    connectPrinter()
    res.json({ message: 'Connecting...', printer: printerPath })
  }
})

// Test print (prints a short test receipt)
app.post('/test', (req, res) => {
  if (!isConnected || !serialPort || !serialPort.isOpen) {
    return res.status(503).json({ error: 'Printer not connected' })
  }

  const testData = {
    transaction_number: 'TEST-001',
    date: new Date().toLocaleDateString('en-PH'),
    time: new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
    cashier: 'Test Print',
    branch: 'SYD POS Print Server',
    customer: { name: 'Test Customer' },
    delivery_type: 'pickup',
    items: [
      { name: 'Test Product A', quantity: 2, unit_price: 100, uom: 'pcs', discount: 0, total: 200 },
      { name: 'Test Product B', quantity: 1, unit_price: 550.5, uom: 'bag', discount: 50, total: 500.5 },
    ],
    subtotal: 750.5,
    discount: 50,
    tax: 0,
    total: 700.5,
    payments: [{ method: 'cash', amount: 1000, reference: null }],
    amount_paid: 1000,
    change: 299.5,
    notes: null,
  }

  const width = (req.body && req.body.width) || '80mm'
  const charWidth = width === '58mm' ? 32 : 48
  const escposData = buildReceipt(testData, charWidth)
  const buffer = Buffer.from(escposData, 'binary')

  serialPort.write(buffer, (err) => {
    if (err) return res.status(500).json({ error: err.message })

    serialPort.drain(() => {
      res.json({ success: true, message: 'Test receipt printed' })
    })
  })
})

// ── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('')
  console.log('  ╔══════════════════════════════════════════╗')
  console.log('  ║     SYD POS Thermal Print Server         ║')
  console.log(`  ║     http://localhost:${PORT}               ║`)
  console.log('  ╚══════════════════════════════════════════╝')
  console.log('')
  console.log('  Endpoints:')
  console.log(`    GET  /status     - Printer connection status`)
  console.log(`    GET  /ports      - List available serial ports`)
  console.log(`    POST /print      - Print a receipt`)
  console.log(`    POST /test       - Print a test receipt`)
  console.log(`    POST /reconnect  - Reconnect to printer`)
  console.log('')

  connectPrinter()
})
