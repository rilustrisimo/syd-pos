-- ============================================================================
-- Migration 00051: Sync primary PSU selling_price with products.current_selling_price
-- ============================================================================
-- PROBLEM:
--   When a product's selling price is edited in the UI (or via PO receive),
--   products.current_selling_price is updated but the matching row in
--   product_selling_units (is_primary = true) keeps its old selling_price.
--   The POS reads price from product_selling_units, so the cart shows stale prices.
--
-- FIX:
--   1. Trigger: AFTER UPDATE on products → sync primary PSU selling_price + markup
--   2. Trigger: AFTER INSERT on products → auto-create the primary PSU row
--   3. Backfill: update all existing out-of-sync primary PSU rows
-- ============================================================================

-- ── Drop if re-running ────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_sync_primary_psu_selling_price ON products;
DROP TRIGGER IF EXISTS trg_create_primary_psu_on_product_insert ON products;
DROP FUNCTION IF EXISTS sync_primary_psu_selling_price();
DROP FUNCTION IF EXISTS create_primary_psu_on_product_insert();


-- ── Trigger 1: AFTER UPDATE on products ──────────────────────────────────────
-- When current_selling_price or markup_percentage changes on the product,
-- propagate both values to the primary PSU row.

CREATE OR REPLACE FUNCTION sync_primary_psu_selling_price()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.current_selling_price IS DISTINCT FROM OLD.current_selling_price
     OR NEW.markup_percentage IS DISTINCT FROM OLD.markup_percentage
  THEN
    UPDATE product_selling_units
    SET selling_price     = NEW.current_selling_price,
        markup_percentage = NEW.markup_percentage,
        updated_at        = NOW()
    WHERE product_id = NEW.id
      AND is_primary = true
      AND is_active  = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_primary_psu_selling_price
  AFTER UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION sync_primary_psu_selling_price();


-- ── Trigger 2: AFTER INSERT on products ──────────────────────────────────────
-- Every new product automatically gets its primary PSU row so there is
-- never a gap between product creation and MSU existence.

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
    1,
    COALESCE(NEW.markup_percentage, 0),
    COALESCE(NEW.current_selling_price, 0),
    true,
    true
  )
  ON CONFLICT (product_id, uom_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_primary_psu_on_product_insert
  AFTER INSERT ON products
  FOR EACH ROW
  EXECUTE FUNCTION create_primary_psu_on_product_insert();


-- ── Backfill: sync all existing out-of-sync primary PSU rows ─────────────────
-- This fixes the 7 products (and any others) identified by the diagnostic query.

UPDATE product_selling_units psu
SET selling_price     = p.current_selling_price,
    markup_percentage = p.markup_percentage,
    updated_at        = NOW()
FROM products p
WHERE psu.product_id = p.id
  AND psu.is_primary = true
  AND psu.is_active  = true
  AND p.is_active    = true
  AND (
    psu.selling_price     IS DISTINCT FROM p.current_selling_price
    OR psu.markup_percentage IS DISTINCT FROM p.markup_percentage
  );
