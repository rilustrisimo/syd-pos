-- ============================================================================
-- ADMIN STEP 4: Rebuild Inventory from Corrected POs + Sales
-- ============================================================================
-- Run this AFTER:
--   ✅ admin_01_backup.sql  — backups done
--   ✅ admin_02_view_pos_to_fix.sql — all PO lines corrected (UOM = base UOM)
--   ✅ admin_03_reset_inventory.sql — inventory zeroed, movements cleared
--
-- ASSUMPTIONS (must be true before running):
--   • All purchase_order_lines.uom_id = products.base_uom_id
--     (you fixed them in Step 2)
--   • All quantities in purchase_order_lines are in BASE UNITS
--   • Sales (transaction_lines) may be in selling UOM — conversion is applied
--     using products.conversion_factor
--
-- WHAT THIS SCRIPT DOES:
--   1. Replays all received PO lines → adds to branch_inventory
--      Records an inventory_movement per PO line (type = 'purchase')
--   2. Replays all sales → deducts from branch_inventory
--      Records an inventory_movement per transaction line (type = 'sale')
--   3. Replays all restocked returns → adds back to branch_inventory
--      Records an inventory_movement per return line (type = 'return')
--
-- The result is a complete, auditable movement history that matches
-- the corrected source data.
-- ============================================================================

DO $$
DECLARE
    v_admin_id          UUID;
    v_po_line           RECORD;
    v_sale_line         RECORD;
    v_return_line       RECORD;
    v_inv_id            UUID;
    v_qty_before        DECIMAL(12,4);
    v_qty_after         DECIMAL(12,4);
    v_base_qty          DECIMAL(12,4);
    v_conv_factor       DECIMAL(12,4);
    v_movements_po      INT := 0;
    v_movements_sale    INT := 0;
    v_movements_return  INT := 0;
