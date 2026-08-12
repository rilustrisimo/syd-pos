-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00071: Fix primary-PSU auto-creation trigger for differing UOMs
--
-- create_primary_psu_on_product_insert() (migration 00051) hardcoded
-- conversion_factor = 1 for every new product's auto-created primary
-- product_selling_units row, even when base_uom_id != selling_uom_id. That
-- produces a wrong conversion factor by default for any new bulk/multi-UOM
-- product (e.g. sand, cement, gravel) unless someone manually corrects it
-- via the product-selling-units UI. Use the product's own (correctly
-- entered, per the product form's convention) conversion_factor instead.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_primary_psu_on_product_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO product_selling_units (
    product_id,
    uom_id,
    conversion_factor,
    markup_percentage,
    selling_price,
    is_primary,
    is_active
  ) VALUES (
    NEW.id,
    NEW.selling_uom_id,
    CASE
      WHEN NEW.base_uom_id = NEW.selling_uom_id THEN 1
      ELSE COALESCE(NULLIF(NEW.conversion_factor, 0), 1)
    END,
    COALESCE(NEW.markup_percentage, 0),
    COALESCE(NEW.current_selling_price, 0),
    true,
    true
  )
  ON CONFLICT (product_id, uom_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
