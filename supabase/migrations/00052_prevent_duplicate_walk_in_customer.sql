-- ============================================================================
-- Migration 00052: Prevent duplicate Walk-in Customer records
-- ============================================================================
-- Root cause: 00008_create_customers.sql seeds Walk-in Customer with a plain
-- INSERT (no fixed ID, no ON CONFLICT), so every re-run or environment reset
-- creates a new row with a random UUID, polluting the customer dropdown.
--
-- Fix:
--   1. A BEFORE INSERT trigger that raises an error if anyone tries to insert
--      a customer named "Walk-in Customer" when one already exists.
--   2. The canonical Walk-in Customer ID is hardcoded in the POS; protect it.
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_duplicate_walk_in_customer()
RETURNS TRIGGER AS $$
BEGIN
  IF LOWER(TRIM(NEW.name)) = 'walk-in customer' THEN
    -- Allow if none exists yet (first-time seed)
    IF EXISTS (
      SELECT 1 FROM customers
      WHERE LOWER(TRIM(name)) = 'walk-in customer'
    ) THEN
      RAISE EXCEPTION 'A Walk-in Customer record already exists. Use the existing record (id: 446961e1-fcce-40bb-9f5a-3ea10cf976ea) instead of creating a new one.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_duplicate_walk_in_customer
  BEFORE INSERT ON customers
  FOR EACH ROW
  EXECUTE FUNCTION prevent_duplicate_walk_in_customer();
