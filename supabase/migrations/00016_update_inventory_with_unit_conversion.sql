-- Update inventory system to handle unit conversions
-- Inventory is always tracked in BASE units
-- Sales in SELLING units are converted to BASE units before deducting

-- Add comment to clarify inventory tracking
COMMENT ON COLUMN branch_inventory.quantity_on_hand IS 'Quantity in base units. Sales in selling units are converted before deducting.';
COMMENT ON COLUMN branch_inventory.quantity_reserved IS 'Reserved quantity in base units';
COMMENT ON COLUMN inventory_movements.quantity_change IS 'Quantity change in base units';

-- Update the transaction inventory processing to handle unit conversion
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

        -- Convert quantity to base units if needed
        -- If transaction is in selling units, convert to base units
        -- Example: Selling 20 kg, 1 box = 20 kg → deduct 1 box
        IF line.uom_id = p_selling_uom AND p_base_uom != p_selling_uom AND p_conversion_factor > 0 THEN
            -- Convert selling units to base units by dividing
            base_unit_qty := line.quantity / p_conversion_factor;
        ELSE
            -- Already in base units or same unit, use as is
            base_unit_qty := line.quantity;
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
                    WHEN line.uom_id = p_selling_uom AND p_base_uom != p_selling_uom 
                    THEN 'Sold ' || line.quantity || ' selling units, deducted ' || base_unit_qty || ' base units'
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
                    WHEN line.uom_id = p_selling_uom AND p_base_uom != p_selling_uom 
                    THEN 'Returned ' || line.quantity || ' selling units, added ' || base_unit_qty || ' base units'
                    ELSE NULL
                END
            );
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update purchase order receiving to add inventory in base units
CREATE OR REPLACE FUNCTION update_inventory_on_receive()
RETURNS TRIGGER AS $$
DECLARE
    inv_id UUID;
    current_qty DECIMAL(12, 4);
    po_branch UUID;
    base_unit_qty DECIMAL(12, 4);
    p_base_uom UUID;
    p_conversion_factor DECIMAL(12, 4);
BEGIN
    -- Only process when quantity received increases
    IF NEW.quantity_received > OLD.quantity_received THEN
        -- Get the PO branch
        SELECT branch_id INTO po_branch
        FROM purchase_orders
        WHERE id = NEW.po_id;

        -- Get product's unit information
        SELECT base_uom_id, conversion_factor
        INTO p_base_uom, p_conversion_factor
        FROM products
        WHERE id = NEW.product_id;

        -- Convert received quantity to base units if needed
        -- Purchase orders should typically be in base units, but handle conversion just in case
        IF NEW.uom_id = p_base_uom OR p_conversion_factor <= 0 THEN
            base_unit_qty := NEW.quantity_received - OLD.quantity_received;
        ELSE
            -- If somehow receiving in different units, convert
            base_unit_qty := (NEW.quantity_received - OLD.quantity_received) / p_conversion_factor;
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
            RETURNING id, quantity_on_hand INTO inv_id, current_qty;
        ELSE
            UPDATE branch_inventory
            SET quantity_on_hand = quantity_on_hand + base_unit_qty,
                last_movement_at = NOW()
            WHERE id = inv_id
            RETURNING quantity_on_hand INTO current_qty;
        END IF;

        -- Record inventory movement (in base units)
        INSERT INTO inventory_movements (
            branch_id, product_id, variant_id, movement_type,
            quantity_change, quantity_before, quantity_after,
            reference_id, reference_type, created_by
        ) VALUES (
            po_branch, NEW.product_id, NEW.variant_id, 'purchase',
            base_unit_qty, 
            COALESCE(current_qty, 0) - base_unit_qty, 
            COALESCE(current_qty, 0),
            NEW.po_id, 'purchase_order', auth.uid()
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create or replace the trigger
DROP TRIGGER IF EXISTS on_po_line_inventory_update ON purchase_order_lines;
CREATE TRIGGER on_po_line_inventory_update
    AFTER UPDATE ON purchase_order_lines
    FOR EACH ROW
    WHEN (NEW.quantity_received > OLD.quantity_received)
    EXECUTE FUNCTION update_inventory_on_receive();
