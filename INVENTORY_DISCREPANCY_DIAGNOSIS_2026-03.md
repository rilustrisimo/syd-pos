# Inventory Discrepancy Diagnosis — March 2026

**Date:** March 5, 2026
**Scope:** Live database analysis of inventory discrepancies + fixes applied
**Prerequisites:** Read `INVENTORY_FLOW_DOCUMENTATION.md` and `INVENTORY_AUDIT_REPORT.md` first.

---

## 1. Summary of Findings (Live DB Analysis)

Connected to production Supabase DB and ran diagnostic queries. Key findings:

### 1.1 Sale Transactions Missing Inventory Movements

| Period | Sales Count | With Movements | Without Movements |
|--------|------------|----------------|-------------------|
| Feb 27–28 | 66 | 66 (100%) | 0 |
| Mar 1–4 | 161 | 0 (0%) | **161 (100%)** |
| Mar 5 | 153 | 124 | 29 |

**Root cause:** The trigger `on_transaction_inventory_update` fires `AFTER INSERT ON transactions`.
At that moment, zero lines exist yet — the trigger calls `process_transaction_inventory()` which
sums `transaction_lines` and finds nothing. **Inventory was never deducted for those sales.**

Feb 27–28 worked because those sales were saved manually by a different code path.
Mar 5 works because migration 00026 (`create_transaction_atomic` RPC) was deployed.

### 1.2 Purchase Order Double-Counting

**Expected:** 1 inventory movement per PO line received.
**Actual:** 2–32 inventory movements per PO line (avg ~7x).

| Source | Count | Net change |
|--------|-------|------------|
| `purchase / purchase_order` movements | 801 | +32,012 |
| Actual PO lines with received qty > 0 | 113 | ~3,000–5,000 actual |

**Root cause:** Two mechanisms both fired when a PO was received:
1. Trigger `on_po_line_inventory_update` (AFTER UPDATE on `purchase_order_lines`)
2. RPC `receive_purchase_order_atomic()` which manually calls the inventory update

Each `quantity_received` update fired the trigger. If a PO line was updated multiple times
(partial receipts, corrections), each update added another full movement.

A `system_reconciliation` adjustment of **−14,269 units** was run on Feb 28 to partially correct this.

### 1.3 165 Products With Inventory Discrepancies

Running the source-of-truth recalculation query against the live DB:
- **165 products** have discrepancies (|current − correct| > 0.01)
- **158** need reduction (current is too high — mainly from PO double-counting)
- **7** need increase (current is too low — PO movements not yet triggering)
- **3** would compute negative (more sold than received — investigate missing POs)

Products that would go negative:
- `ROYU-2G-SW` (2-Gang Switch): 5 received, 7 sold → correct = −2 → floor to 0
- `GI-SHT-25X12` (GI Corrugated Sheet 0.25mm x 12ft): 20 received, 22 sold → correct = −2 → floor to 0
- `COCO-2X2X10` (Coco Lumber 2x2x10): 240 received, 232 sold, −40 manual adj → correct = −32 → floor to 0

---

## 2. The Correct Discrepancy Formula

**Source of truth = purchase_order_lines + transaction_lines + manual adjustments only.**

```sql
should_be_quantity =
  SUM(purchase_order_lines.quantity_received converted to base units, where po.is_deleted = false)
  - SUM(transaction_lines.quantity converted to base units, where t.is_deleted = false AND t.transaction_type = 'sale')
  + SUM(transaction_lines.quantity converted to base units, where t.is_deleted = false AND t.transaction_type = 'return' AND COALESCE(tl.should_restock, true) = true)
  + SUM(inventory_movements.quantity_change WHERE reference_type = 'manual_adjustment')
```

### What to EXCLUDE from `all_adjustments`:
| reference_type | Include? | Reason |
|---|---|---|
| `manual_adjustment` | ✅ YES | Real physical count corrections |
| `inventory_correction` | ❌ NO | Previous runs of the discrepancy script — would loop |
| `system_reconciliation` | ❌ NO | Was a fix for PO double-counting; we recalculate POs from source |
| `transaction_reversal` | ❌ NO | Cancels deductions for deleted sales; we already exclude deleted transactions |

