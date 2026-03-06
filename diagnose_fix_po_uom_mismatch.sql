-- ============================================================================
-- DIAGNOSTIC + FIX: Purchase Order Lines With Wrong UOM
-- ============================================================================
-- Policy: PO lines should always use the product's BASE UOM.
-- When a PO is entered in a selling UOM (e.g., BOX instead of KG), the
-- receive_purchase_order_atomic RPC applies the conversion factor:
--
--   base_unit_qty = quantity_received / conversion_factor
--
-- So if 1 BOX = 20 KG (conversion_factor = 0.05), receiving 1 BOX correctly
-- adds 20 KG. BUT if someone entered 20 BOX by mistake:
--   20 / 0.05 = 400 KG added  (should only be 20 KG)
--
-- This script:
--   STEP 1 — Find all PO lines using a non-base UOM
--   STEP 2 — Verify: compare what those POs added to inventory vs what's
--             expected given actual sales and current stock
--   STEP 3 — Fix: re-express each wrong-UOM PO line in base units, and
--             correct the inventory if the quantity was also wrong
-- ============================================================================


-- ============================================================================
-- STEP 1: All PO lines where uom_id != product.base_uom_id
-- ============================================================================

SELECT
    pol.id                                              AS po_line_id,
    po.po_number,
    po.po_date,
    po.status,
    p.code                                              AS product_code,
    p.name                                              AS product_name,

    -- What was entered on the PO
    pol.quantity_ordered                                AS entered_qty_ordered,
    pol.quantity_received                               AS entered_qty_received,
    pol_uom.code                                        AS entered_uom,
    pol_uom.name                                        AS entered_uom_name,

    -- What the base unit is
    base_uom.code                                       AS base_uom_code,
    base_uom.name                                       AS base_uom_name,

    -- Conversion factor used (from product_selling_units or product default)
    COALESCE(
        (SELECT psu.conversion_factor FROM product_selling_units psu
         WHERE psu.product_id = pol.product_id AND psu.uom_id = pol.uom_id AND psu.is_active = true LIMIT 1),
        CASE WHEN p.selling_uom_id = pol.uom_id THEN p.conversion_factor ELSE NULL END
    )                                                   AS conversion_factor,

    -- How many base units this PO line actually added to inventory
    pol.quantity_received / COALESCE(
        (SELECT psu.conversion_factor FROM product_selling_units psu
         WHERE psu.product_id = pol.product_id AND psu.uom_id = pol.uom_id AND psu.is_active = true LIMIT 1),
        CASE WHEN p.selling_uom_id = pol.uom_id AND p.conversion_factor > 0 THEN p.conversion_factor ELSE 1 END
    )                                                   AS received_in_base_units,

    -- What it SHOULD show if re-expressed in base units
    -- (same physical quantity, just in base-unit terms)
    pol.quantity_received / COALESCE(
        (SELECT psu.conversion_factor FROM product_selling_units psu
         WHERE psu.product_id = pol.product_id AND psu.uom_id = pol.uom_id AND psu.is_active = true LIMIT 1),
        CASE WHEN p.selling_uom_id = pol.uom_id AND p.conversion_factor > 0 THEN p.conversion_factor ELSE 1 END
    )                                                   AS corrected_qty_in_base_uom,

    b.name                                              AS branch,
    s.name                                              AS supplier,
    pol.unit_cost
FROM purchase_order_lines pol
JOIN purchase_orders po     ON po.id  = pol.po_id
JOIN products p             ON p.id   = pol.product_id
JOIN units_of_measure pol_uom  ON pol_uom.id  = pol.uom_id
JOIN units_of_measure base_uom ON base_uom.id = p.base_uom_id
LEFT JOIN branches b        ON b.id   = po.branch_id
LEFT JOIN suppliers s       ON s.id   = po.supplier_id
WHERE pol.uom_id != p.base_uom_id       -- ← only wrong-UOM lines
  AND po.is_deleted = false
ORDER BY po.po_date DESC, p.code;


-- ============================================================================
-- STEP 2: Impact check — PO totals vs sales+inventory source of truth
-- For each product that has at least one wrong-UOM PO line, compare:
--   total_po_base_added vs (current_inventory + total_sold - returns - manual_adj)
-- ============================================================================

