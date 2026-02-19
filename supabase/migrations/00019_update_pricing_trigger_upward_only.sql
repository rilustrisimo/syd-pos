-- Update the pricing trigger to only adjust selling prices upward
-- Prevents automatic price reductions when receiving lower-cost inventory

CREATE OR REPLACE FUNCTION update_product_pricing_on_receive()
RETURNS TRIGGER AS $$
DECLARE
    v_conversion_factor DECIMAL(12, 4);
    v_base_uom UUID;
    v_selling_uom UUID;
    v_markup DECIMAL(5, 2);
    v_calculated_cogs DECIMAL(12, 4);
    v_new_selling_price DECIMAL(12, 2);
    v_current_selling_price DECIMAL(12, 2);
BEGIN
    -- Only update when quantity received increases
    IF NEW.quantity_received > OLD.quantity_received THEN
        -- Get product details including current selling price
        SELECT 
            conversion_factor, 
            base_uom_id, 
            selling_uom_id,
            markup_percentage,
            current_selling_price
        INTO 
            v_conversion_factor,
            v_base_uom,
            v_selling_uom,
            v_markup,
            v_current_selling_price
        FROM products
        WHERE id = NEW.product_id;

        -- Calculate COGS based on whether we need unit conversion
        -- If base unit != selling unit, divide by conversion factor
        -- Example: Buy box for 1100, box=20kg, selling per kg: COGS = 1100/20 = 55
        IF v_base_uom != v_selling_uom AND v_conversion_factor > 0 THEN
            v_calculated_cogs := NEW.unit_cost / v_conversion_factor;
        ELSE
            v_calculated_cogs := NEW.unit_cost;
        END IF;

        -- Calculate the new selling price based on markup
        v_new_selling_price := v_calculated_cogs * (1 + v_markup / 100);

        -- Only update selling price if it would increase (never decrease)
        IF v_new_selling_price > v_current_selling_price THEN
            -- Price is going up - update both COGS and selling price
            UPDATE products
            SET
                latest_cogs = v_calculated_cogs,
                current_selling_price = v_new_selling_price,
                updated_at = NOW()
            WHERE id = NEW.product_id;
        ELSE
            -- Price would go down or stay same - only update COGS for tracking
            UPDATE products
            SET
                latest_cogs = v_calculated_cogs,
                updated_at = NOW()
            WHERE id = NEW.product_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_product_pricing_on_receive() IS 
'Automatically updates product COGS when PO items are received. 
Selling price only increases, never decreases automatically - manual adjustment required for price reductions.';
