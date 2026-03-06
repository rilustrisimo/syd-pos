-- ============================================================================
-- DIAGNOSTIC + FIX: Common Nails PO Over-Entry Correction
-- ============================================================================
-- Problem: A PO line was entered as 20 boxes instead of 1 box (1 box = 20 kg)
-- This caused inventory to be inflated by ~19 boxes worth of quantity.
--
-- HOW TO USE:
--   1. Run STEP 1 (diagnostic) first — read the output carefully
--   2. Identify the bloated PO line ID and correct quantities from the output
--   3. Edit STEP 2 variables to match your findings
--   4. Run STEP 2 to apply the correction
--   5. Run STEP 3 to verify
-- ============================================================================

-- ============================================================================
-- STEP 1: DIAGNOSTIC — See current state of all Common Nails products
-- ============================================================================

-- 1a. Product info: base UOM and conversion factor
SELECT
    p.id            AS product_id,
    p.code,
    p.name,
    p.conversion_factor,
    base.code       AS base_uom_code,
    base.name       AS base_uom_name,
    selling.code    AS selling_uom_code,
    selling.name    AS selling_uom_name
FROM products p
LEFT JOIN units_of_measure base    ON base.id    = p.base_uom_id
LEFT JOIN units_of_measure selling ON selling.id = p.selling_uom_id
WHERE p.code ILIKE 'CN-%' OR p.name ILIKE '%common nail%'
ORDER BY p.code;

-- 1b. Current inventory per branch
SELECT
    p.code,
    p.name,
    b.name                          AS branch,
    bi.quantity_on_hand,
    uom.code                        AS base_uom,
    bi.last_movement_at
FROM branch_inventory bi
JOIN products p ON p.id = bi.product_id
JOIN branches b ON b.id = bi.branch_id
LEFT JOIN units_of_measure uom ON uom.id = p.base_uom_id
WHERE p.code ILIKE 'CN-%' OR p.name ILIKE '%common nail%'
ORDER BY p.code, b.name;

-- 1c. All PO lines for Common Nails — identify the bloated entry
SELECT
    pol.id                          AS po_line_id,
    po.po_number,
    po.po_date,
    po.status                       AS po_status,
    p.code                          AS product_code,
    p.name                          AS product_name,
    pol.quantity_ordered,
    pol.quantity_received,
    uom.code                        AS uom_code,
    uom.name                        AS uom_name,
    pol.unit_cost,
    b.name                          AS branch,
    s.name                          AS supplier
FROM purchase_order_lines pol
JOIN purchase_orders po  ON po.id  = pol.po_id
JOIN products p          ON p.id   = pol.product_id
LEFT JOIN units_of_measure uom ON uom.id = pol.uom_id
LEFT JOIN branches b     ON b.id  = po.branch_id
LEFT JOIN suppliers s    ON s.id  = po.supplier_id
WHERE (p.code ILIKE 'CN-%' OR p.name ILIKE '%common nail%')
  AND po.is_deleted = false
ORDER BY po.po_date DESC, p.code;

-- 1d. Inventory movements for Common Nails — see what was recorded
SELECT
    im.created_at,
    p.code                          AS product_code,
    b.name                          AS branch,
    im.movement_type,
    im.reference_type,
    im.quantity_change,
    im.quantity_before,
    im.quantity_after,
    im.notes
FROM inventory_movements im
JOIN products p ON p.id = im.product_id
LEFT JOIN branches b ON b.id = im.branch_id
WHERE p.code ILIKE 'CN-%' OR p.name ILIKE '%common nail%'
ORDER BY im.created_at DESC
LIMIT 50;