### Unit Conversion Rule
All quantities must be converted to **base units** before summing:
```
base_unit_qty = selling_qty / conversion_factor
```
Where `conversion_factor` = how many selling units fit in 1 base unit
(e.g., Tie Wire: 25 KG per ROLL → selling 1 KG = 1/25 = 0.04 ROLL in base units)

Conversion lookup order:
1. If `uom_id = product.base_uom_id` → already base, no conversion
2. If `uom_id` matches `product_selling_units` table → use that `conversion_factor`
3. If `uom_id = product.selling_uom_id` → use `product.conversion_factor`
4. Else → assume 1:1 (rarely correct, investigate if this happens)

---

## 3. Fixes Applied

### Fix 1: Mobile App Atomicity (Migration 00026) ✅ Applied
**File:** `supabase/migrations/00026_fix_inventory_trigger_and_atomic_create.sql`
**What it does:** Creates `create_transaction_atomic()` Postgres RPC that:
- Inserts transaction header, lines, and payments in a single implicit DB transaction
- Applies inventory movements **inline per line** with correct UOM conversion
- All-or-nothing: any error rolls back everything (no orphan records, no phantom deductions)
- Does NOT touch existing triggers (web POS continues unchanged)
- `GRANT EXECUTE ON FUNCTION create_transaction_atomic TO authenticated`

**Mobile app change:** `packages/api/src/hooks/useTransactions.ts` — `createTransaction` now calls `supabase.rpc('create_transaction_atomic', {...})` instead of sequential inserts.

### Fix 2: Payment Insert Column Error ✅ Fixed
Removed `status: 'completed'` from payment insert — `transaction_payments` table has no `status` column.

### Fix 3: Discrepancy Script Formula (Migration 00025) ✅ Fixed
**File:** `supabase/migrations/00025_fix_inventory_discrepancies.sql`
Updated `all_adjustments` CTE to only include `reference_type = 'manual_adjustment'`.
Added `GREATEST(0, correct_qty)` floor in STEP 3 to prevent setting inventory negative.

---

## 4. Pending Issues (Not Yet Fixed)

### 4.1 Web POS Sale Trigger Still Broken ⚠️
The web POS still uses the broken trigger path for sales. The trigger fires before lines exist.
161 sales from March 1–4 have **zero inventory movements** and zero inventory deductions.

**To fix web POS:** Either convert web POS to also use `create_transaction_atomic` RPC, or rewrite the trigger to fire `AFTER INSERT ON transaction_lines` instead (complex, affects all triggers).

**Current status:** User confirmed web POS should not be modified at this time.

### 4.2 PO Double-Counting Still Present ⚠️
The `receive_purchase_order_atomic()` RPC and the `on_po_line_inventory_update` trigger may both fire when a PO is received, double-counting inventory.

**To investigate:** Check if the RPC itself is calling the trigger or if they're independent. The `on_po_line_inventory_update` trigger fires on `AFTER UPDATE ON purchase_order_lines` — the RPC updates `quantity_received`, which triggers it.

**To fix:** Disable the `on_po_line_inventory_update` trigger if `receive_purchase_order_atomic` is the canonical path. Only one mechanism should update inventory per PO receipt.

### 4.3 165 Inventory Corrections Pending ⚠️
The discrepancy script (00025) STEP 3 is commented out and has not been run yet.
Before running it, resolve the PO double-counting investigation to ensure source data is accurate.

**How to run:** Open 00025 in Supabase SQL Editor, uncomment STEP 3, run STEP 1 and STEP 3 together.
STEP 4 (verify) can be run immediately after to confirm corrections.

---

## 5. Mobile App Reference (For Future Fixes)

### 5.1 Key Files
| File | Purpose |
|---|---|
| `syd-pos-mobile/app/(tabs)/sales/index.tsx` | Main checkout screen — cart, checkout modal, receipt build |
| `syd-pos-mobile/app/(tabs)/history/[id].tsx` | Transaction detail/reprint |
| `syd-pos-mobile/lib/escpos-mobile.ts` | ESC/POS receipt builder (buildReceiptBytes, buildDeliverySlipBytes) |
| `syd-pos-mobile/store/pos.ts` | Zustand store — CartItem type, usePosStore |
| `packages/api/src/hooks/useTransactions.ts` | createTransaction → calls create_transaction_atomic RPC |
| `packages/api/src/types/index.ts` | Transaction, TransactionLine, CreateTransactionInput types |