WITH wrong_uom_products AS (
    SELECT DISTINCT pol.product_id
    FROM purchase_order_lines pol
    JOIN purchase_orders po ON po.id = pol.po_id
    JOIN products p ON p.id = pol.product_id
    WHERE pol.uom_id != p.base_uom_id
      AND po.is_deleted = false
),
po_totals AS (
    SELECT
        pol.product_id,
        po.branch_id,
        SUM(
            pol.quantity_received / COALESCE(
                (SELECT psu.conversion_factor FROM product_selling_units psu
                 WHERE psu.product_id = pol.product_id AND psu.uom_id = pol.uom_id AND psu.is_active = true LIMIT 1),
                CASE WHEN p.selling_uom_id = pol.uom_id AND p.conversion_factor > 0 THEN p.conversion_factor ELSE 1 END
            )
        )                                                           AS total_received_base,
        SUM(
            -- PO lines with correct (base) UOM
            CASE WHEN pol.uom_id = p.base_uom_id THEN pol.quantity_received ELSE 0 END
            +
            -- PO lines with wrong UOM converted to base
            CASE WHEN pol.uom_id != p.base_uom_id THEN
                pol.quantity_received / COALESCE(
                    (SELECT psu.conversion_factor FROM product_selling_units psu
                     WHERE psu.product_id = pol.product_id AND psu.uom_id = pol.uom_id AND psu.is_active = true LIMIT 1),
                    CASE WHEN p.selling_uom_id = pol.uom_id AND p.conversion_factor > 0 THEN p.conversion_factor ELSE 1 END
                )
            ELSE 0 END
        )                                                           AS total_received_base_all
    FROM purchase_order_lines pol
    JOIN purchase_orders po ON po.id = pol.po_id
    JOIN products p ON p.id = pol.product_id
    WHERE po.is_deleted = false AND pol.quantity_received > 0
    GROUP BY pol.product_id, po.branch_id
),
sold_totals AS (
    SELECT
        tl.product_id, t.branch_id,
        SUM(tl.quantity / COALESCE(
            (SELECT psu.conversion_factor FROM product_selling_units psu
             WHERE psu.product_id = tl.product_id AND psu.uom_id = tl.uom_id AND psu.is_active = true LIMIT 1),
            CASE WHEN p2.selling_uom_id = tl.uom_id AND p2.conversion_factor > 0 THEN p2.conversion_factor ELSE 1 END
        )) AS total_sold_base
    FROM transaction_lines tl
    JOIN transactions t ON t.id = tl.transaction_id
    JOIN products p2 ON p2.id = tl.product_id
    WHERE t.is_deleted = false AND t.transaction_type = 'sale'
    GROUP BY tl.product_id, t.branch_id
),
manual_totals AS (
    SELECT product_id, branch_id, SUM(quantity_change) AS total_adj
    FROM inventory_movements
    WHERE reference_type = 'manual_adjustment'
    GROUP BY product_id, branch_id
)
SELECT
    p.code,
    p.name,
    b.name                                          AS branch,
    base_uom.code                                   AS base_uom,
    pt.total_received_base                          AS po_added_to_inventory,
    COALESCE(st.total_sold_base, 0)                AS sold,
    COALESCE(ma.total_adj, 0)                      AS manual_adj,
    pt.total_received_base
        - COALESCE(st.total_sold_base, 0)
        + COALESCE(ma.total_adj, 0)                AS expected_stock,
    COALESCE(bi.quantity_on_hand, 0)               AS current_stock,
    COALESCE(bi.quantity_on_hand, 0)
        - (pt.total_received_base - COALESCE(st.total_sold_base, 0) + COALESCE(ma.total_adj, 0))
                                                    AS discrepancy,
    p.conversion_factor,
    selling_uom.code                               AS selling_uom_code,
    COUNT(pol.id) FILTER (WHERE pol.uom_id != p.base_uom_id)
                                                   AS wrong_uom_po_lines
