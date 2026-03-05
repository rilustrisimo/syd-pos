-- ============================================================================
-- FIX INVENTORY DISCREPANCIES FROM INCORRECT MULTI-UNIT CALCULATIONS
-- ============================================================================
-- This script recalculates inventory from scratch by:
-- 1. Summing all purchases (converted to base units)
-- 2. Summing all sales (converted to base units, excluding deleted)
-- 3. Summing all returns (converted to base units, excluding deleted, respecting should_restock flag)
-- 4. Summing all manual adjustments (from inventory_movements)
-- 5. Setting inventory = purchases - sales + returns + adjustments
--
-- The bug: When buying/selling in non-base units (e.g., PC instead of BOX),
-- the system was adding/deducting the quantity as-is instead of converting.
-- Example: Buying 4 PC was adding 4 BOX (should be 4÷44 = 0.09 BOX)
--
-- APPROACH: Recalculate inventory from source transactions and adjustments
-- NOTE: This migration should be run AFTER migrations 00027-00030 are deployed
-- ============================================================================

-- STEP 1: Create a temporary table to hold recalculated inventories
CREATE TEMP TABLE temp_recalculated_inventory AS
WITH all_purchases AS (
    -- Sum all purchases in base units per product/branch
    SELECT 
        po.branch_id,
        pol.product_id,
        pol.variant_id,
        SUM(
            CASE 
                -- Already in base unit
                WHEN pol.uom_id = p.base_uom_id THEN pol.quantity_received
                -- In product's main selling unit (CHECK THIS BEFORE product_selling_units!)
                WHEN pol.uom_id = p.selling_uom_id AND p.conversion_factor > 0
                    THEN pol.quantity_received / p.conversion_factor
                -- Check additional selling units from product_selling_units table
                WHEN psu.conversion_factor IS NOT NULL AND psu.conversion_factor > 0
                    THEN pol.quantity_received / psu.conversion_factor
                -- Default 1:1 (should rarely happen)
                ELSE pol.quantity_received
            END
        ) as total_purchased
    FROM purchase_order_lines pol
    JOIN purchase_orders po ON po.id = pol.po_id
    JOIN products p ON p.id = pol.product_id
    LEFT JOIN product_selling_units psu ON psu.product_id = pol.product_id 
        AND psu.uom_id = pol.uom_id 
        AND psu.is_active = true
    WHERE pol.quantity_received > 0
      AND po.is_deleted = false
    GROUP BY po.branch_id, pol.product_id, pol.variant_id
),
all_sales AS (
    -- Sum all sales in base units per product/branch (excluding deleted)
    SELECT 
        t.branch_id,
        tl.product_id,
        tl.variant_id,
        SUM(
            CASE 
                -- Already in base unit
                WHEN tl.uom_id = p.base_uom_id THEN tl.quantity
                -- In product's main selling unit (CHECK THIS BEFORE product_selling_units!)
                WHEN tl.uom_id = p.selling_uom_id AND p.conversion_factor > 0
                    THEN tl.quantity / p.conversion_factor
                -- Check additional selling units from product_selling_units table
                WHEN psu.conversion_factor IS NOT NULL AND psu.conversion_factor > 0
                    THEN tl.quantity / psu.conversion_factor
                -- Default 1:1 (should rarely happen)
                ELSE tl.quantity
            END
        ) as total_sold
    FROM transaction_lines tl
    JOIN transactions t ON t.id = tl.transaction_id
    JOIN products p ON p.id = tl.product_id
    LEFT JOIN product_selling_units psu ON psu.product_id = tl.product_id 
        AND psu.uom_id = tl.uom_id 
        AND psu.is_active = true
    WHERE t.is_deleted = false
      AND t.transaction_type = 'sale'
    GROUP BY t.branch_id, tl.product_id, tl.variant_id
),
all_returns AS (
    -- Sum all returns in base units per product/branch (excluding deleted)
    -- NOTE: Only count returns where should_restock is true (Migration 00029)
    -- Damaged/expired items have should_restock = false and should NOT be counted
    SELECT 
        t.branch_id,
        tl.product_id,
        tl.variant_id,
        SUM(
            CASE 
                -- Already in base unit
                WHEN tl.uom_id = p.base_uom_id THEN tl.quantity
                -- In product's main selling unit (CHECK THIS BEFORE product_selling_units!)
                WHEN tl.uom_id = p.selling_uom_id AND p.conversion_factor > 0
                    THEN tl.quantity / p.conversion_factor
                -- Check additional selling units from product_selling_units table
                WHEN psu.conversion_factor IS NOT NULL AND psu.conversion_factor > 0
                    THEN tl.quantity / psu.conversion_factor
                -- Default 1:1 (should rarely happen)
                ELSE tl.quantity
            END
        ) as total_returned
    FROM transaction_lines tl
    JOIN transactions t ON t.id = tl.transaction_id
    JOIN products p ON p.id = tl.product_id
    LEFT JOIN product_selling_units psu ON psu.product_id = tl.product_id 
        AND psu.uom_id = tl.uom_id 
        AND psu.is_active = true
    WHERE t.is_deleted = false
      AND t.transaction_type = 'return'
      AND COALESCE(tl.should_restock, true) = true  -- Only count items that were restocked
    GROUP BY t.branch_id, tl.product_id, tl.variant_id
),
all_adjustments AS (
    -- Sum ONLY real physical manual adjustments from inventory_movements
    -- These are created by adjust_inventory_atomic() RPC (Migration 00028)
    --
    -- IMPORTANT: Only include reference_type = 'manual_adjustment'
    --   - 'system_reconciliation': corrections for PO double-counting — EXCLUDE because
    --     all_purchases already recalculates from PO source lines (not from movements)
    --   - 'transaction_reversal': reverses deductions for deleted sales — EXCLUDE because
    --     all_sales already filters out is_deleted=true transactions
    --   - 'inventory_correction': previous runs of this script — EXCLUDE to prevent loop
    --   - 'manual_adjustment': real physical count corrections — INCLUDE
    SELECT
        branch_id,
        product_id,
        variant_id,
        SUM(quantity_change) as total_adjustments
    FROM inventory_movements
    WHERE reference_type = 'manual_adjustment'
    GROUP BY branch_id, product_id, variant_id
),
combined AS (
    -- Combine all sources
    SELECT branch_id, product_id, variant_id, total_purchased as qty FROM all_purchases
    UNION ALL
    SELECT branch_id, product_id, variant_id, -total_sold as qty FROM all_sales
    UNION ALL
    SELECT branch_id, product_id, variant_id, total_returned as qty FROM all_returns
    UNION ALL
    SELECT branch_id, product_id, variant_id, total_adjustments as qty FROM all_adjustments
)
SELECT 
    branch_id,
    product_id,
    variant_id,
    COALESCE(SUM(qty), 0) as should_be_quantity
