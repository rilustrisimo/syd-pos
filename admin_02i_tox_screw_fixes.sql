-- ============================================================================
-- ADMIN STEP 2i: Fix Tox Screw PO Line UOM Mismatches
-- ============================================================================
-- PO-20260226-0001: 3 Tox Screw lines recorded as PACK → should be PAIR
-- Quantities stay the same (100, 100, 60).
-- Run AFTER admin_02h_sahcem_tarp_fixes.sql has been applied.
-- Then run admin_03 + admin_04 to rebuild inventory.
-- ============================================================================

-- Note: on_po_line_inventory_update trigger was already dropped in migration 00034


-- ── 1. Tox Screw 5mm — PACK → PAIR (qty stays 100) ───────────────────────────
UPDATE purchase_order_lines
SET uom_id     = (SELECT id FROM units_of_measure WHERE code = 'PAIR'),
    updated_at = NOW()
WHERE id = '57cbe793-ad31-4863-8303-338e3047994e';


-- ── 2. Tox Screw 6mm — PACK → PAIR (qty stays 100) ───────────────────────────
UPDATE purchase_order_lines
SET uom_id     = (SELECT id FROM units_of_measure WHERE code = 'PAIR'),
    updated_at = NOW()
WHERE id = '063d712a-39ba-4768-b70f-6c6f3d2826db';


-- ── 3. Tox Screw 8mm — PACK → PAIR (qty stays 60) ────────────────────────────
UPDATE purchase_order_lines
SET uom_id     = (SELECT id FROM units_of_measure WHERE code = 'PAIR'),
    updated_at = NOW()
WHERE id = 'f87d00ec-9f77-4748-9961-501cb081b5ae';


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
