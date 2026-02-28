-- Add trigger to reverse inventory when a transaction is soft-deleted
-- When a sale is deleted, add back the inventory
-- When a return is deleted, remove the inventory that was added

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

            -- Get current inventory
            SELECT id, quantity_on_hand INTO inv_id, current_qty
            FROM branch_inventory
            WHERE branch_id = NEW.branch_id
              AND product_id = line.product_id
              AND (variant_id = line.variant_id OR (variant_id IS NULL AND line.variant_id IS NULL));

            IF inv_id IS NULL THEN
                -- Create inventory record if doesn't exist
                INSERT INTO branch_inventory (branch_id, product_id, variant_id, quantity_on_hand)
                VALUES (NEW.branch_id, line.product_id, line.variant_id, 0)
                RETURNING id, quantity_on_hand INTO inv_id, current_qty;
            END IF;

            -- Reverse inventory based on original transaction type
            IF NEW.transaction_type = 'sale' THEN
                -- Sale was deleted: ADD inventory back (reverse the deduction)
                UPDATE branch_inventory
                SET quantity_on_hand = quantity_on_hand + base_unit_qty,
                    last_movement_at = NOW()
                WHERE id = inv_id;

                -- Record reversal movement
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
                -- Return was deleted: REMOVE inventory (reverse the addition)
                UPDATE branch_inventory
                SET quantity_on_hand = quantity_on_hand - base_unit_qty,
                    last_movement_at = NOW()
                WHERE id = inv_id;

                -- Record reversal movement
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

-- Create trigger for inventory reversal on soft delete
DROP TRIGGER IF EXISTS on_transaction_soft_delete_reverse_inventory ON transactions;
CREATE TRIGGER on_transaction_soft_delete_reverse_inventory
    AFTER UPDATE ON transactions
    FOR EACH ROW
    WHEN (NEW.is_deleted = true AND OLD.is_deleted = false AND NEW.transaction_type IN ('sale', 'return'))
    EXECUTE FUNCTION reverse_transaction_inventory();

COMMENT ON FUNCTION reverse_transaction_inventory() IS 
    'Reverses inventory movements when a transaction is soft-deleted. For sales, adds inventory back. For returns, removes the returned inventory.';
