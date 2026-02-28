-- ============================================================================
-- ADD PRODUCT SELLING UNITS FOR MULTI-UNIT SELLING
-- ============================================================================
-- Allows products to be sold in multiple units with different prices
-- Example: Sand can be sold in cubic meters OR sacks, each with different price
--
-- Use Case:
--   Purchase: 10 cubic meters @ ₱500/m³
--   Sell: 
--     - ₱500/m³ (cubic meter)
--     - ₱30/sack (20 sacks per m³)
--   Inventory: Always tracked in base unit (cubic meters)
-- ============================================================================

-- Create product_selling_units table
CREATE TABLE IF NOT EXISTS public.product_selling_units (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  uom_id uuid NOT NULL,
  conversion_factor numeric(12, 4) NOT NULL DEFAULT 1,
  markup_percentage numeric(5, 2) NOT NULL DEFAULT 20,
  selling_price numeric(12, 2) NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT product_selling_units_pkey PRIMARY KEY (id),
  CONSTRAINT product_selling_units_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
  CONSTRAINT product_selling_units_uom_id_fkey FOREIGN KEY (uom_id) REFERENCES public.units_of_measure(id),
  CONSTRAINT product_selling_units_unique_product_uom UNIQUE (product_id, uom_id),
  CONSTRAINT product_selling_units_conversion_factor_check CHECK (conversion_factor > 0)
);

-- Add indexes for performance
CREATE INDEX idx_product_selling_units_product_id ON public.product_selling_units(product_id);
CREATE INDEX idx_product_selling_units_active ON public.product_selling_units(product_id, is_active);
CREATE INDEX idx_product_selling_units_primary ON public.product_selling_units(product_id, is_primary);

-- Add RLS policies
ALTER TABLE public.product_selling_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view selling units"
  ON public.product_selling_units
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert selling units"
  ON public.product_selling_units
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update selling units"
  ON public.product_selling_units
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete selling units"
  ON public.product_selling_units
  FOR DELETE
  TO authenticated
  USING (true);

-- Add comments
COMMENT ON TABLE public.product_selling_units IS 'Stores multiple selling units for products with different pricing for each unit';
COMMENT ON COLUMN public.product_selling_units.conversion_factor IS 'How many of this unit equals 1 base unit. Example: 1 m³ = 20 sacks, factor = 0.05 (1 sack = 0.05 m³)';
COMMENT ON COLUMN public.product_selling_units.is_primary IS 'If true, this is the default/primary selling unit shown in POS';
COMMENT ON COLUMN public.product_selling_units.selling_price IS 'Selling price for this specific unit';

-- Migrate existing products to have their current selling unit as a selling unit entry
-- This ensures backward compatibility
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
  id as product_id,
  selling_uom_id as uom_id,
  CASE 
    WHEN base_uom_id = selling_uom_id THEN 1
    ELSE 1 / conversion_factor  -- Invert because we need "per selling unit to base unit"
  END as conversion_factor,
  markup_percentage,
  current_selling_price as selling_price,
  true as is_primary,  -- Existing selling unit becomes primary
  true as is_active
FROM public.products
WHERE is_active = true
ON CONFLICT (product_id, uom_id) DO NOTHING;

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_product_selling_units_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_selling_units_updated_at
  BEFORE UPDATE ON public.product_selling_units
  FOR EACH ROW
  EXECUTE FUNCTION update_product_selling_units_updated_at();

-- Ensure only one primary selling unit per product
CREATE OR REPLACE FUNCTION ensure_single_primary_selling_unit()
RETURNS TRIGGER AS $$
BEGIN
  -- If setting this as primary, unset all others for this product
  IF NEW.is_primary = true THEN
    UPDATE public.product_selling_units
    SET is_primary = false
    WHERE product_id = NEW.product_id
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_single_primary_selling_unit_trigger
  BEFORE INSERT OR UPDATE ON public.product_selling_units
  FOR EACH ROW
  WHEN (NEW.is_primary = true)
  EXECUTE FUNCTION ensure_single_primary_selling_unit();
