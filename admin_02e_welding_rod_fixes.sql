-- ============================================================================
-- ADMIN STEP 2e: Fix 2 Welding Rod PO Line UOM Mismatches
-- ============================================================================
-- Run AFTER admin_02d_nail_fixes.sql has already been applied.
-- Then re-run admin_04_rebuild_inventory.sql to get a fresh inventory calc.
-- ============================================================================

ALTER TABLE purchase_order_lines DISABLE TRIGGER on_po_line_inventory_update;


-- ── 1. GOLDEN BRIDGE Welding Rod #6013 (China) — BOX → KG (qty stays 20) ────
UPDATE purchase_order_lines
SET uom_id     = (SELECT id FROM units_of_measure WHERE code = 'KG'),
    updated_at = NOW()
WHERE id = '85cfe63f-a824-4dad-8aed-23e1768dd709';


-- ── 2. FUJI Welding Rod #6013 — BOX → KG (qty stays 20) ─────────────────────
UPDATE purchase_order_lines
SET uom_id     = (SELECT id FROM units_of_measure WHERE code = 'KG'),
    updated_at = NOW()
WHERE id = 'b1efddec-67cd-4f4d-b024-550e9dd1448e';


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
