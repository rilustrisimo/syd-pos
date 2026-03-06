-- ============================================================================
-- ADMIN STEP 2g: Fix Hardware Cloth PO Line UOM Mismatch
-- ============================================================================
-- PO-20260225-0001: Hardware Cloth/ Ayagan recorded as ROLL → should be M
-- Quantity stays 12 (it was entered in meters, just wrong UOM label).
-- Run AFTER admin_02f_tie_wire_fix.sql has been applied.
-- Then run admin_03 + admin_04 to rebuild inventory.
-- ============================================================================

-- Note: on_po_line_inventory_update trigger was already dropped in migration 00034


-- ── 1. Fix Hardware Cloth — ROLL → M (qty stays 12) ──────────────────────────
UPDATE purchase_order_lines
SET uom_id     = (SELECT id FROM units_of_measure WHERE code = 'M'),
    updated_at = NOW()
WHERE id = '79996198-3299-4817-9c56-b11e123d7749';


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
