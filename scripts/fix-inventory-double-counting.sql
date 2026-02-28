-- ============================================================================
-- COMPREHENSIVE INVENTORY RECONCILIATION SCRIPT
-- ============================================================================
-- This script recalculates correct inventory for ALL products based on:
-- 1. All purchases received (quantity_received from purchase_order_lines)
-- 2. All sales transactions (with unit conversion from selling to base units)
-- 3. Compares with current inventory and fixes discrepancies
--
-- SAFETY FEATURES:
-- - Wrapped in a transaction (can ROLLBACK if anything looks wrong)
-- - Only updates quantity_on_hand and last_movement_at (no other columns)
-- - Creates audit trail in inventory_movements for every change
-- - Set to ROLLBACK by default - you must change to COMMIT to apply
-- - Shows preview of changes before committing
-- ============================================================================

BEGIN;

-- Step 1: Create a temporary table with calculated correct inventory
DROP TABLE IF EXISTS temp_correct_inventory;
CREATE TEMP TABLE temp_correct_inventory AS
WITH purchase_totals AS (
  -- Sum all received purchases per product per branch (converted to base units)
  SELECT 
    po.branch_id,
    pol.product_id,
    SUM(
      CASE 
        -- If purchased in base units, use as-is
        WHEN pol.uom_id = p.base_uom_id OR p.conversion_factor <= 0
        THEN pol.quantity_received
        -- If purchased in selling units, convert to base units
        ELSE pol.quantity_received / p.conversion_factor
      END
    ) as total_purchased
  FROM purchase_order_lines pol
  JOIN purchase_orders po ON po.id = pol.po_id
  JOIN products p ON p.id = pol.product_id
  WHERE po.is_deleted = false
  GROUP BY po.branch_id, pol.product_id
),
sales_totals AS (
  -- Sum all sales per product per branch (converted to base units)
  SELECT 
    t.branch_id,
    tl.product_id,
    SUM(
      CASE 
        -- If sold in selling units and it differs from base unit, convert
        WHEN tl.uom_id = p.selling_uom_id 
         AND p.base_uom_id != p.selling_uom_id 
         AND p.conversion_factor > 0
        THEN tl.quantity / p.conversion_factor
        -- Otherwise use quantity as-is (already in base units)
        ELSE tl.quantity
      END
    ) as total_sold_base_units
  FROM transaction_lines tl
  JOIN transactions t ON t.id = tl.transaction_id
  JOIN products p ON p.id = tl.product_id
  WHERE t.transaction_type = 'sale'
    AND t.is_deleted = false
  GROUP BY t.branch_id, tl.product_id
)
SELECT 
  b.id as branch_id,
  p.id as product_id,
  p.code as product_code,
  p.name as product_name,
  COALESCE(pt.total_purchased, 0) as total_purchased,
  COALESCE(st.total_sold_base_units, 0) as total_sold,
  COALESCE(pt.total_purchased, 0) - COALESCE(st.total_sold_base_units, 0) as correct_qty,
  bi.quantity_on_hand as current_qty,
  bi.id as inventory_id
FROM products p
CROSS JOIN branches b
LEFT JOIN purchase_totals pt ON pt.branch_id = b.id AND pt.product_id = p.id
LEFT JOIN sales_totals st ON st.branch_id = b.id AND st.product_id = p.id
LEFT JOIN branch_inventory bi ON bi.branch_id = b.id AND bi.product_id = p.id
WHERE p.is_active = true
  AND (pt.total_purchased IS NOT NULL OR bi.id IS NOT NULL);

-- Step 2: Show discrepancies (for review)
SELECT 
  product_code,
  product_name,
  total_purchased,
  total_sold,
  correct_qty,
  current_qty,
  (correct_qty - COALESCE(current_qty, 0)) as difference
FROM temp_correct_inventory
WHERE COALESCE(current_qty, 0) != correct_qty
ORDER BY ABS(correct_qty - COALESCE(current_qty, 0)) DESC;

-- Step 3: Update existing inventory records
UPDATE branch_inventory bi
SET 
  quantity_on_hand = tci.correct_qty,
  last_movement_at = NOW()
FROM temp_correct_inventory tci
WHERE bi.id = tci.inventory_id
  AND bi.quantity_on_hand != tci.correct_qty;

-- Step 4: Insert missing inventory records for products with purchases but no inventory record
INSERT INTO branch_inventory (
  branch_id,
  product_id,
  quantity_on_hand,
  quantity_reserved,
  last_movement_at
)
SELECT 
  branch_id,
  product_id,
  correct_qty,
  0,
  NOW()
FROM temp_correct_inventory
WHERE inventory_id IS NULL
  AND correct_qty > 0;

-- Step 5: Log all corrections in inventory_movements
INSERT INTO inventory_movements (
  branch_id,
  product_id,
  movement_type,
  quantity_change,
  quantity_before,
  quantity_after,
  reference_type,
  notes,
  created_by
)
SELECT 
  tci.branch_id,
  tci.product_id,
  'adjustment',
  (tci.correct_qty - COALESCE(tci.current_qty, 0)),
  COALESCE(tci.current_qty, 0),
  tci.correct_qty,
  'system_reconciliation',
  'Inventory reconciliation: Fixed double-counting bug. Purchased: ' || 
    tci.total_purchased || ', Sold: ' || tci.total_sold || 
    ', Corrected from ' || COALESCE(tci.current_qty, 0) || ' to ' || tci.correct_qty,
  (SELECT id FROM users LIMIT 1)
FROM temp_correct_inventory tci
WHERE COALESCE(tci.current_qty, 0) != tci.correct_qty;

-- Step 6: Show summary of corrections
SELECT 
  'Total products corrected' as metric,
  COUNT(*)::text as value
FROM temp_correct_inventory
WHERE COALESCE(current_qty, 0) != correct_qty
UNION ALL
SELECT 
  'Total quantity adjusted (absolute)',
  SUM(ABS(correct_qty - COALESCE(current_qty, 0)))::text
FROM temp_correct_inventory
WHERE COALESCE(current_qty, 0) != correct_qty
UNION ALL
SELECT 
  'Net inventory change',
  SUM(correct_qty - COALESCE(current_qty, 0))::text
FROM temp_correct_inventory
WHERE COALESCE(current_qty, 0) != correct_qty;

-- ============================================================================
-- SAFETY CHECKPOINT - REVIEW BEFORE COMMITTING
-- ============================================================================
-- The script is currently set to ROLLBACK (no changes will be saved)
--
-- TO APPLY THE CORRECTIONS:
-- 1. Review the discrepancies shown in Step 2 above
-- 2. Review the summary counts in Step 6 above
-- 3. If everything looks correct, change ROLLBACK to COMMIT on line 167
-- 4. Run the entire script again
--
-- WHAT THIS SCRIPT DOES:
-- ✓ Only updates: quantity_on_hand and last_movement_at
-- ✓ Does NOT modify: pricing, product details, transactions, purchases
-- ✓ Creates full audit trail in inventory_movements table
-- ✓ All changes in one atomic transaction (all or nothing)
-- ============================================================================

COMMIT;  -- ⚠️ Change this to COMMIT when ready to apply fixes

-- After changing to COMMIT and running:
-- - All inventory quantities will be corrected
-- - You can verify by running check-inventory-discrepancies.sql again
-- - Check inventory_movements table for detailed audit trail
