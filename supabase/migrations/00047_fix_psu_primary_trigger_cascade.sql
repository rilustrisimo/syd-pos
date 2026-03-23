-- Fix: "tuple to be updated was already modified by an operation triggered by the current command"
--
-- Root cause:
--   When sync_psu_markup_on_cogs_change() does a bulk UPDATE on product_selling_units
--   (for all rows of a given product), the ensure_single_primary_selling_unit trigger fires
--   on each row and issues its own UPDATE on sibling rows that the outer bulk UPDATE
--   hasn't processed yet. PostgreSQL raises error 55P03 when it encounters those rows.
--
-- Fix:
--   Return early if is_primary is not changing, or if is_primary is NOT being set to true.
--   The trigger only needs to act when a row is actively being promoted to primary.
--   This is safe: demoting a row (is_primary = false) never needs to touch siblings.

CREATE OR REPLACE FUNCTION ensure_single_primary_selling_unit()
RETURNS TRIGGER AS $$
BEGIN
  -- Only act when is_primary is being explicitly set to TRUE and it was not already true
  IF NEW.is_primary IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Skip if the value isn't actually changing (avoids unnecessary sibling updates)
  IF TG_OP = 'UPDATE' AND OLD.is_primary = NEW.is_primary THEN
    RETURN NEW;
  END IF;

  -- Demote all other selling units for this product
  UPDATE public.product_selling_units
  SET is_primary = false
  WHERE product_id = NEW.product_id
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
