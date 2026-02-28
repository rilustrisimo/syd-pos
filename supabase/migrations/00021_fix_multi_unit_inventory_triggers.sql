-- Fix inventory triggers to properly handle multi-unit conversions
-- This fixes the issue where purchasing in non-base units (e.g., PC instead of BOX)
-- was incorrectly calculating inventory

-- Update purchase order receiving trigger to handle multi-unit conversions
CREATE OR REPLACE FUNCTION update_inventory_on_receive()
RETURNS TRIGGER AS $$
DECLARE
    inv_id UUID;
    current_qty DECIMAL(12, 4);
    po_branch UUID;
    base_unit_qty DECIMAL(12, 4);
    qty_change DECIMAL(12, 4);
    p_base_uom UUID;
    p_selling_uom UUID;
    p_conversion_factor DECIMAL(12, 4);
    unit_conversion_factor DECIMAL(12, 4);
BEGIN
    -- Only process when quantity received increases
    IF NEW.quantity_received > OLD.quantity_received THEN
        qty_change := NEW.quantity_received - OLD.quantity_received;
        
        -- Get the PO branch
        SELECT branch_id INTO po_branch
        FROM purchase_orders
        WHERE id = NEW.po_id;

        -- Get product's unit information
        SELECT base_uom_id, selling_uom_id, conversion_factor
        INTO p_base_uom, p_selling_uom, p_conversion_factor
        FROM products
        WHERE id = NEW.product_id;

        -- Determine conversion factor based on the unit used in purchase order
        IF NEW.uom_id = p_base_uom THEN
            -- Already in base units, no conversion needed
            base_unit_qty := qty_change;
        ELSE
            -- Try to find conversion factor from product_selling_units table
            SELECT conversion_factor INTO unit_conversion_factor
            FROM product_selling_units
            WHERE product_id = NEW.product_id
              AND uom_id = NEW.uom_id
              AND is_active = true
            LIMIT 1;

            IF unit_conversion_factor IS NOT NULL AND unit_conversion_factor > 0 THEN
                -- Use conversion factor from product_selling_units
                -- Example: Buying 4 PC, where 44 PC = 1 BOX → 4 / 44 = 0.09 BOX
                base_unit_qty := qty_change / unit_conversion_factor;
            ELSIF NEW.uom_id = p_selling_uom AND p_conversion_factor > 0 THEN
                -- Fallback: use product's default conversion factor if purchasing in selling unit
                base_unit_qty := qty_change / p_conversion_factor;
            ELSE
                -- No conversion factor found, assume 1:1 (shouldn't happen in normal use)
                base_unit_qty := qty_change;
            END IF;
        END IF;

        -- Get or create inventory record
        SELECT id, quantity_on_hand INTO inv_id, current_qty
        FROM branch_inventory
        WHERE branch_id = po_branch
          AND product_id = NEW.product_id
          AND (variant_id = NEW.variant_id OR (variant_id IS NULL AND NEW.variant_id IS NULL));

        IF inv_id IS NULL THEN
            INSERT INTO branch_inventory (branch_id, product_id, variant_id, quantity_on_hand, last_movement_at)
            VALUES (po_branch, NEW.product_id, NEW.variant_id, base_unit_qty, NOW())
            RETURNING id INTO inv_id;
            current_qty := 0;
        ELSE
            current_qty := COALESCE(current_qty, 0);
            UPDATE branch_inventory
            SET quantity_on_hand = quantity_on_hand + base_unit_qty,
                last_movement_at = NOW()
            WHERE id = inv_id;
        END IF;

        -- Record inventory movement (in base units)
        INSERT INTO inventory_movements (
            branch_id, product_id, variant_id, movement_type,
            quantity_change, quantity_before, quantity_after,
            reference_id, reference_type, created_by, notes
        ) VALUES (
            po_branch, NEW.product_id, NEW.variant_id, 'purchase',
            base_unit_qty, 
            current_qty, 
            current_qty + base_unit_qty,
            NEW.po_id, 'purchase_order', auth.uid(),
            CASE 
                WHEN NEW.uom_id != p_base_uom AND unit_conversion_factor IS NOT NULL
                THEN 'Received ' || qty_change || ' units (conversion: ' || unit_conversion_factor || '), added ' || ROUND(base_unit_qty, 4) || ' base units'
                ELSE NULL
            END
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update transaction inventory trigger to handle multi-unit conversions for sales
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
                -- Example: Selling 20 PC, where 44 PC = 1 BOX → 20 / 44 = 0.45 BOX
                base_unit_qty := line.quantity / unit_conversion_factor;
            ELSIF line.uom_id = p_selling_uom AND p_conversion_factor > 0 THEN
                -- Fallback: use product's default conversion factor if selling in selling unit
                base_unit_qty := line.quantity / p_conversion_factor;
            ELSE
                -- No conversion factor found, assume 1:1 (shouldn't happen in normal use)
                base_unit_qty := line.quantity;
            END IF;
        END IF;

        -- Get or create inventory record
        SELECT id, quantity_on_hand INTO inv_id, current_qty
        FROM branch_inventory
        WHERE branch_id = line.branch_id
          AND product_id = line.product_id
          AND (variant_id = line.variant_id OR (variant_id IS NULL AND line.variant_id IS NULL));

        IF inv_id IS NULL THEN
            -- Create inventory record if doesn't exist
            INSERT INTO branch_inventory (branch_id, product_id, variant_id, quantity_on_hand)
            VALUES (line.branch_id, line.product_id, line.variant_id, 0)
            RETURNING id, quantity_on_hand INTO inv_id, current_qty;
        END IF;

        -- Update inventory based on transaction type (using base units)
        IF line.transaction_type = 'sale' THEN
            UPDATE branch_inventory
            SET quantity_on_hand = quantity_on_hand - base_unit_qty,
                last_movement_at = NOW()
            WHERE id = inv_id;

            -- Record movement (in base units)
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
            UPDATE branch_inventory
            SET quantity_on_hand = quantity_on_hand + base_unit_qty,
                last_movement_at = NOW()
            WHERE id = inv_id;

            -- Record movement (in base units)
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
                END
            );
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the triggers (they use the updated functions)
DROP TRIGGER IF EXISTS on_po_line_inventory_update ON purchase_order_lines;
CREATE TRIGGER on_po_line_inventory_update
    AFTER UPDATE ON purchase_order_lines
    FOR EACH ROW
    WHEN (NEW.quantity_received > OLD.quantity_received)
    EXECUTE FUNCTION update_inventory_on_receive();

DROP TRIGGER IF EXISTS on_transaction_inventory_update ON transactions;
CREATE TRIGGER on_transaction_inventory_update
    AFTER INSERT ON transactions
    FOR EACH ROW
    WHEN (NEW.transaction_type IN ('sale', 'return'))
    EXECUTE FUNCTION process_transaction_inventory();
