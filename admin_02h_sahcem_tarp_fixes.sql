-- ============================================================================
-- ADMIN STEP 2h: Fix Sahara Cement and Tarpaulin PO Line UOM Mismatches
-- ============================================================================
-- PO-20260303-0015: Sahara Cement recorded as BOX → should be PACK (qty stays 32)
-- PO-20260223-0001: Tarpaulin Blue/Orange recorded as ROLL → should be M (qty stays 100)
-- Run AFTER admin_02g_hwc_fix.sql has been applied.
-- Then run admin_03 + admin_04 to rebuild inventory.
-- ============================================================================

-- Note: on_po_line_inventory_update trigger was already dropped in migration 00034


-- ── 1. Sahara Cement — BOX → PACK (qty stays 32) ─────────────────────────────
UPDATE purchase_order_lines
SET uom_id     = (SELECT id FROM units_of_measure WHERE code = 'PACK'),
    updated_at = NOW()
WHERE id = 'c14a4f75-8a12-4937-9c80-5d0d8a82c784';


-- ── 2. Tarpaulin Blue/Orange 8ft — ROLL → M (qty stays 100) ──────────────────
UPDATE purchase_order_lines
SET uom_id     = (SELECT id FROM units_of_measure WHERE code = 'M'),
    updated_at = NOW()
WHERE id = 'f75d73d5-c6e6-4848-9b53-5b443d6e4630';


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
