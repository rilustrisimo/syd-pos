-- ============================================================================
-- ENSURE PRIMARY SELLING UNITS EXIST FOR ALL PRODUCTS
-- ============================================================================
-- This migration ensures that every product has its primary selling unit
-- (selling_uom_id) represented in the product_selling_units table.
-- If it already exists, skip. If not, add it.
-- ============================================================================

-- Insert primary selling unit for products that don't have it yet
INSERT INTO public.product_selling_units (
  product_id,
  uom_id,
  conversion_factor,
  markup_percentage,
  selling_price,
  is_primary,
  is_active
)
SELECT 
  p.id as product_id,
  p.selling_uom_id as uom_id,
  CASE 
    -- If base and selling units are the same, factor is 1
    WHEN p.base_uom_id = p.selling_uom_id THEN 1
    -- Otherwise, calculate based on conversion_factor
    -- conversion_factor represents: 1 base unit = X selling units
    -- So selling unit to base unit = 1 / conversion_factor
    ELSE COALESCE(1.0 / NULLIF(p.conversion_factor, 0), 1)
  END as conversion_factor,
  COALESCE(p.markup_percentage, 20) as markup_percentage,
  COALESCE(p.current_selling_price, 0) as selling_price,
  true as is_primary,  -- This is the product's primary selling unit
  true as is_active
FROM public.products p
WHERE NOT EXISTS (
  -- Only insert if this selling unit doesn't already exist for the product
  SELECT 1 
  FROM public.product_selling_units psu 
  WHERE psu.product_id = p.id 
  AND psu.uom_id = p.selling_uom_id
)
ON CONFLICT (product_id, uom_id) DO NOTHING;

-- Update existing primary selling units to ensure they're marked as primary
-- This handles cases where the selling unit exists but isn't marked as primary
UPDATE public.product_selling_units psu
SET is_primary = true
FROM public.products p
WHERE psu.product_id = p.id
  AND psu.uom_id = p.selling_uom_id
  AND psu.is_primary = false;

-- Log the results
DO $$
DECLARE
  inserted_count INTEGER;
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO inserted_count
  FROM public.products p
  WHERE NOT EXISTS (
    SELECT 1 
    FROM public.product_selling_units psu 
    WHERE psu.product_id = p.id 
    AND psu.uom_id = p.selling_uom_id
  );
  
  RAISE NOTICE 'Migration complete: Ensured primary selling units exist for all products';
END $$;
