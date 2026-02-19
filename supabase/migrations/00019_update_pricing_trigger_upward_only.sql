-- Update the pricing trigger to only update COGS
-- Pricing changes are approved per item in the UI

CREATE OR REPLACE FUNCTION update_product_pricing_on_receive()
RETURNS TRIGGER AS $$
DECLARE
    v_conversion_factor DECIMAL(12, 4);
    v_base_uom UUID;
    v_selling_uom UUID;
    v_calculated_cogs DECIMAL(12, 4);
BEGIN
    -- Only update when quantity received increases
    IF NEW.quantity_received > OLD.quantity_received THEN
        -- Get product details for unit conversion
        SELECT 
            conversion_factor, 
            base_uom_id, 
            selling_uom_id
        INTO 
            v_conversion_factor,
            v_base_uom,
            v_selling_uom
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

        -- Update only COGS. Pricing changes require user approval in UI.
        UPDATE products
        SET
            latest_cogs = v_calculated_cogs,
            updated_at = NOW()
        WHERE id = NEW.product_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_product_pricing_on_receive() IS 
'Automatically updates product COGS when PO items are received. 
Selling prices are updated only through user approval in the UI.';