BEGIN
    -- ─────────────────────────────────────────────────────────────────────
    -- Get admin user for created_by on all new movements
    -- ─────────────────────────────────────────────────────────────────────
    SELECT id INTO v_admin_id
    FROM users
    WHERE role = 'admin'
    ORDER BY created_at
    LIMIT 1;

    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'No admin user found. Cannot record movements without created_by.';
    END IF;

    RAISE NOTICE '════════════════════════════════════════════';
    RAISE NOTICE 'Starting inventory rebuild from source data';
    RAISE NOTICE '════════════════════════════════════════════';

    -- =========================================================================
    -- PHASE 1: Replay received purchase order lines
    -- =========================================================================
    -- Assumption: all PO lines are now in base UOM, so no conversion needed.
    -- quantity_received is already in base units.
    -- =========================================================================
    RAISE NOTICE 'Phase 1: Processing received PO lines...';

    FOR v_po_line IN
        SELECT
            pol.id              AS po_line_id,
            po.id               AS po_id,
            po.po_number,
            po.branch_id,
            pol.product_id,
            pol.variant_id,
            pol.quantity_received,
            p.name              AS product_name
        FROM purchase_order_lines pol
        JOIN purchase_orders po ON po.id = pol.po_id
        JOIN products p         ON p.id  = pol.product_id
        WHERE po.is_deleted = false
          AND pol.quantity_received > 0
        ORDER BY po.po_date, pol.line_number
    LOOP
        -- Get or create branch_inventory row (with lock)
        SELECT id, quantity_on_hand
        INTO v_inv_id, v_qty_before
        FROM branch_inventory
        WHERE branch_id  = v_po_line.branch_id
          AND product_id = v_po_line.product_id
          AND (variant_id = v_po_line.variant_id OR (variant_id IS NULL AND v_po_line.variant_id IS NULL))
        FOR UPDATE;

        v_qty_before := COALESCE(v_qty_before, 0);
        v_qty_after  := v_qty_before + v_po_line.quantity_received;

        IF v_inv_id IS NULL THEN
            INSERT INTO branch_inventory (branch_id, product_id, variant_id, quantity_on_hand, last_movement_at)
            VALUES (v_po_line.branch_id, v_po_line.product_id, v_po_line.variant_id, v_po_line.quantity_received, NOW())
            RETURNING id INTO v_inv_id;
        ELSE
            UPDATE branch_inventory
            SET quantity_on_hand = v_qty_after,
                last_movement_at = NOW()
            WHERE id = v_inv_id;
        END IF;

        -- Record movement
        INSERT INTO inventory_movements (
            branch_id, product_id, variant_id,
            movement_type, quantity_change, quantity_before, quantity_after,
            reference_id, reference_type, created_by, notes
        ) VALUES (
            v_po_line.branch_id, v_po_line.product_id, v_po_line.variant_id,
            'purchase',
            v_po_line.quantity_received,
            v_qty_before,
            v_qty_after,
            v_po_line.po_id,
            'purchase_order',
            v_admin_id,
            'Rebuilt: PO ' || v_po_line.po_number || ' — received ' || v_po_line.quantity_received || ' base units of ' || v_po_line.product_name
        );

        v_movements_po := v_movements_po + 1;
    END LOOP;

    RAISE NOTICE 'Phase 1 complete: % PO movements recorded', v_movements_po;

    -- =========================================================================
    -- PHASE 2: Replay sales
    -- =========================================================================
    -- Sales are in selling UOM (e.g., Meter for CORTECH hose).
    -- Convert to base units: base_qty = sale_qty / products.conversion_factor
    --   • If sale UOM = base UOM: conversion_factor is effectively 1
    --   • If sale UOM = selling UOM: divide by products.conversion_factor
    --   • If sale UOM is in product_selling_units: use that conversion
    -- =========================================================================
    RAISE NOTICE 'Phase 2: Processing sales...';

    FOR v_sale_line IN
        SELECT
            tl.id               AS line_id,
            t.id                AS transaction_id,
            t.transaction_number,
            t.branch_id,
            tl.product_id,
            tl.variant_id,
            tl.quantity,
            tl.uom_id,
            p.base_uom_id,
            p.selling_uom_id,
            p.conversion_factor AS product_cf,
            p.name              AS product_name,
            t.transaction_date
        FROM transaction_lines tl
        JOIN transactions t  ON t.id   = tl.transaction_id
        JOIN products p      ON p.id   = tl.product_id
        WHERE t.is_deleted = false
          AND t.transaction_type = 'sale'
        ORDER BY t.transaction_date, t.transaction_number
    LOOP
        -- Determine base-unit quantity to deduct
        IF v_sale_line.uom_id = v_sale_line.base_uom_id THEN
            -- Sale is already in base units
            v_base_qty := v_sale_line.quantity;
        ELSE
            -- Try product_selling_units first (for products with explicit selling unit configs)
            -- psu.conversion_factor = "how many selling units equal 1 base unit"
            -- e.g. Sand: factor=44 means 44 sacks = 1 CU.M → base = qty / factor
            SELECT COALESCE(
                (SELECT v_sale_line.quantity / psu.conversion_factor
                 FROM product_selling_units psu
                 WHERE psu.product_id = v_sale_line.product_id
                   AND psu.uom_id = v_sale_line.uom_id
                   AND psu.is_active = true
                   AND psu.conversion_factor > 0
                 LIMIT 1),
                -- Fallback: use products.conversion_factor (selling UOM → base UOM)
                CASE
                    WHEN v_sale_line.uom_id = v_sale_line.selling_uom_id
                         AND v_sale_line.product_cf > 0
                    THEN v_sale_line.quantity / v_sale_line.product_cf
                    ELSE v_sale_line.quantity  -- Unknown UOM: treat as base unit
                END
            ) INTO v_base_qty;
        END IF;

        -- Get inventory row
        SELECT id, quantity_on_hand
        INTO v_inv_id, v_qty_before
        FROM branch_inventory
        WHERE branch_id  = v_sale_line.branch_id
          AND product_id = v_sale_line.product_id
          AND (variant_id = v_sale_line.variant_id OR (variant_id IS NULL AND v_sale_line.variant_id IS NULL))
        FOR UPDATE;

        v_qty_before := COALESCE(v_qty_before, 0);
        v_qty_after  := v_qty_before - v_base_qty;
        -- Note: allow negative (show the problem rather than silently hide it)

        IF v_inv_id IS NULL THEN
            INSERT INTO branch_inventory (branch_id, product_id, variant_id, quantity_on_hand, last_movement_at)
            VALUES (v_sale_line.branch_id, v_sale_line.product_id, v_sale_line.variant_id, -v_base_qty, NOW())
            RETURNING id INTO v_inv_id;
        ELSE
            UPDATE branch_inventory
            SET quantity_on_hand = v_qty_after,
                last_movement_at = NOW()
            WHERE id = v_inv_id;
        END IF;

        INSERT INTO inventory_movements (
            branch_id, product_id, variant_id,
            movement_type, quantity_change, quantity_before, quantity_after,
            reference_id, reference_type, created_by, notes
        ) VALUES (
            v_sale_line.branch_id, v_sale_line.product_id, v_sale_line.variant_id,
            'sale',
            -v_base_qty,
            v_qty_before,
            v_qty_after,
            v_sale_line.transaction_id,
            'transaction',
            v_admin_id,
            'Rebuilt: Sale ' || v_sale_line.transaction_number || ' — sold ' || v_sale_line.quantity || ' → ' || ROUND(v_base_qty::NUMERIC, 4) || ' base units of ' || v_sale_line.product_name
        );

        v_movements_sale := v_movements_sale + 1;
    END LOOP;

    RAISE NOTICE 'Phase 2 complete: % sale movements recorded', v_movements_sale;

    -- =========================================================================
    -- PHASE 3: Replay returns (restock only)
    -- =========================================================================
    RAISE NOTICE 'Phase 3: Processing returns (should_restock = true)...';

    FOR v_return_line IN
        SELECT
            tl.id               AS line_id,
            t.id                AS transaction_id,
            t.transaction_number,
            t.branch_id,
            tl.product_id,
            tl.variant_id,
            tl.quantity,
            tl.uom_id,
            p.base_uom_id,
            p.selling_uom_id,
            p.conversion_factor AS product_cf,
            p.name              AS product_name
        FROM transaction_lines tl
        JOIN transactions t  ON t.id   = tl.transaction_id
        JOIN products p      ON p.id   = tl.product_id
        WHERE t.is_deleted = false
          AND t.transaction_type = 'return'
          AND COALESCE(tl.should_restock, true) = true
        ORDER BY t.transaction_date, t.transaction_number
    LOOP
        -- Same conversion logic as sales
        IF v_return_line.uom_id = v_return_line.base_uom_id THEN
            v_base_qty := v_return_line.quantity;
        ELSE
            -- Same logic: base = qty / psu.conversion_factor
            SELECT COALESCE(
                (SELECT v_return_line.quantity / psu.conversion_factor
                 FROM product_selling_units psu
                 WHERE psu.product_id = v_return_line.product_id
                   AND psu.uom_id = v_return_line.uom_id
                   AND psu.is_active = true
                   AND psu.conversion_factor > 0
                 LIMIT 1),
                CASE
                    WHEN v_return_line.uom_id = v_return_line.selling_uom_id
                         AND v_return_line.product_cf > 0
                    THEN v_return_line.quantity / v_return_line.product_cf
                    ELSE v_return_line.quantity
                END
            ) INTO v_base_qty;
        END IF;

        SELECT id, quantity_on_hand
        INTO v_inv_id, v_qty_before
        FROM branch_inventory
        WHERE branch_id  = v_return_line.branch_id
          AND product_id = v_return_line.product_id
          AND (variant_id = v_return_line.variant_id OR (variant_id IS NULL AND v_return_line.variant_id IS NULL))
        FOR UPDATE;

        v_qty_before := COALESCE(v_qty_before, 0);
        v_qty_after  := v_qty_before + v_base_qty;

        IF v_inv_id IS NULL THEN
            INSERT INTO branch_inventory (branch_id, product_id, variant_id, quantity_on_hand, last_movement_at)
            VALUES (v_return_line.branch_id, v_return_line.product_id, v_return_line.variant_id, v_base_qty, NOW())
            RETURNING id INTO v_inv_id;
        ELSE
            UPDATE branch_inventory
            SET quantity_on_hand = v_qty_after,
                last_movement_at = NOW()
            WHERE id = v_inv_id;
        END IF;

        INSERT INTO inventory_movements (
            branch_id, product_id, variant_id,
            movement_type, quantity_change, quantity_before, quantity_after,
            reference_id, reference_type, created_by, notes
        ) VALUES (
            v_return_line.branch_id, v_return_line.product_id, v_return_line.variant_id,
            'return',
            v_base_qty,
            v_qty_before,
            v_qty_after,
            v_return_line.transaction_id,
            'transaction',
            v_admin_id,
            'Rebuilt: Return ' || v_return_line.transaction_number || ' — restocked ' || ROUND(v_base_qty::NUMERIC, 4) || ' base units of ' || v_return_line.product_name
        );

        v_movements_return := v_movements_return + 1;
    END LOOP;

    RAISE NOTICE 'Phase 3 complete: % return movements recorded', v_movements_return;

    -- ─────────────────────────────────────────────────────────────────────
    -- Final summary
    -- ─────────────────────────────────────────────────────────────────────
    RAISE NOTICE '════════════════════════════════════════════';
    RAISE NOTICE 'Rebuild complete!';
    RAISE NOTICE '  PO movements:     %', v_movements_po;
    RAISE NOTICE '  Sale movements:   %', v_movements_sale;
    RAISE NOTICE '  Return movements: %', v_movements_return;
    RAISE NOTICE '  Total movements:  %', v_movements_po + v_movements_sale + v_movements_return;
    RAISE NOTICE '════════════════════════════════════════════';
