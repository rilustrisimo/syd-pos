-- ============================================================================
-- Migration 00036: Auto-recalculate markup_percentage on products + PSU
-- ============================================================================
-- PROBLEM:
--   1. When a PO is received, the `on_po_line_received` trigger updates
--      `products.latest_cogs` — but `markup_percentage` is never recalculated.
--   2. When a product is saved via the UI, the form sends the correct values,
--      but there is no DB-level enforcement if values drift or are edited
--      directly (e.g. via Supabase admin, scripts, or mobile app).
--   3. When product_selling_units.selling_price is updated, its
--      markup_percentage stays stale.
--
-- FIX — Three triggers:
--   1. products BEFORE UPDATE → recalculate markup_percentage when
--      latest_cogs or current_selling_price changes
--   2. products AFTER UPDATE → when latest_cogs changes, propagate
--      recalculated markup to all related product_selling_units rows
--   3. product_selling_units BEFORE INSERT/UPDATE → recalculate
--      markup_percentage when selling_price changes
-- ============================================================================


-- ── Drop existing triggers/functions if they exist (safe re-run) ─────────────
DROP TRIGGER IF EXISTS trg_recalculate_product_markup ON products;
DROP TRIGGER IF EXISTS trg_sync_psu_markup_on_cogs_change ON products;
DROP TRIGGER IF EXISTS trg_recalculate_psu_markup ON product_selling_units;
DROP FUNCTION IF EXISTS recalculate_product_markup();
DROP FUNCTION IF EXISTS sync_psu_markup_on_cogs_change();
DROP FUNCTION IF EXISTS recalculate_psu_markup();


-- ── Trigger 1: products BEFORE UPDATE ────────────────────────────────────────
-- Recalculates products.markup_percentage whenever latest_cogs or
-- current_selling_price changes. Fires BEFORE the row is written so it
-- modifies NEW in place (no second round-trip, no recursion risk).

CREATE OR REPLACE FUNCTION recalculate_product_markup()
RETURNS TRIGGER AS $$
BEGIN
    -- Only recalculate when relevant columns actually change
    IF (
        NEW.latest_cogs IS DISTINCT FROM OLD.latest_cogs
        OR NEW.current_selling_price IS DISTINCT FROM OLD.current_selling_price
    )
    AND NEW.latest_cogs > 0
    AND NEW.current_selling_price > 0
    THEN
        NEW.markup_percentage := ROUND(
            (NEW.current_selling_price / NEW.latest_cogs - 1) * 100
        , 2);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recalculate_product_markup
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION recalculate_product_markup();


-- ── Trigger 2: products AFTER UPDATE → propagate to PSU rows ─────────────────
-- When latest_cogs changes, all PSU markup_percentage values become stale.
-- This trigger recalculates them for every active PSU linked to the product.
--
-- Effective COGS per PSU:
--   • Primary / standard UOM (psu.uom_id = selling_uom_id): latest_cogs
--   • Alternate unit (e.g. sack, bundle):  latest_cogs / psu.conversion_factor

CREATE OR REPLACE FUNCTION sync_psu_markup_on_cogs_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only fire when latest_cogs actually changed
    IF NEW.latest_cogs IS DISTINCT FROM OLD.latest_cogs
       AND NEW.latest_cogs > 0
    THEN
        UPDATE product_selling_units psu
        SET
            markup_percentage = ROUND(
                (psu.selling_price / NULLIF(
                    CASE
                        WHEN psu.uom_id = NEW.selling_uom_id
                        THEN NEW.latest_cogs
                        ELSE NEW.latest_cogs / NULLIF(psu.conversion_factor, 0)
                    END
                , 0) - 1) * 100
            , 2),
            updated_at = NOW()
        WHERE psu.product_id = NEW.id
          AND psu.selling_price > 0
          AND psu.is_active = true;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_psu_markup_on_cogs_change
    AFTER UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION sync_psu_markup_on_cogs_change();


-- ── Trigger 3: product_selling_units BEFORE INSERT/UPDATE ────────────────────
-- When a PSU row is inserted or its selling_price changes, recalculate
-- markup_percentage from the parent product's latest_cogs.

CREATE OR REPLACE FUNCTION recalculate_psu_markup()
RETURNS TRIGGER AS $$
DECLARE
    v_latest_cogs   DECIMAL(12, 4);
    v_selling_uom   UUID;
    v_effective_cogs DECIMAL(12, 4);
BEGIN
    -- Fire on INSERT or when selling_price actually changes
    IF TG_OP = 'INSERT'
       OR NEW.selling_price IS DISTINCT FROM OLD.selling_price
    THEN
        SELECT p.latest_cogs, p.selling_uom_id
        INTO v_latest_cogs, v_selling_uom
        FROM products p
        WHERE p.id = NEW.product_id;

        IF v_latest_cogs > 0 AND NEW.selling_price > 0 THEN
            IF NEW.uom_id = v_selling_uom THEN
                v_effective_cogs := v_latest_cogs;
            ELSE
                v_effective_cogs := v_latest_cogs / NULLIF(NEW.conversion_factor, 0);
            END IF;

            IF v_effective_cogs > 0 THEN
                NEW.markup_percentage := ROUND(
                    (NEW.selling_price / v_effective_cogs - 1) * 100
                , 2);
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recalculate_psu_markup
    BEFORE INSERT OR UPDATE ON product_selling_units
    FOR EACH ROW
    EXECUTE FUNCTION recalculate_psu_markup();


-- ── Comments ──────────────────────────────────────────────────────────────────
COMMENT ON FUNCTION recalculate_product_markup IS
    'BEFORE UPDATE on products: auto-recalculates markup_percentage when latest_cogs or current_selling_price changes.';

COMMENT ON FUNCTION sync_psu_markup_on_cogs_change IS
    'AFTER UPDATE on products: propagates recalculated markup to all active product_selling_units when latest_cogs changes.';

COMMENT ON FUNCTION recalculate_psu_markup IS
    'BEFORE INSERT/UPDATE on product_selling_units: auto-recalculates markup_percentage when selling_price changes.';