FROM wrong_uom_products wup
JOIN products p ON p.id = wup.product_id
JOIN po_totals pt ON pt.product_id = p.id
JOIN branches b ON b.id = pt.branch_id
LEFT JOIN units_of_measure base_uom   ON base_uom.id   = p.base_uom_id
LEFT JOIN units_of_measure selling_uom ON selling_uom.id = p.selling_uom_id
LEFT JOIN sold_totals st ON st.product_id = p.id AND st.branch_id = pt.branch_id
LEFT JOIN manual_totals ma ON ma.product_id = p.id AND ma.branch_id = pt.branch_id
LEFT JOIN branch_inventory bi ON bi.product_id = p.id AND bi.branch_id = pt.branch_id
LEFT JOIN purchase_order_lines pol ON pol.product_id = p.id
    AND EXISTS (SELECT 1 FROM purchase_orders po2 WHERE po2.id = pol.po_id AND po2.branch_id = pt.branch_id AND po2.is_deleted = false)
GROUP BY p.id, p.code, p.name, p.conversion_factor, b.id, b.name,
         base_uom.code, selling_uom.code,
         pt.total_received_base, st.total_sold_base, ma.total_adj, bi.quantity_on_hand
ORDER BY ABS(
    COALESCE(bi.quantity_on_hand, 0)
    - (pt.total_received_base - COALESCE(st.total_sold_base, 0) + COALESCE(ma.total_adj, 0))
) DESC;


-- ============================================================================
-- STEP 3: Fix a specific PO line — re-express in base UOM + correct inventory
-- ============================================================================
-- Run this for EACH wrong-UOM PO line identified in STEP 1.
-- It:
--   a) Updates the PO line: converts quantity to base UOM (display fix)
--   b) Updates the PO line: sets uom_id to product.base_uom_id
--   c) Checks whether the inventory impact was already correct
--      (it was, if receive_purchase_order_atomic applied the conversion)
--   d) If inventory is off vs source-of-truth, records a corrective adjustment
--
-- NOTE: The receive_po_atomic RPC already converts to base units during receiving,
-- so in most cases inventory IS already correct in base units.
-- The PO line fix is mainly a DATA QUALITY fix (so the PO displays correctly).
-- Only run (d) if STEP 2 shows a real discrepancy for that product.
-- ============================================================================

DO $$
DECLARE
    -- ── EDIT THESE ────────────────────────────────────────────────────────
    v_po_line_id        UUID := 'PASTE_PO_LINE_ID_HERE';
    -- Set to true ONLY if STEP 2 shows inventory is also wrong for this product
    v_also_fix_inventory BOOLEAN := false;
    -- If v_also_fix_inventory = true, set these:
    v_correct_inventory DECIMAL := 0;  -- the "expected_stock" value from STEP 2
    -- ─────────────────────────────────────────────────────────────────────

    v_system_user_id    UUID;
    v_product_id        UUID;
    v_branch_id         UUID;
    v_product_name      TEXT;
    v_po_number         TEXT;
    v_current_uom_id    UUID;
    v_base_uom_id       UUID;
    v_base_uom_code     TEXT;
    v_conv_factor       DECIMAL(12,6);
    v_old_qty_ordered   DECIMAL(12,4);
    v_old_qty_received  DECIMAL(12,4);
    v_new_qty_ordered   DECIMAL(12,4);
    v_new_qty_received  DECIMAL(12,4);
    v_current_inv       DECIMAL(12,4);
