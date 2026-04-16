-- ============================================================================
-- Migration 00053: Sync base_unit_cost when PO is received
-- ============================================================================
-- PROBLEM:
--   The `on_po_line_received` trigger (migration 00010) updates
--   `products.latest_cogs` when a PO line is received, but it never updates
--   `products.base_unit_cost`. The two fields then diverge:
--
--     base_unit_cost = old purchase cost  (stale)
--     latest_cogs    = new purchase cost  (current)
--
--   Because markup_percentage is recalculated from latest_cogs
--   (trigger 00036), the selling price stays accurate — but base_unit_cost
--   is wrong, making it look like the purchase cost didn't change.
--
-- FORMULA:
--   latest_cogs    = base_unit_cost / conversion_factor
--   base_unit_cost = latest_cogs    * conversion_factor
--   (when base UOM = selling UOM, conversion_factor = 1, so they're equal)
--
-- FIX — two steps:
--   1. One-time UPDATE to re-align all products where base_unit_cost ≠
--      latest_cogs * conversion_factor (i.e., fix existing drift).
--   2. Replace `update_product_pricing_on_receive` so it writes both
--      latest_cogs AND base_unit_cost on every future receive.
-- ============================================================================


-- ── Step 1: Fix existing discrepancies ───────────────────────────────────────
-- Formula: base_unit_cost = latest_cogs * conversion_factor
-- When conversion_factor is NULL or 0, treat it as 1.

UPDATE products
SET
    base_unit_cost = ROUND(
        latest_cogs * COALESCE(NULLIF(conversion_factor, 0), 1),
        4
    ),
    updated_at = NOW()
WHERE
    is_deleted = false
    AND latest_cogs > 0
    AND ABS(
        base_unit_cost
        - ROUND(latest_cogs * COALESCE(NULLIF(conversion_factor, 0), 1), 4)
    ) > 0.0001;


-- ── Step 2: Update the PO receive trigger to keep both fields in sync ─────────
-- The trigger fires AFTER UPDATE on purchase_order_lines when quantity_received
-- increases (i.e., a receive event happened).
-- NEW.unit_cost is the cost-per-selling-unit stored on the PO line.
-- base_unit_cost = unit_cost * conversion_factor

CREATE OR REPLACE FUNCTION update_product_pricing_on_receive()
RETURNS TRIGGER AS $$
BEGIN
    -- Only run when items are actually received (quantity increases)
    IF NEW.quantity_received > OLD.quantity_received THEN
        UPDATE products p
        SET
            latest_cogs   = NEW.unit_cost,
            base_unit_cost = ROUND(
                NEW.unit_cost * COALESCE(NULLIF(p.conversion_factor, 0), 1),
                4
            ),
            current_selling_price = NEW.unit_cost * (1 + p.markup_percentage / 100),
            updated_at    = NOW()
        WHERE p.id = NEW.product_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger is already defined in migration 00010 — no need to recreate,
-- just replacing the function it calls is sufficient.

COMMENT ON FUNCTION update_product_pricing_on_receive IS
    'AFTER UPDATE on purchase_order_lines: when quantity_received increases, '
    'updates products.latest_cogs, products.base_unit_cost '
    '(= latest_cogs * conversion_factor), and recalculates current_selling_price. '
    'Replaces the original 00010 version that only updated latest_cogs.';
