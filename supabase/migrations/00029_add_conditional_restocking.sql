-- ============================================================================
-- Migration 00029: Conditional Restocking for Returns
-- ============================================================================
-- Adds ability to control whether returned items are restocked or not.
-- Useful for damaged, expired, or defective returns that shouldn't go back
-- into sellable inventory.
--
-- Changes:
-- - Add return_reason enum
-- - Add should_restock and return_reason columns to transaction_lines
-- - Update process_transaction_inventory trigger to respect should_restock
-- - Create separate movement type for non-restocked returns
-- ============================================================================

-- STEP 1: Create return_reason enum
DO $$ BEGIN
    CREATE TYPE return_reason AS ENUM (
        'customer_request',
        'wrong_item',
        'defective',
        'damaged',
        'expired',
        'quality_issue',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE return_reason IS 
    'Reasons for product returns. Damaged, expired, and defective items are auto-flagged as non-restockable.';

-- STEP 2: Add columns to transaction_lines
ALTER TABLE transaction_lines 
ADD COLUMN IF NOT EXISTS should_restock BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS return_reason return_reason;

COMMENT ON COLUMN transaction_lines.should_restock IS 
    'When false, returned items will not be added back to inventory. Used for damaged/expired items.';

COMMENT ON COLUMN transaction_lines.return_reason IS 
    'Reason for return. Only applicable for transaction_type = return.';

-- STEP 3: Create trigger to auto-set should_restock based on return_reason
CREATE OR REPLACE FUNCTION set_restock_flag_from_reason()
RETURNS TRIGGER AS $$
BEGIN
    -- Only apply to return transactions
    IF EXISTS (
        SELECT 1 FROM transactions 
        WHERE id = NEW.transaction_id 
          AND transaction_type = 'return'
    ) THEN
        -- Auto-set should_restock = false for damaged/expired/defective items
        IF NEW.return_reason IN ('damaged', 'expired', 'defective', 'quality_issue') THEN
            NEW.should_restock := false;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_restock_flag ON transaction_lines;
CREATE TRIGGER set_restock_flag
    BEFORE INSERT OR UPDATE ON transaction_lines
    FOR EACH ROW
    EXECUTE FUNCTION set_restock_flag_from_reason();

-- STEP 4: Update process_transaction_inventory to respect should_restock
CREATE OR REPLACE FUNCTION process_transaction_inventory()
RETURNS TRIGGER AS $$
DECLARE
    line RECORD;
    inv_id UUID;
    current_qty DECIMAL(12, 4);
    base_unit_qty DECIMAL(12, 4);
    p_base_uom UUID;
    p_selling_uom UUID;
    p_conversion_factor DECIMAL(12, 4);
    unit_conversion_factor DECIMAL(12, 4);
BEGIN
    -- Get transaction branch from the transaction
    FOR line IN
        SELECT tl.*, t.branch_id, t.transaction_type
        FROM transaction_lines tl
        JOIN transactions t ON t.id = tl.transaction_id
        WHERE tl.transaction_id = NEW.id
    LOOP
        -- Get product's unit information
        SELECT base_uom_id, selling_uom_id, conversion_factor
        INTO p_base_uom, p_selling_uom, p_conversion_factor
        FROM products
        WHERE id = line.product_id;

        -- Determine conversion factor based on the unit used in transaction
        IF line.uom_id = p_base_uom THEN
            -- Already in base units, no conversion needed
            base_unit_qty := line.quantity;
        ELSE
            -- Try to find conversion factor from product_selling_units table
            SELECT conversion_factor INTO unit_conversion_factor
            FROM product_selling_units
            WHERE product_id = line.product_id
              AND uom_id = line.uom_id
              AND is_active = true
            LIMIT 1;

            IF unit_conversion_factor IS NOT NULL AND unit_conversion_factor > 0 THEN
                -- Use conversion factor from product_selling_units
                base_unit_qty := line.quantity / unit_conversion_factor;
            ELSIF line.uom_id = p_selling_uom AND p_conversion_factor > 0 THEN
                -- Fallback: use product's default conversion factor
                base_unit_qty := line.quantity / p_conversion_factor;
            ELSE
                -- No conversion factor found, assume 1:1
                base_unit_qty := line.quantity;
            END IF;
        END IF;

        -- Lock inventory row to prevent race conditions
        SELECT id, quantity_on_hand INTO inv_id, current_qty
        FROM branch_inventory
        WHERE branch_id = line.branch_id
          AND product_id = line.product_id
          AND (variant_id = line.variant_id OR (variant_id IS NULL AND line.variant_id IS NULL))
        FOR UPDATE;

        IF inv_id IS NULL THEN
            -- Create inventory record if doesn't exist
            INSERT INTO branch_inventory (branch_id, product_id, variant_id, quantity_on_hand)
            VALUES (line.branch_id, line.product_id, line.variant_id, 0)
            RETURNING id, quantity_on_hand INTO inv_id, current_qty;
        END IF;

        -- Update inventory based on transaction type
        IF line.transaction_type = 'sale' THEN
            -- SALE: Deduct inventory
            UPDATE branch_inventory
            SET quantity_on_hand = quantity_on_hand - base_unit_qty,
                last_movement_at = NOW()
            WHERE id = inv_id;

            -- Record movement
            INSERT INTO inventory_movements (
                branch_id, product_id, variant_id, movement_type,
                quantity_change, quantity_before, quantity_after,
                reference_id, reference_type, created_by, notes
            ) VALUES (
                line.branch_id, line.product_id, line.variant_id, 'sale',
                -base_unit_qty, current_qty, current_qty - base_unit_qty,
                NEW.id, 'transaction', NEW.created_by,
                CASE 
                    WHEN line.uom_id != p_base_uom AND unit_conversion_factor IS NOT NULL
                    THEN 'Sold ' || line.quantity || ' units (conversion: ' || unit_conversion_factor || '), deducted ' || ROUND(base_unit_qty, 4) || ' base units'
                    ELSE NULL
                END
            );

        ELSIF line.transaction_type = 'return' THEN
            -- RETURN: Check should_restock flag
            IF COALESCE(line.should_restock, true) = true THEN
                -- RESTOCK: Add inventory back
                UPDATE branch_inventory
                SET quantity_on_hand = quantity_on_hand + base_unit_qty,
                    last_movement_at = NOW()
                WHERE id = inv_id;

                -- Record movement
                INSERT INTO inventory_movements (
                    branch_id, product_id, variant_id, movement_type,
                    quantity_change, quantity_before, quantity_after,
                    reference_id, reference_type, created_by, notes
                ) VALUES (
                    line.branch_id, line.product_id, line.variant_id, 'return',
                    base_unit_qty, current_qty, current_qty + base_unit_qty,
                    NEW.id, 'transaction', NEW.created_by,
                    CASE 
                        WHEN line.uom_id != p_base_uom AND unit_conversion_factor IS NOT NULL
                        THEN 'Returned ' || line.quantity || ' units (conversion: ' || unit_conversion_factor || '), added ' || ROUND(base_unit_qty, 4) || ' base units'
                        ELSE NULL
                    END ||
                    CASE
                        WHEN line.return_reason IS NOT NULL
                        THEN ' | Reason: ' || line.return_reason
                        ELSE ''
                    END
                );
            ELSE
                -- DO NOT RESTOCK: Record movement with zero change
                INSERT INTO inventory_movements (
                    branch_id, product_id, variant_id, movement_type,
                    quantity_change, quantity_before, quantity_after,
                    reference_id, reference_type, created_by, notes
                ) VALUES (
                    line.branch_id, line.product_id, line.variant_id, 'damaged_return',
                    0, current_qty, current_qty,
                    NEW.id, 'transaction', NEW.created_by,
                    format(
                        'Not restocked: %s | Reason: %s | Quantity: %s %s',
                        COALESCE(line.notes, 'Return received'),
                        COALESCE(line.return_reason::TEXT, 'unspecified'),
                        line.quantity,
                        CASE 
                            WHEN line.uom_id != p_base_uom AND unit_conversion_factor IS NOT NULL
                            THEN 'units (' || ROUND(base_unit_qty, 4) || ' base units)'
                            ELSE 'base units'
                        END
                    )
                );
            END IF;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger (ensure it uses updated function)
DROP TRIGGER IF EXISTS on_transaction_inventory_update ON transactions;
CREATE TRIGGER on_transaction_inventory_update
    AFTER INSERT ON transactions
    FOR EACH ROW
    WHEN (NEW.transaction_type IN ('sale', 'return'))
    EXECUTE FUNCTION process_transaction_inventory();

-- STEP 5: Update reverse_transaction_inventory to handle non-restocked items
CREATE OR REPLACE FUNCTION reverse_transaction_inventory()
RETURNS TRIGGER AS $$
DECLARE
    line RECORD;
    inv_id UUID;
    current_qty DECIMAL(12, 4);
    base_unit_qty DECIMAL(12, 4);
    p_base_uom UUID;
    p_selling_uom UUID;
    p_conversion_factor DECIMAL(12, 4);
    unit_conversion_factor DECIMAL(12, 4);
BEGIN
    -- Only process when is_deleted changes from false to true
    IF NEW.is_deleted = true AND OLD.is_deleted = false THEN
        -- Get all lines for this transaction
        FOR line IN
            SELECT tl.*, NEW.branch_id, NEW.transaction_type
            FROM transaction_lines tl
            WHERE tl.transaction_id = NEW.id
        LOOP
            -- Get product's unit information
            SELECT base_uom_id, selling_uom_id, conversion_factor
            INTO p_base_uom, p_selling_uom, p_conversion_factor
            FROM products
            WHERE id = line.product_id;

            -- Determine conversion factor
            IF line.uom_id = p_base_uom THEN
                base_unit_qty := line.quantity;
            ELSE
                SELECT conversion_factor INTO unit_conversion_factor
                FROM product_selling_units
                WHERE product_id = line.product_id
                  AND uom_id = line.uom_id
                  AND is_active = true
                LIMIT 1;

                IF unit_conversion_factor IS NOT NULL AND unit_conversion_factor > 0 THEN
                    base_unit_qty := line.quantity / unit_conversion_factor;
                ELSIF line.uom_id = p_selling_uom AND p_conversion_factor > 0 THEN
                    base_unit_qty := line.quantity / p_conversion_factor;
                ELSE
                    base_unit_qty := line.quantity;
                END IF;
            END IF;

            -- Lock inventory row
            SELECT id, quantity_on_hand INTO inv_id, current_qty
            FROM branch_inventory
            WHERE branch_id = NEW.branch_id
              AND product_id = line.product_id
              AND (variant_id = line.variant_id OR (variant_id IS NULL AND line.variant_id IS NULL))
            FOR UPDATE;

            IF inv_id IS NULL THEN
                INSERT INTO branch_inventory (branch_id, product_id, variant_id, quantity_on_hand)
                VALUES (NEW.branch_id, line.product_id, line.variant_id, 0)
                RETURNING id, quantity_on_hand INTO inv_id, current_qty;
            END IF;

            -- Reverse inventory based on original transaction type
            IF NEW.transaction_type = 'sale' THEN
                -- Sale was deleted: ADD inventory back
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
                    'Reversed deleted sale: ' || NEW.transaction_number
                );

            ELSIF NEW.transaction_type = 'return' THEN
                -- Return was deleted: Only reverse if it was restocked
                IF COALESCE(line.should_restock, true) = true THEN
                    -- This return was restocked, so REMOVE inventory
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
                        'Reversed deleted return: ' || NEW.transaction_number || ' (was restocked)'
                    );
                ELSE
                    -- This return was NOT restocked, so no inventory change needed
                    INSERT INTO inventory_movements (
                        branch_id, product_id, variant_id, movement_type,
                        quantity_change, quantity_before, quantity_after,
                        reference_id, reference_type, created_by, notes
                    ) VALUES (
                        NEW.branch_id, line.product_id, line.variant_id, 'adjustment',
                        0, current_qty, current_qty,
                        NEW.id, 'transaction_reversal', NEW.deleted_by,
                        'Reversed deleted return: ' || NEW.transaction_number || ' (was not restocked, no inventory change)'
                    );
                END IF;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- STEP 6: Add index for better performance
CREATE INDEX IF NOT EXISTS idx_transaction_lines_return_reason 
ON transaction_lines(return_reason) 
WHERE return_reason IS NOT NULL;

-- Add helpful comments
COMMENT ON FUNCTION set_restock_flag_from_reason() IS 
    'Automatically sets should_restock=false for damaged, expired, defective, or quality_issue returns.';

COMMENT ON FUNCTION process_transaction_inventory() IS 
    'Updated to respect should_restock flag. When false, creates damaged_return movement with zero quantity change.';

COMMENT ON FUNCTION reverse_transaction_inventory() IS 
    'Updated to handle reversal of non-restocked returns correctly (no inventory change needed).';