END $$;


-- ── Verification queries (run after the block above) ─────────────────────────

-- Final inventory per product per branch
SELECT
    b.name                              AS branch,
    p.code                              AS product_code,
    p.name                              AS product_name,
    bi.quantity_on_hand,
    uom.code                            AS base_uom,
    -- Flag negative stock
    CASE WHEN bi.quantity_on_hand < 0 THEN '⚠️  NEGATIVE' ELSE '✓' END AS stock_status
FROM branch_inventory bi
JOIN products p  ON p.id  = bi.product_id
JOIN branches b  ON b.id  = bi.branch_id
LEFT JOIN units_of_measure uom ON uom.id = p.base_uom_id
ORDER BY bi.quantity_on_hand < 0 DESC, b.name, p.code;


-- Audit: movement total should equal quantity_on_hand (Balanced check)
SELECT
    b.name                              AS branch,
    p.code                              AS product_code,
    p.name                              AS product_name,
    bi.quantity_on_hand                 AS on_hand,
    COALESCE(SUM(im.quantity_change), 0) AS movement_total,
    CASE
        WHEN ABS(bi.quantity_on_hand - COALESCE(SUM(im.quantity_change), 0)) < 0.001
        THEN '✅ Balanced'
        ELSE '❌ Mismatch: ' || (bi.quantity_on_hand - COALESCE(SUM(im.quantity_change), 0))::TEXT
    END                                 AS audit_status
FROM branch_inventory bi
JOIN products p  ON p.id  = bi.product_id
JOIN branches b  ON b.id  = bi.branch_id
LEFT JOIN inventory_movements im
    ON im.product_id = bi.product_id
   AND im.branch_id  = bi.branch_id
   AND (im.variant_id = bi.variant_id OR (im.variant_id IS NULL AND bi.variant_id IS NULL))
GROUP BY b.name, p.code, p.name, bi.quantity_on_hand
ORDER BY b.name, p.code;
