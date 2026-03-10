-- Diagnostic: Find problematic product_selling_units records
-- These are records where base_uom = selling_uom but conversion_factor != 1

SELECT 
  psu.id,
  p.code as product_code,
  p.name as product_name,
  bu.code as base_uom,
  su.code as selling_unit_uom,
  psu.conversion_factor,
  psu.selling_price,
  psu.markup_percentage,
  psu.is_primary,
  psu.is_active,
  -- This is the problem: unit is same as base, but has conversion_factor
  CASE 
    WHEN psu.uom_id = p.base_uom_id AND psu.conversion_factor != 1 
    THEN '⚠️ PROBLEMATIC - Same unit with conversion factor'
    WHEN psu.uom_id != p.base_uom_id AND psu.conversion_factor = 1
    THEN '⚠️ WARNING - Different unit but conversion = 1'
    ELSE '✓ OK'
  END as status
FROM product_selling_units psu
JOIN products p ON psu.product_id = p.id
LEFT JOIN units_of_measure bu ON p.base_uom_id = bu.id
LEFT JOIN units_of_measure su ON psu.uom_id = su.id
WHERE psu.is_active = true
ORDER BY 
  CASE 
    WHEN psu.uom_id = p.base_uom_id AND psu.conversion_factor != 1 THEN 1
    WHEN psu.uom_id != p.base_uom_id AND psu.conversion_factor = 1 THEN 2
    ELSE 3
  END,
  p.name;