BEGIN
    IF v_po_line_id::TEXT = 'PASTE_PO_LINE_ID_HERE' THEN
        RAISE EXCEPTION 'Edit v_po_line_id before running STEP 3.';
    END IF;

    -- Get admin user
    SELECT id INTO v_system_user_id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1;

    -- Get PO line and product info
    SELECT
        pol.product_id, po.branch_id,
        po.po_number,
        pol.uom_id,
        p.base_uom_id,
        uom_base.code,
        p.name,
        COALESCE(
            (SELECT psu.conversion_factor FROM product_selling_units psu
             WHERE psu.product_id = pol.product_id AND psu.uom_id = pol.uom_id AND psu.is_active = true LIMIT 1),
            CASE WHEN p.selling_uom_id = pol.uom_id AND p.conversion_factor > 0 THEN p.conversion_factor ELSE 1 END
        ),
        pol.quantity_ordered,
        pol.quantity_received
    INTO
        v_product_id, v_branch_id,
        v_po_number,
        v_current_uom_id,
        v_base_uom_id,
        v_base_uom_code,
        v_product_name,
        v_conv_factor,
        v_old_qty_ordered,
        v_old_qty_received
    FROM purchase_order_lines pol
    JOIN purchase_orders po ON po.id = pol.po_id
    JOIN products p ON p.id = pol.product_id
    JOIN units_of_measure uom_base ON uom_base.id = p.base_uom_id
    WHERE pol.id = v_po_line_id;

    IF v_current_uom_id = v_base_uom_id THEN
        RAISE NOTICE 'PO line % already uses base UOM. No UOM fix needed.', v_po_line_id;
    ELSE
        -- Convert quantities to base units
        v_new_qty_ordered   := v_old_qty_ordered  / v_conv_factor;
        v_new_qty_received  := v_old_qty_received / v_conv_factor;

        RAISE NOTICE '== UOM Correction for % ==', v_product_name;
        RAISE NOTICE 'PO: %', v_po_number;
        RAISE NOTICE 'Converting from non-base UOM to %  (conv_factor=%)', v_base_uom_code, v_conv_factor;
        RAISE NOTICE 'qty_ordered:  % → %', v_old_qty_ordered, v_new_qty_ordered;
        RAISE NOTICE 'qty_received: % → %', v_old_qty_received, v_new_qty_received;

        -- Update PO line to use base UOM with converted quantities
        UPDATE purchase_order_lines
        SET uom_id           = v_base_uom_id,
            quantity_ordered  = v_new_qty_ordered,
            quantity_received = v_new_qty_received,
            updated_at        = NOW()
        WHERE id = v_po_line_id;

        RAISE NOTICE 'PO line updated to base UOM %.', v_base_uom_code;
    END IF;

    -- Optionally fix inventory discrepancy
    IF v_also_fix_inventory THEN
        SELECT quantity_on_hand INTO v_current_inv
        FROM branch_inventory
        WHERE product_id = v_product_id AND branch_id = v_branch_id;

        IF ABS(v_current_inv - v_correct_inventory) > 0.01 THEN
            RAISE NOTICE 'Fixing inventory: % → %', v_current_inv, v_correct_inventory;

            UPDATE branch_inventory
            SET quantity_on_hand = v_correct_inventory,
                last_movement_at = NOW()
            WHERE product_id = v_product_id AND branch_id = v_branch_id;

            INSERT INTO inventory_movements (
                branch_id, product_id, variant_id,
                movement_type, quantity_change,
                quantity_before, quantity_after,
                reference_type, reference_id, created_by, notes
            ) VALUES (
                v_branch_id, v_product_id, NULL,
                'adjustment', v_correct_inventory - v_current_inv,
                v_current_inv, v_correct_inventory,
                'manual_adjustment', v_po_line_id,
                v_system_user_id,
                'PO UOM correction: PO line ' || v_po_line_id ||
                ' (PO ' || v_po_number || ') was in wrong UOM. ' ||
                'Inventory corrected from ' || v_current_inv ||
                ' to ' || v_correct_inventory || ' ' || v_base_uom_code || '.'
            );

            RAISE NOTICE 'Inventory corrected and movement recorded.';
        ELSE
            RAISE NOTICE 'Inventory already matches expected (%). No adjustment needed.', v_current_inv;
        END IF;
    END IF;
END $$;


-- ============================================================================
-- STEP 4: Verify — run after STEP 3 for each fixed product
-- Replace 'PRODUCT_CODE_HERE' with the product you just fixed
-- ============================================================================

SELECT
    pol.id AS po_line_id, po.po_number, po.po_date, po.status,
    p.code, p.name,
    pol.quantity_ordered, pol.quantity_received,
    uom.code AS uom,
    CASE WHEN pol.uom_id = p.base_uom_id THEN '✓ base UOM' ELSE '⚠ wrong UOM' END AS uom_status
FROM purchase_order_lines pol
JOIN purchase_orders po ON po.id = pol.po_id
JOIN products p ON p.id = pol.product_id
JOIN units_of_measure uom ON uom.id = pol.uom_id
WHERE p.code = 'PRODUCT_CODE_HERE'
  AND po.is_deleted = false
ORDER BY po.po_date DESC;
