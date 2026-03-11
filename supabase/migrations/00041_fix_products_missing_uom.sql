-- Migration: Fix products with missing UOM
-- This ensures all products have valid base_uom_id and selling_uom_id

-- First, let's check if we have a default "pieces" UOM
DO $$
DECLARE
  default_uom_id UUID;
BEGIN
  -- Get or create a default UOM (pieces)
  SELECT id INTO default_uom_id
  FROM units_of_measure
  WHERE code = 'PC'
  LIMIT 1;

  -- If pieces doesn't exist, use the first available UOM
  IF default_uom_id IS NULL THEN
    SELECT id INTO default_uom_id
    FROM units_of_measure
    ORDER BY name
    LIMIT 1;
  END IF;

  -- Log products with missing base_uom_id before fixing
  RAISE NOTICE 'Products missing base_uom_id: %', (
    SELECT COUNT(*) FROM products WHERE base_uom_id IS NULL
  );

  -- Log products with missing selling_uom_id before fixing
  RAISE NOTICE 'Products missing selling_uom_id: %', (
    SELECT COUNT(*) FROM products WHERE selling_uom_id IS NULL
  );

  -- Fix products missing base_uom_id
  IF default_uom_id IS NOT NULL THEN
    UPDATE products
    SET base_uom_id = default_uom_id,
        updated_at = NOW()
    WHERE base_uom_id IS NULL;

    RAISE NOTICE 'Updated % products with missing base_uom_id', 
      (SELECT changes() FROM pg_stat_all_tables WHERE schemaname = 'public' LIMIT 1);

    -- Fix products missing selling_uom_id
    UPDATE products
    SET selling_uom_id = default_uom_id,
        updated_at = NOW()
    WHERE selling_uom_id IS NULL;

    RAISE NOTICE 'Updated % products with missing selling_uom_id', 
      (SELECT changes() FROM pg_stat_all_tables WHERE schemaname = 'public' LIMIT 1);
  ELSE
    RAISE WARNING 'No default UOM found. Please create a UOM before running this migration.';
  END IF;
END $$;

-- Add a constraint to prevent future NULL values in base_uom_id
-- Note: This is commented out because the column is already NOT NULL in the schema
-- If it's not enforced, uncomment these lines:
-- ALTER TABLE products 
--   ALTER COLUMN base_uom_id SET NOT NULL;
--   
-- ALTER TABLE products 
--   ALTER COLUMN selling_uom_id SET NOT NULL;

-- Verify the fix
DO $$
BEGIN
  RAISE NOTICE 'Verification - Products with NULL base_uom_id: %', (
    SELECT COUNT(*) FROM products WHERE base_uom_id IS NULL
  );
  
  RAISE NOTICE 'Verification - Products with NULL selling_uom_id: %', (
    SELECT COUNT(*) FROM products WHERE selling_uom_id IS NULL
  );
END $$;
