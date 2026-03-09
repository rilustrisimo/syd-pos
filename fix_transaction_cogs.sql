-- Fix incorrect COGS in transaction_lines where products have conversion_factor
-- but base_uom_id = selling_uom_id (same unit, should not divide)

-- This fixes the issue where COGS was incorrectly multiplied by conversion_factor
-- when it shouldn't have been, causing inflated COGS values like 910 instead of 45.5

-- Step 1: Show what will be fixed
SELECT 
  COUNT(*) as total_lines_to_fix,
  COUNT(DISTINCT tl.transaction_id) as affected_transactions,
  COUNT(DISTINCT tl.product_id) as affected_products,
  SUM(tl.line_profit) as current_total_profit,
  SUM((tl.unit_price - p.latest_cogs) * tl.quantity) as corrected_total_profit,
  SUM((tl.unit_price - p.latest_cogs) * tl.quantity) - SUM(tl.line_profit) as profit_correction
FROM transaction_lines tl
JOIN products p ON tl.product_id = p.id
WHERE p.base_uom_id = p.selling_uom_id 
  AND p.conversion_factor != 1
  AND ABS(tl.cogs_per_unit - (p.latest_cogs * p.conversion_factor)) < 0.01;

-- Step 2: Show sample records that will be fixed
SELECT 
  t.transaction_number,
  t.transaction_date,
  p.code as product_code,
  p.name as product_name,
  tl.quantity,
  tl.unit_price,
  tl.cogs_per_unit as current_cogs,
  p.latest_cogs as correct_cogs,
  tl.line_profit as current_profit,
  (tl.unit_price - p.latest_cogs) * tl.quantity as correct_profit,
  p.conversion_factor
FROM transaction_lines tl
JOIN transactions t ON tl.transaction_id = t.id
JOIN products p ON tl.product_id = p.id
WHERE p.base_uom_id = p.selling_uom_id 
  AND p.conversion_factor != 1
  AND ABS(tl.cogs_per_unit - (p.latest_cogs * p.conversion_factor)) < 0.01
ORDER BY t.transaction_date DESC
LIMIT 20;

-- Step 3: Execute the fix (line_profit will auto-recalculate as it's a generated column)
WITH product_info AS (
  SELECT 
    p.id as product_id,
    p.latest_cogs,
    p.base_uom_id,
    p.selling_uom_id,
    p.conversion_factor
  FROM products p
  WHERE p.base_uom_id = p.selling_uom_id 
    AND p.conversion_factor != 1
)
UPDATE transaction_lines tl
SET cogs_per_unit = pi.latest_cogs
FROM product_info pi
WHERE tl.product_id = pi.product_id
  AND ABS(tl.cogs_per_unit - (pi.latest_cogs * pi.conversion_factor)) < 0.01;

-- Step 4: Verify the fix
SELECT 
  'Fixed ' || COUNT(*) || ' transaction lines' as summary,
  'Affected ' || COUNT(DISTINCT tl.transaction_id) || ' transactions' as transactions_fixed,
  'For ' || COUNT(DISTINCT tl.product_id) || ' products' as products_fixed
FROM transaction_lines tl
JOIN products p ON tl.product_id = p.id
WHERE p.base_uom_id = p.selling_uom_id 
  AND p.conversion_factor != 1
  AND tl.cogs_per_unit = p.latest_cogs;

