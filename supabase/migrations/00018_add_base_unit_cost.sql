-- Add base_unit_cost column to products table
-- This stores the cost per base unit (e.g., cost per box)
-- while latest_cogs is the cost per selling unit (e.g., cost per kg)
-- 
-- PREREQUISITE: This migration requires conversion_factor column to exist
-- If you get an error, please run migration 00015_add_unit_conversion_factor.sql first

ALTER TABLE products
ADD COLUMN IF NOT EXISTS base_unit_cost DECIMAL(12, 4) NOT NULL DEFAULT 0;

-- Backfill existing products: set base_unit_cost = latest_cogs * conversion_factor
-- This assumes existing products have latest_cogs as the selling unit cost
-- Skip this if conversion_factor doesn't exist yet
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'conversion_factor'
    ) THEN
        UPDATE products
        SET base_unit_cost = latest_cogs * conversion_factor
        WHERE base_unit_cost = 0;
    END IF;
END $$;

-- Add comment for clarity
COMMENT ON COLUMN products.base_unit_cost IS 'Cost per base unit (e.g., per box). latest_cogs = base_unit_cost / conversion_factor';
COMMENT ON COLUMN products.latest_cogs IS 'Cost per selling unit (e.g., per kg), calculated from base_unit_cost / conversion_factor';
