-- Add delivery_charge to purchase_orders
-- Delivery charges are distributed proportionally into COGS when items are received

ALTER TABLE purchase_orders
  ADD COLUMN delivery_charge DECIMAL(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN purchase_orders.delivery_charge IS
  'Supplier delivery / freight charge for this PO. Distributed proportionally into product COGS on receipt.';

-- Update the COGS trigger to include proportional delivery charge (landed cost)
CREATE OR REPLACE FUNCTION update_product_pricing_on_receive()
RETURNS TRIGGER AS $$
DECLARE
    v_conversion_factor      DECIMAL(12, 4);
    v_base_uom               UUID;
    v_selling_uom            UUID;
    v_delivery_charge        DECIMAL(12, 2);
    v_merchandise_subtotal   DECIMAL(12, 4);
    v_line_total             DECIMAL(12, 4);
    v_landed_unit_cost       DECIMAL(12, 4);
    v_calculated_cogs        DECIMAL(12, 4);
BEGIN
    -- Only update when quantity received increases
    IF NEW.quantity_received > OLD.quantity_received THEN

        -- Get product UOM details
        SELECT conversion_factor, base_uom_id, selling_uom_id
        INTO v_conversion_factor, v_base_uom, v_selling_uom
        FROM products
        WHERE id = NEW.product_id;

        -- Get PO delivery charge
        SELECT COALESCE(delivery_charge, 0)
        INTO v_delivery_charge
        FROM purchase_orders
        WHERE id = NEW.po_id;

        -- Sum of all line merchandise values for this PO
        SELECT COALESCE(SUM(quantity_ordered * unit_cost), 0)
        INTO v_merchandise_subtotal
        FROM purchase_order_lines
        WHERE po_id = NEW.po_id;

        -- This line's merchandise value
        v_line_total := NEW.quantity_ordered * NEW.unit_cost;

        -- Landed unit cost = purchase unit cost + proportional share of delivery charge
        IF v_merchandise_subtotal > 0 AND v_delivery_charge > 0 AND NEW.quantity_ordered > 0 THEN
            v_landed_unit_cost := NEW.unit_cost
                + (v_line_total / v_merchandise_subtotal) * v_delivery_charge
                / NEW.quantity_ordered;
        ELSE
            v_landed_unit_cost := NEW.unit_cost;
        END IF;

        -- Apply selling-UOM conversion (e.g. buy box, sell per kg)
        IF v_base_uom IS DISTINCT FROM v_selling_uom AND v_conversion_factor > 0 THEN
            v_calculated_cogs := v_landed_unit_cost / v_conversion_factor;
        ELSE
            v_calculated_cogs := v_landed_unit_cost;
        END IF;

        -- Update COGS only; selling price approval happens in the UI
        UPDATE products
        SET
            latest_cogs = v_calculated_cogs,
            updated_at  = NOW()
        WHERE id = NEW.product_id;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_product_pricing_on_receive() IS
'Updates product COGS when PO items are received.
Landed cost = unit_cost + proportional share of PO delivery charge.
Selling prices are updated only through user approval in the UI.';
