-- ============================================================================
-- IDENTIFY AND REVIEW INVENTORY DISCREPANCIES
-- ============================================================================
-- Run this query first to see which products may have inventory issues
-- This shows products with multi-unit selling units and their inventory movements
-- ============================================================================

-- Step 1: Identify products with multi-unit selling units
SELECT 
    p.id,
    p.code,
    p.name,
    base_uom.code as base_unit,
    psu.uom_id,
    sell_uom.code as selling_unit,
    psu.conversion_factor,
    psu.is_primary
FROM products p
JOIN product_selling_units psu ON psu.product_id = p.id
JOIN units_of_measure base_uom ON base_uom.id = p.base_uom_id
JOIN units_of_measure sell_uom ON sell_uom.id = psu.uom_id
WHERE psu.is_active = true
  AND psu.conversion_factor > 1  -- Only multi-unit products
  AND p.is_active = true
ORDER BY p.name;

-- Step 2: Show recent inventory movements for these products
-- Look for movements that might have used wrong calculations
SELECT 
    p.code,
    p.name,
    im.movement_type,
    im.quantity_change,
    im.quantity_before,
    im.quantity_after,
    im.created_at,
    im.notes,
    base_uom.code as base_unit
FROM inventory_movements im
JOIN products p ON p.id = im.product_id
JOIN units_of_measure base_uom ON base_uom.id = p.base_uom_id
WHERE im.product_id IN (
    -- Products with multi-unit selling units
    SELECT DISTINCT product_id 
    FROM product_selling_units 
    WHERE conversion_factor > 1 AND is_active = true
)
AND im.created_at >= '2026-02-01'  -- Adjust date range as needed
ORDER BY im.created_at DESC
LIMIT 100;

-- Step 3: Compare expected vs actual inventory for multi-unit products
-- This calculates what inventory SHOULD be based on corrected movements
WITH multi_unit_products AS (
    SELECT DISTINCT product_id
    FROM product_selling_units
    WHERE conversion_factor > 1 AND is_active = true
)
SELECT 
    p.code,
    p.name,
    b.name as branch,
    base_uom.code as unit,
    bi.quantity_on_hand as current_inventory,
    COALESCE(SUM(im.quantity_change), 0) as calculated_from_movements,
    bi.quantity_on_hand - COALESCE(SUM(im.quantity_change), 0) as discrepancy
FROM branch_inventory bi
JOIN products p ON p.id = bi.product_id
JOIN branches b ON b.id = bi.branch_id
JOIN units_of_measure base_uom ON base_uom.id = p.base_uom_id
LEFT JOIN inventory_movements im ON im.product_id = bi.product_id 
    AND im.branch_id = bi.branch_id
    AND (im.variant_id = bi.variant_id OR (im.variant_id IS NULL AND bi.variant_id IS NULL))
WHERE bi.product_id IN (SELECT product_id FROM multi_unit_products)
GROUP BY p.code, p.name, b.name, base_uom.code, bi.quantity_on_hand, bi.product_id, bi.branch_id
HAVING ABS(bi.quantity_on_hand - COALESCE(SUM(im.quantity_change), 0)) > 0.01
ORDER BY p.name, b.name;