### 5.2 Build Step (REQUIRED after any change to `packages/api/`)
```bash
cd /Users/eyorsogood/Sites/syd/syd-pos/packages/api && npm run build
```
The mobile app imports from `@syd/api` which resolves to the built dist/ folder.

### 5.3 Pending Mobile Feature Additions (From Plan)
From plan file `resilient-prancing-swan.md`:
- **Transaction history**: `useTransactions` SELECT doesn't join products/UOM → names show as UUIDs
- **Checkout fees**: `delivery_fee`, `other_fees`, `other_fees_notes` fields exist in DB (migration 00020) but not in mobile checkout UI
- **Sale date backdating**: `transaction_date` field exists but mobile always uses current time
- **UOM in receipts**: `uom: 'pc'` hardcoded in receipt builder — should use actual UOM from product
- **Reprint from history**: needs to pass fee fields and product names into ReceiptData

### 5.4 Mobile Transaction Atomicity (Implemented ✅)
The mobile app calls `create_transaction_atomic` RPC which:
1. Validates all data server-side
2. Inserts header + lines + payments atomically
3. Applies correct inventory deductions with UOM conversion per line
4. Returns the saved transaction as JSONB

If any step fails, the entire transaction rolls back — no partial saves, no phantom inventory changes.

### 5.5 Inventory Movement Types Reference
| movement_type | reference_type | Meaning |
|---|---|---|
| `purchase` | `purchase_order` | PO receipt (inventory increased) |
| `sale` | `transaction` | POS sale (inventory decreased) |
| `return` | `transaction` | POS return with restock (inventory increased) |
| `adjustment` | `transaction` | Damaged return without restock (inventory decreased) |
| `adjustment` | `transaction_reversal` | Deleted sale/return — reversal of inventory change |
| `adjustment` | `manual_adjustment` | Manual count correction via adjust_inventory_atomic RPC |
| `adjustment` | `inventory_correction` | Bulk recalculation from discrepancy script (00025) |
| `adjustment` | `system_reconciliation` | One-time system-level fix (ran Feb 28, 2026) |

### 5.6 Returns and `should_restock` Flag
- Returns with `should_restock = true` (default) → add inventory back (customer returned good item)
- Returns with `should_restock = false` → don't add inventory (item damaged/expired)
- The `should_restock` column is on `transaction_lines`
- Migration 00029 added this column

---

## 6. Product Detail Page Changes

Enhanced `src/app/(dashboard)/products/[id]/page.tsx`:
1. **Current Stock by Branch card** — shows `quantity_on_hand` per branch with:
   - Low stock / out of stock badges
   - "Movement Total" (sum of all recorded movements)
   - "Audit Status" — ✓ Balanced if movement total matches stock, ⚠️ Discrepancy if not
   - Last movement date
2. **Inventory Movement History card** — replaced the "Adjustments only" table with ALL movements:
   - Color-coded badges per movement type (green=purchase, red=sale, blue=return, amber=adjustment)
   - Source column shows human-readable reference_type label
   - Shows Before / Change / After quantities with 4 decimal places
   - Link to full movements page if > 200 records

---

## 7. How to Run the Discrepancy Script

**Location:** `supabase/migrations/00025_fix_inventory_discrepancies.sql`

**Steps:**
1. Open Supabase SQL Editor
2. Copy and run **STEP 1** (creates temp table with recalculated quantities)
3. Review **STEP 2** output (discrepancy report) — check for unexpected items
4. Verify the 3 items that go negative are handled (they'll be floored to 0)
5. Uncomment and run **STEP 3** (applies corrections)
6. Run **STEP 4** (verify corrections were logged)

**Warning:** Only run STEP 3 after confirming:
- Migration 00026 (`create_transaction_atomic`) is deployed ✅
- PO double-counting root cause is resolved (currently still present ⚠️)
- The 3 negative-quantity items have been investigated

**Note:** STEP 3 records each correction as an `inventory_correction` movement, so it can be reviewed and is idempotent (second run won't adjust already-correct items since they'll match).
