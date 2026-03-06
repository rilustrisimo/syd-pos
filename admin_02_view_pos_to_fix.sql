-- ============================================================================
-- ADMIN STEP 2: Review All PO Lines — Identify What Needs Editing
-- ============================================================================
-- Run these queries to see your purchase order data and identify lines
-- where the UOM or quantity needs correcting.
--
-- After reviewing, edit PO lines DIRECTLY using the UPDATE templates at
-- the bottom of this file.
-- ============================================================================


-- ── 2a. Full PO line listing — with base vs. PO UOM comparison ───────────────
-- Lines where uom_id != base_uom_id are flagged as potentially wrong.
SELECT
    pol.id                                  AS po_line_id,
    po.po_number,
    po.po_date,
    po.status                               AS po_status,
    p.code                                  AS product_code,
    p.name                                  AS product_name,
    pol.quantity_ordered,
    pol.quantity_received,
    po_uom.code                             AS po_uom,
    base_uom.code                           AS base_uom,
    sell_uom.code                           AS selling_uom,
    p.conversion_factor,
    -- Flag: is the PO UOM different from the base UOM?
    CASE
        WHEN pol.uom_id != p.base_uom_id THEN '⚠️  UOM MISMATCH'
        ELSE '✓ OK'
    END                                     AS uom_check,
    -- What the received qty converts to in base units
    CASE
        WHEN pol.uom_id = p.base_uom_id THEN pol.quantity_received
        WHEN pol.uom_id = p.selling_uom_id AND p.conversion_factor > 0
            THEN pol.quantity_received / p.conversion_factor
        ELSE NULL  -- Unknown conversion
    END                                     AS received_in_base_units,
    pol.unit_cost,
    b.name                                  AS branch,
    s.name                                  AS supplier
FROM purchase_order_lines pol
JOIN purchase_orders po  ON po.id  = pol.po_id
JOIN products p          ON p.id   = pol.product_id
LEFT JOIN units_of_measure po_uom   ON po_uom.id   = pol.uom_id
LEFT JOIN units_of_measure base_uom ON base_uom.id = p.base_uom_id
LEFT JOIN units_of_measure sell_uom ON sell_uom.id = p.selling_uom_id
LEFT JOIN branches b     ON b.id   = po.branch_id
LEFT JOIN suppliers s    ON s.id   = po.supplier_id
WHERE po.is_deleted = false
ORDER BY
    -- Show mismatches first
    (pol.uom_id != p.base_uom_id) DESC,
    po.po_date DESC,
    pol.line_number;


-- ── 2b. Summary: only lines with UOM mismatches ──────────────────────────────
SELECT
    pol.id                                  AS po_line_id,
    po.po_number,
    po.po_date::DATE,
    p.code                                  AS product_code,
    p.name                                  AS product_name,
    pol.quantity_ordered,
    pol.quantity_received,
    po_uom.code                             AS recorded_uom,
    base_uom.code                           AS should_be_uom,
    p.conversion_factor,
    -- Suggested correction
    ROUND((pol.quantity_ordered   / p.conversion_factor)::NUMERIC, 4)  AS corrected_qty_ordered,
    ROUND((pol.quantity_received  / p.conversion_factor)::NUMERIC, 4)  AS corrected_qty_received,
    b.name                                  AS branch,
    s.name                                  AS supplier
FROM purchase_order_lines pol
JOIN purchase_orders po  ON po.id  = pol.po_id
JOIN products p          ON p.id   = pol.product_id
LEFT JOIN units_of_measure po_uom   ON po_uom.id   = pol.uom_id
LEFT JOIN units_of_measure base_uom ON base_uom.id = p.base_uom_id
LEFT JOIN branches b     ON b.id   = po.branch_id
LEFT JOIN suppliers s    ON s.id   = po.supplier_id
WHERE po.is_deleted = false
  AND pol.uom_id != p.base_uom_id
ORDER BY po.po_date DESC;


-- ── 2c. Edit a PO line directly ───────────────────────────────────────────────
-- Copy and fill in the IDs/values from query 2b, then run.
-- Run one UPDATE per line that needs fixing.
--
-- Example for CORTECH Flexible Hose 1/2 (200M → 2 ROLL):
--
-- UPDATE purchase_order_lines
-- SET
--     uom_id            = (SELECT id FROM units_of_measure WHERE code = 'ROLL'),
--     quantity_ordered  = 2,
--     quantity_received = 2,
--     updated_at        = NOW()
-- WHERE id = 'PASTE_PO_LINE_ID_HERE';
--
-- Example: fix just the UOM (quantity was already correct in base units):
--
-- UPDATE purchase_order_lines
-- SET
--     uom_id     = (SELECT id FROM units_of_measure WHERE code = 'KG'),
--     updated_at = NOW()
-- WHERE id = 'PASTE_PO_LINE_ID_HERE';
--
-- After fixing, update PO status if needed:
--
-- UPDATE purchase_orders
-- SET status = CASE
--     WHEN (SELECT SUM(quantity_received) >= SUM(quantity_ordered) FROM purchase_order_lines WHERE po_id = purchase_orders.id)
--         THEN 'received'
--     WHEN (SELECT SUM(quantity_received) > 0 FROM purchase_order_lines WHERE po_id = purchase_orders.id)
--         THEN 'partial'
--     ELSE 'ordered'
-- END
-- WHERE id = 'PASTE_PO_ID_HERE';


-- ── 2d. Verify your edit after making it ─────────────────────────────────────
-- Replace with your po_line_id to confirm the change looks right.
--
-- SELECT
--     pol.id, po.po_number, p.name,
--     pol.quantity_ordered, pol.quantity_received,
--     uom.code AS uom
-- FROM purchase_order_lines pol
-- JOIN purchase_orders po ON po.id = pol.po_id
-- JOIN products p ON p.id = pol.product_id
-- LEFT JOIN units_of_measure uom ON uom.id = pol.uom_id
-- WHERE pol.id = 'PASTE_PO_LINE_ID_HERE';
