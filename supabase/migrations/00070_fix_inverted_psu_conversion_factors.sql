-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00070: Fix inverted product_selling_units.conversion_factor rows
--
-- Every consumer of product_selling_units.conversion_factor (receive-PO RPC,
-- sale RPC, ~15 other RPCs/triggers, and both product data-entry forms)
-- treats it as "how many selling units equal 1 base unit" and divides a
-- selling-unit quantity by it to get base units. Migration 00039's backfill
-- computed 1/products.conversion_factor instead, storing the reciprocal for
-- any product whose base_uom differs from its selling_uom. That produced 4
-- rows with the wrong convention (Screened Sand, Gravel 3/4", HOLCIM Cement,
-- Concrete Nails #4) — all currently at zero stock, so no historical
-- inventory movements are affected. This corrects the stored value before
-- any of them are purchased or sold.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE product_selling_units psu
SET conversion_factor = p.conversion_factor,
    updated_at        = NOW()
FROM products p
WHERE psu.product_id = p.id
  AND p.base_uom_id IS DISTINCT FROM p.selling_uom_id
  AND psu.conversion_factor <> p.conversion_factor
  AND ABS(psu.conversion_factor * p.conversion_factor - 1) < 0.01;
