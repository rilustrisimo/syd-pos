-- Fix product_selling_units records that have same UOM as base but conversion_factor != 1
-- This prevents the COGS bug from happening in the future

-- Step 1: Show what will be fixed
SELECT 
  COUNT(*) as total_records_to_fix,
  COUNT(DISTINCT psu.product_id) as affected_products,
  json_agg(DISTINCT p.name) as product_names
FROM product_selling_units psu
JOIN products p ON psu.product_id = p.id
WHERE psu.is_active = true
  AND psu.uom_id = p.base_uom_id
  AND psu.conversion_factor != 1;

-- Step 2: Show details of what will be fixed
SELECT 
  p.code,
  p.name,
  bu.code as base_uom,
  su.code as selling_unit_uom,
  psu.conversion_factor as current_factor,
  psu.selling_price,
  psu.is_primary
FROM product_selling_units psu
JOIN products p ON psu.product_id = p.id
LEFT JOIN units_of_measure bu ON p.base_uom_id = bu.id
LEFT JOIN units_of_measure su ON psu.uom_id = su.id
WHERE psu.is_active = true
  AND psu.uom_id = p.base_uom_id
  AND psu.conversion_factor != 1
ORDER BY p.name;

-- Step 3: Fix by setting conversion_factor = 1 for selling units that use the same UOM as base
UPDATE product_selling_units psu
SET 
  conversion_factor = 1,
  updated_at = NOW()
FROM products p
WHERE psu.product_id = p.id
  AND psu.is_active = true
  AND psu.uom_id = p.base_uom_id
  AND psu.conversion_factor != 1;

-- Step 4: Verify the fix
SELECT 
  'Fixed ' || COUNT(*) || ' selling unit records' as summary,
  'For ' || COUNT(DISTINCT psu.product_id) || ' products' as products_fixed
FROM product_selling_units psu
JOIN products p ON psu.product_id = p.id
WHERE psu.is_active = true
  AND psu.uom_id = p.base_uom_id
  AND psu.conversion_factor = 1;
