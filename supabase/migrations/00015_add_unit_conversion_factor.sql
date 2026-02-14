-- Add conversion factor to products table
-- This represents how many selling units are in 1 base unit
-- Example: 1 box (base) = 20 kg (selling), so conversion_factor = 20
ALTER TABLE products
ADD COLUMN conversion_factor DECIMAL(12, 4) DEFAULT 1 NOT NULL;

COMMENT ON COLUMN products.conversion_factor IS 'How many selling units are in 1 base unit. Used when base_uom_id != selling_uom_id. Example: 1 box = 20kg, factor = 20';

-- Update the trigger to calculate COGS based on conversion factor
CREATE OR REPLACE FUNCTION update_product_pricing_on_receive()
RETURNS TRIGGER AS $$
DECLARE
    v_conversion_factor DECIMAL(12, 4);
    v_base_uom UUID;
    v_selling_uom UUID;
    v_markup DECIMAL(5, 2);
    v_calculated_cogs DECIMAL(12, 4);
BEGIN
    -- Only update when quantity received increases
    IF NEW.quantity_received > OLD.quantity_received THEN
        -- Get product details
        SELECT 
            conversion_factor, 
            base_uom_id, 
            selling_uom_id,
            markup_percentage
        INTO 
            v_conversion_factor,
            v_base_uom,
            v_selling_uom,
            v_markup
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

        -- Update the product's latest COGS and selling price
        UPDATE products
        SET
            latest_cogs = v_calculated_cogs,
            current_selling_price = v_calculated_cogs * (1 + v_markup / 100),
            updated_at = NOW()
        WHERE id = NEW.product_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update existing products with same units to have factor of 1
UPDATE products
SET conversion_factor = 1
WHERE base_uom_id = selling_uom_id;