-- ============================================================================
-- STEP 2: CORRECTION
-- ============================================================================
-- EDIT THESE VARIABLES before running:
--   v_po_line_id       → the po_line_id from STEP 1c that was entered wrong
--   v_product_id       → product_id from STEP 1a
--   v_branch_id        → branch id where the inventory is inflated
--   v_correct_received → what quantity_received SHOULD have been (e.g. 1 box)
--   v_inflated_received→ what quantity_received WAS entered (e.g. 20 boxes)
--
-- The script will:
--   a) Correct the PO line quantity_received
--   b) Reduce branch_inventory by the excess
--   c) Record a manual_adjustment movement for the audit trail
-- ============================================================================

DO $$
DECLARE
    -- ── EDIT THESE ────────────────────────────────────────────────────────
    v_po_line_id        UUID    := 'PASTE_PO_LINE_ID_HERE';
    v_product_id        UUID    := 'PASTE_PRODUCT_ID_HERE';
    v_branch_id         UUID    := 'PASTE_BRANCH_ID_HERE';
    v_correct_received  DECIMAL := 1;      -- what it SHOULD have been
    v_inflated_received DECIMAL := 20;     -- what was WRONGLY entered
    -- ─────────────────────────────────────────────────────────────────────

    v_system_user_id UUID;
    v_current_qty    DECIMAL(12,4);
    v_excess_qty     DECIMAL(12,4);
    v_new_qty        DECIMAL(12,4);
    v_uom_id         UUID;
    v_conv_factor    DECIMAL(12,6);
    v_excess_base    DECIMAL(12,4);
    v_product_name   TEXT;
    v_po_number      TEXT;
BEGIN
    -- Safety: abort if placeholder IDs are still set
    IF v_po_line_id::TEXT = 'PASTE_PO_LINE_ID_HERE' THEN
        RAISE EXCEPTION 'Edit the variables in STEP 2 before running.';
    END IF;

    -- Get admin user for audit trail
    SELECT id INTO v_system_user_id
    FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1;

    IF v_system_user_id IS NULL THEN
        RAISE EXCEPTION 'No admin user found';
    END IF;

    -- Get product name
    SELECT name INTO v_product_name FROM products WHERE id = v_product_id;

    -- Get PO line info
    SELECT po.po_number, pol.uom_id
    INTO v_po_number, v_uom_id
    FROM purchase_order_lines pol
    JOIN purchase_orders po ON po.id = pol.po_id
    WHERE pol.id = v_po_line_id;

    -- Get conversion factor for the UOM used in the PO
    -- If base UOM was used, conversion = 1
    SELECT COALESCE(
        (SELECT psu.conversion_factor
         FROM product_selling_units psu
         WHERE psu.product_id = v_product_id
           AND psu.uom_id = v_uom_id
           AND psu.is_active = true
         LIMIT 1),
        (SELECT CASE WHEN p.selling_uom_id = v_uom_id THEN p.conversion_factor ELSE 1 END
         FROM products p WHERE p.id = v_product_id),
        1
    ) INTO v_conv_factor;

    -- How many base units were excess?
    -- Each "box" adds (1 / conversion_factor) base units per PO unit
    -- But PO quantities are stored in the PO's UOM, and inventory movements
    -- convert them when the PO is received. We need to figure out the base excess.
    v_excess_qty  := v_inflated_received - v_correct_received;
    -- Convert excess PO units to base units (same formula as receive_po_atomic)
    v_excess_base := v_excess_qty / v_conv_factor;

    -- Get current inventory
    SELECT quantity_on_hand INTO v_current_qty
    FROM branch_inventory
    WHERE product_id = v_product_id AND branch_id = v_branch_id;

    IF v_current_qty IS NULL THEN
        RAISE EXCEPTION 'No inventory record found for this product/branch combination';
    END IF;

    v_new_qty := GREATEST(0, v_current_qty - v_excess_base);

    RAISE NOTICE '== Common Nails PO Correction ==';
    RAISE NOTICE 'Product: % | PO: %', v_product_name, v_po_number;
    RAISE NOTICE 'Conversion factor: % (1 PO unit = % base units)', v_conv_factor, 1.0/v_conv_factor;
    RAISE NOTICE 'PO over-entry: % units (should be %)', v_inflated_received, v_correct_received;
    RAISE NOTICE 'Excess base units to remove: %', v_excess_base;
    RAISE NOTICE 'Inventory: % → %', v_current_qty, v_new_qty;

    -- 2a. Correct the PO line quantity_received
    UPDATE purchase_order_lines
    SET quantity_received = v_correct_received,
        updated_at        = NOW()
    WHERE id = v_po_line_id;

    RAISE NOTICE 'PO line quantity_received corrected to %', v_correct_received;

    -- 2b. Update branch inventory
    UPDATE branch_inventory
    SET quantity_on_hand  = v_new_qty,
        last_movement_at  = NOW()
    WHERE product_id = v_product_id
      AND branch_id  = v_branch_id;

    -- 2c. Record corrective movement for full audit trail
    INSERT INTO inventory_movements (
        branch_id, product_id, variant_id,
        movement_type, quantity_change,
        quantity_before, quantity_after,
        reference_type, reference_id,
        created_by, notes
    ) VALUES (
        v_branch_id, v_product_id, NULL,
        'adjustment', -v_excess_base,
        v_current_qty, v_new_qty,
        'manual_adjustment', v_po_line_id,
        v_system_user_id,
        'PO data-entry correction: PO ' || v_po_number ||
        ' was entered as ' || v_inflated_received ||
        ' units but should have been ' || v_correct_received ||
        ' unit(s). Removed ' || v_excess_base || ' excess base units.'
    );

    RAISE NOTICE 'Correction complete. Inventory movement recorded.';

    -- Optional: also correct the PO status if it was incorrectly marked
    -- (e.g., if it shows "received" but the corrected qty < quantity_ordered)
    UPDATE purchase_orders po
    SET status = CASE
        WHEN (
            SELECT SUM(pol2.quantity_received) >= SUM(pol2.quantity_ordered)
            FROM purchase_order_lines pol2
            WHERE pol2.po_id = po.id
        ) THEN 'received'
        WHEN (
            SELECT SUM(pol2.quantity_received) > 0
            FROM purchase_order_lines pol2
            WHERE pol2.po_id = po.id
        ) THEN 'partially_received'
        ELSE 'ordered'
    END
    WHERE po.id = (SELECT po_id FROM purchase_order_lines WHERE id = v_po_line_id);