FROM combined
GROUP BY branch_id, product_id, variant_id;

-- STEP 2: Show discrepancies before applying fix (ALL products with discrepancies)
SELECT 
    p.code,
    p.name,
    b.name as branch,
    base_uom.code as unit,
    bi.quantity_on_hand as current_qty,
    COALESCE(tri.should_be_quantity, 0) as correct_qty,
    COALESCE(tri.should_be_quantity, 0) - bi.quantity_on_hand as adjustment_needed
FROM branch_inventory bi
JOIN products p ON p.id = bi.product_id
JOIN branches b ON b.id = bi.branch_id
JOIN units_of_measure base_uom ON base_uom.id = p.base_uom_id
LEFT JOIN temp_recalculated_inventory tri ON tri.branch_id = bi.branch_id 
    AND tri.product_id = bi.product_id
    AND (tri.variant_id = bi.variant_id OR (tri.variant_id IS NULL AND bi.variant_id IS NULL))
WHERE ABS(COALESCE(tri.should_be_quantity, 0) - bi.quantity_on_hand) > 0.01
ORDER BY ABS(COALESCE(tri.should_be_quantity, 0) - bi.quantity_on_hand) DESC, p.name, b.name;

-- STEP 3: Apply corrections (UNCOMMENT TO RUN)
/*
DO $$
DECLARE
    correction_rec RECORD;
    correction_count INTEGER := 0;
    current_qty DECIMAL(12, 4);
    correct_qty DECIMAL(12, 4);
    inv_id UUID;
    system_user_id UUID;
BEGIN
    RAISE NOTICE 'Starting inventory corrections...';
    
    -- Get a system user ID (first admin user)
    SELECT id INTO system_user_id
    FROM users
    WHERE role = 'admin'
    ORDER BY created_at
    LIMIT 1;
    
    IF system_user_id IS NULL THEN
        RAISE EXCEPTION 'No admin user found. Cannot proceed with inventory correction.';
    END IF;
    
    FOR correction_rec IN
        SELECT 
            bi.id as inventory_id,
            bi.branch_id,
            bi.product_id,
            bi.variant_id,
            bi.quantity_on_hand as current_quantity,
            COALESCE(tri.should_be_quantity, 0) as should_be_quantity,
            p.code,
            p.name,
            b.name as branch_name
        FROM branch_inventory bi
        JOIN products p ON p.id = bi.product_id
        JOIN branches b ON b.id = bi.branch_id
        LEFT JOIN temp_recalculated_inventory tri ON tri.branch_id = bi.branch_id 
            AND tri.product_id = bi.product_id
            AND (tri.variant_id = bi.variant_id OR (tri.variant_id IS NULL AND bi.variant_id IS NULL))
        WHERE ABS(COALESCE(tri.should_be_quantity, 0) - bi.quantity_on_hand) > 0.01
    LOOP
        current_qty := correction_rec.current_quantity;
        -- Floor negative values to 0: physically impossible to have negative stock.
        -- Negative correct_qty means sold more than received — likely a missing PO.
        -- Set to 0 for now; investigate missing POs separately.
        correct_qty := GREATEST(0, correction_rec.should_be_quantity);
        inv_id := correction_rec.inventory_id;

        -- Skip if flooring to 0 makes the adjustment negligible
        IF ABS(correct_qty - current_qty) <= 0.01 THEN
            CONTINUE;
        END IF;

        -- Update inventory to correct value
        UPDATE branch_inventory
        SET quantity_on_hand = correct_qty,
            last_movement_at = NOW()
        WHERE id = inv_id;

        -- Record the correction movement
        INSERT INTO inventory_movements (
            branch_id, product_id, variant_id, movement_type,
            quantity_change, quantity_before, quantity_after,
            reference_type, created_by, notes
        ) VALUES (
            correction_rec.branch_id,
            correction_rec.product_id,
            correction_rec.variant_id,
            'adjustment',
            correct_qty - current_qty,
            current_qty,
            correct_qty,
            'inventory_correction',
            system_user_id,
            'Recalculated inventory from purchases/sales/returns/adjustments for ' || correction_rec.name ||
            ' at ' || correction_rec.branch_name ||
            '. Adjusted from ' || ROUND(current_qty, 4) || ' to ' || ROUND(correct_qty, 4) ||
            CASE WHEN correction_rec.should_be_quantity < 0
                 THEN ' (floored from ' || ROUND(correction_rec.should_be_quantity, 4) || ' — investigate missing POs)'
                 ELSE '' END
        );
        
        correction_count := correction_count + 1;
        RAISE NOTICE 'Corrected % at %: % → %', 
            correction_rec.name, 
            correction_rec.branch_name,
            ROUND(current_qty, 4),
            ROUND(correct_qty, 4);
    END LOOP;
    
    RAISE NOTICE 'Correction complete. Total products corrected: %', correction_count;
END $$;
*/

-- STEP 4: Verify corrections (run after uncommenting STEP 3)
/*
SELECT 
    p.code,
    p.name,
    b.name as branch,
    im.quantity_before as old_qty,
    im.quantity_after as new_qty,
    im.quantity_change as adjustment,
    im.created_at
FROM inventory_movements im
JOIN products p ON p.id = im.product_id
JOIN branches b ON b.id = im.branch_id
WHERE im.reference_type = 'inventory_correction'
  AND im.notes LIKE 'Recalculated inventory%'
  AND im.created_at > NOW() - INTERVAL '5 minutes'
ORDER BY im.created_at DESC;
*/
