-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00062: Government Delivery Flow
--
-- Government sales are created WITHOUT moving inventory. Inventory only moves
-- when the sale is explicitly marked as "delivered" (via deliver_government_sale
-- RPC in migration 00063). This migration:
--   1. Adds is_delivered / delivered_at / delivered_by columns to transactions
--   2. Updates reverse_transaction_inventory() to skip undelivered government
--      sales (no inventory was moved → nothing to reverse on delete)
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Delivery tracking columns ─────────────────────────────────────────────

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_delivered BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_by UUID        REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN transactions.is_delivered IS
  'For government sales: TRUE once goods have been physically delivered to the agency. Inventory moves on delivery, not on sale creation.';

COMMENT ON COLUMN transactions.delivered_at IS
  'Timestamp when the government sale was marked as delivered.';

COMMENT ON COLUMN transactions.delivered_by IS
  'User who confirmed delivery of the government sale.';

-- ── 1b. Backfill: existing government sales (created before migration 00063
--        changed the RPC) already moved inventory via the old flow. Mark them
--        as delivered so the reversal trigger correctly undoes inventory if
--        they are ever soft-deleted.
UPDATE transactions
SET is_delivered = TRUE
WHERE is_government_sale = TRUE
  AND is_deleted         = FALSE;


-- ── 2. Update reverse_transaction_inventory() ─────────────────────────────────
-- Guard: an undelivered government sale had no inventory movement during
-- creation — skip reversal entirely when such a sale is soft-deleted.

CREATE OR REPLACE FUNCTION reverse_transaction_inventory()
RETURNS TRIGGER AS $$
DECLARE
    line                   RECORD;
    inv_id                 UUID;
    current_qty            DECIMAL(12, 4);
    base_unit_qty          DECIMAL(12, 4);
    p_base_uom             UUID;
    p_selling_uom          UUID;
    p_conversion_factor    DECIMAL(12, 4);
    unit_conversion_factor DECIMAL(12, 4);
BEGIN
    IF NEW.is_deleted = true AND OLD.is_deleted = false THEN

        -- Government sale that was never delivered: inventory was never moved,
        -- so there is nothing to reverse.
        IF COALESCE(NEW.is_government_sale, FALSE) = TRUE
           AND COALESCE(NEW.is_delivered,    FALSE) = FALSE THEN
            RETURN NEW;
        END IF;

        FOR line IN
            SELECT tl.*, NEW.branch_id, NEW.transaction_type
            FROM transaction_lines tl
            WHERE tl.transaction_id = NEW.id
        LOOP
            SELECT base_uom_id, selling_uom_id, conversion_factor
            INTO p_base_uom, p_selling_uom, p_conversion_factor
            FROM products
            WHERE id = line.product_id;

            IF line.uom_id = p_base_uom THEN
                base_unit_qty := line.quantity;
            ELSE
                SELECT conversion_factor INTO unit_conversion_factor
                FROM product_selling_units
                WHERE product_id = line.product_id
                  AND uom_id     = line.uom_id
                  AND is_active  = true
                LIMIT 1;

                IF unit_conversion_factor IS NOT NULL AND unit_conversion_factor > 0 THEN
                    base_unit_qty := line.quantity / unit_conversion_factor;
                ELSIF line.uom_id = p_selling_uom AND p_conversion_factor > 0 THEN
                    base_unit_qty := line.quantity / p_conversion_factor;
                ELSE
                    base_unit_qty := line.quantity;
                END IF;
            END IF;

            SELECT id, quantity_on_hand INTO inv_id, current_qty
            FROM branch_inventory
            WHERE branch_id  = NEW.branch_id
              AND product_id = line.product_id
              AND (variant_id = line.variant_id OR (variant_id IS NULL AND line.variant_id IS NULL));

            IF inv_id IS NULL THEN
                INSERT INTO branch_inventory (branch_id, product_id, variant_id, quantity_on_hand)
                VALUES (NEW.branch_id, line.product_id, line.variant_id, 0)
                RETURNING id, quantity_on_hand INTO inv_id, current_qty;
            END IF;

            IF NEW.transaction_type = 'sale' THEN
                UPDATE branch_inventory
                SET quantity_on_hand = quantity_on_hand + base_unit_qty,
                    last_movement_at = NOW()
                WHERE id = inv_id;

                INSERT INTO inventory_movements (
                    branch_id, product_id, variant_id, movement_type,
                    quantity_change, quantity_before, quantity_after,
                    reference_id, reference_type, created_by, notes
                ) VALUES (
                    NEW.branch_id, line.product_id, line.variant_id, 'adjustment',
                    base_unit_qty, current_qty, current_qty + base_unit_qty,
                    NEW.id, 'transaction_reversal', NEW.deleted_by,
                    'Reversed deleted sale: ' || NEW.transaction_number ||
                    CASE
                        WHEN line.uom_id != p_base_uom AND unit_conversion_factor IS NOT NULL
                        THEN ' (' || line.quantity || ' units = ' || ROUND(base_unit_qty, 4) || ' base units)'
                        ELSE ''
                    END
                );

            ELSIF NEW.transaction_type = 'return' THEN
                UPDATE branch_inventory
                SET quantity_on_hand = quantity_on_hand - base_unit_qty,
                    last_movement_at = NOW()
                WHERE id = inv_id;

                INSERT INTO inventory_movements (
                    branch_id, product_id, variant_id, movement_type,
                    quantity_change, quantity_before, quantity_after,
                    reference_id, reference_type, created_by, notes
                ) VALUES (
                    NEW.branch_id, line.product_id, line.variant_id, 'adjustment',
                    -base_unit_qty, current_qty, current_qty - base_unit_qty,
                    NEW.id, 'transaction_reversal', NEW.deleted_by,
                    'Reversed deleted return: ' || NEW.transaction_number ||
                    CASE
                        WHEN line.uom_id != p_base_uom AND unit_conversion_factor IS NOT NULL
                        THEN ' (' || line.quantity || ' units = ' || ROUND(base_unit_qty, 4) || ' base units)'
                        ELSE ''
                    END
                );
            END IF;

        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reverse_transaction_inventory() IS
  'Reverses inventory movements when a transaction is soft-deleted. Skips undelivered government sales (inventory was never moved). For delivered sales, adds inventory back. For returns, removes the returned inventory.';