END $$;


-- ============================================================================
-- STEP 3: VERIFY — Run after STEP 2 to confirm the correction
-- ============================================================================

-- Current inventory (should match expected physical count)
SELECT
    p.code, p.name,
    b.name AS branch,
    bi.quantity_on_hand,
    uom.code AS base_uom
FROM branch_inventory bi
JOIN products p ON p.id = bi.product_id
JOIN branches b ON b.id = bi.branch_id
LEFT JOIN units_of_measure uom ON uom.id = p.base_uom_id
WHERE p.code ILIKE 'CN-%' OR p.name ILIKE '%common nail%'
ORDER BY p.code, b.name;

-- Last 5 inventory movements (should show the correction at the top)
SELECT
    im.created_at,
    p.code, im.movement_type, im.reference_type,
    im.quantity_change, im.quantity_before, im.quantity_after,
    im.notes
FROM inventory_movements im
JOIN products p ON p.id = im.product_id
WHERE p.code ILIKE 'CN-%' OR p.name ILIKE '%common nail%'
ORDER BY im.created_at DESC
LIMIT 5;

-- Corrected PO line
SELECT
    pol.id AS po_line_id,
    po.po_number, po.status,
    p.code, pol.quantity_ordered, pol.quantity_received, uom.code AS uom
FROM purchase_order_lines pol
JOIN purchase_orders po ON po.id = pol.po_id
JOIN products p ON p.id = pol.product_id
LEFT JOIN units_of_measure uom ON uom.id = pol.uom_id
WHERE p.code ILIKE 'CN-%' OR p.name ILIKE '%common nail%'
ORDER BY po.po_date DESC;
