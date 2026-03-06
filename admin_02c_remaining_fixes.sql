-- ============================================================================
-- ADMIN STEP 2c: Fix 2 Remaining PO Line Mismatches
-- ============================================================================
-- Run AFTER admin_02b_apply_po_fixes.sql has already been applied.
-- Then re-run admin_04_rebuild_inventory.sql to get a fresh inventory calc.
-- ============================================================================

ALTER TABLE purchase_order_lines DISABLE TRIGGER on_po_line_inventory_update;


-- ── 1. PE Pipe SDR11/ISO 1/2 — ROLL → M (qty stays 150) ─────────────────────
UPDATE purchase_order_lines
SET uom_id     = (SELECT id FROM units_of_measure WHERE code = 'M'),
    updated_at = NOW()
WHERE id = '7a0a3fbd-e3ed-4436-898d-6772501b18c8';


-- ── 2. CORTECH Flexible Hose 1/2 — revert to M, qty 2 → 200 ─────────────────
-- The product's base_uom IS Meter (not ROLL). The original 200M entry was
-- correct — we mistakenly changed it to 2 ROLL in admin_02b.
-- Correct state: uom = M, qty = 200 (200 meters = 2 physical rolls of 100M each)
UPDATE purchase_order_lines
SET uom_id            = (SELECT id FROM units_of_measure WHERE code = 'M'),
    quantity_ordered  = 200,
    quantity_received = 200,
    updated_at        = NOW()
WHERE id = 'f9808ce0-7a34-4f46-a203-7ee5150d2cf5';


ALTER TABLE purchase_order_lines ENABLE TRIGGER on_po_line_inventory_update;


-- ── Verify: should return 0 rows ─────────────────────────────────────────────
SELECT
    pol.id          AS po_line_id,
    po.po_number,
    p.code          AS product_code,
    po_uom.code     AS po_uom,
    base_uom.code   AS base_uom,
    pol.quantity_ordered,
    pol.quantity_received
FROM purchase_order_lines pol
JOIN purchase_orders po  ON po.id  = pol.po_id
JOIN products p          ON p.id   = pol.product_id
LEFT JOIN units_of_measure po_uom   ON po_uom.id   = pol.uom_id
LEFT JOIN units_of_measure base_uom ON base_uom.id = p.base_uom_id
WHERE po.is_deleted = false
  AND pol.uom_id != p.base_uom_id
ORDER BY po.po_date DESC;
