-- Purchase orders
CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number VARCHAR(50) UNIQUE NOT NULL,
    branch_id UUID NOT NULL REFERENCES branches(id),
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    po_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery_date DATE,
    actual_delivery_date DATE,
    status po_status NOT NULL DEFAULT 'draft',
    total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_purchase_orders_po_number ON purchase_orders(po_number);
CREATE INDEX idx_purchase_orders_branch_id ON purchase_orders(branch_id);
CREATE INDEX idx_purchase_orders_supplier_id ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX idx_purchase_orders_po_date ON purchase_orders(po_date);

-- Enable RLS
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view purchase orders"
    ON purchase_orders FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Inventory staff, managers, and admins can manage POs"
    ON purchase_orders FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager', 'inventory_staff')
        )
    );

-- Trigger for updated_at
CREATE TRIGGER update_purchase_orders_updated_at
    BEFORE UPDATE ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Purchase order lines
CREATE TABLE purchase_order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    product_id UUID NOT NULL REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    quantity_ordered DECIMAL(12, 4) NOT NULL,
    quantity_received DECIMAL(12, 4) NOT NULL DEFAULT 0,
    uom_id UUID NOT NULL REFERENCES units_of_measure(id),
    unit_cost DECIMAL(12, 4) NOT NULL,
    line_total DECIMAL(12, 2) GENERATED ALWAYS AS (quantity_ordered * unit_cost) STORED,
    notes VARCHAR(500),
    UNIQUE(po_id, line_number)
);

-- Create indexes
CREATE INDEX idx_po_lines_po_id ON purchase_order_lines(po_id);
CREATE INDEX idx_po_lines_product_id ON purchase_order_lines(product_id);

-- Enable RLS
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;

-- RLS policies (same as purchase_orders)
CREATE POLICY "Authenticated users can view PO lines"
    ON purchase_order_lines FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Inventory staff, managers, and admins can manage PO lines"
    ON purchase_order_lines FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager', 'inventory_staff')
        )
    );

-- Function to update product COGS when PO is received
CREATE OR REPLACE FUNCTION update_product_pricing_on_receive()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update when quantity received increases
    IF NEW.quantity_received > OLD.quantity_received THEN
        -- Update the product's latest COGS and selling price
        UPDATE products
        SET
            latest_cogs = NEW.unit_cost,
            current_selling_price = NEW.unit_cost * (1 + markup_percentage / 100),
            updated_at = NOW()
        WHERE id = NEW.product_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating product pricing
CREATE TRIGGER on_po_line_received
    AFTER UPDATE ON purchase_order_lines
    FOR EACH ROW
    WHEN (NEW.quantity_received > OLD.quantity_received)
    EXECUTE FUNCTION update_product_pricing_on_receive();

-- Function to generate PO number
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TEXT AS $$
DECLARE
    today_prefix TEXT;
    next_seq INTEGER;
BEGIN
    today_prefix := 'PO-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD');

    SELECT COALESCE(MAX(
        CAST(SUBSTRING(po_number FROM LENGTH(today_prefix) + 2) AS INTEGER)
    ), 0) + 1
    INTO next_seq
    FROM purchase_orders
    WHERE po_number LIKE today_prefix || '-%';

    RETURN today_prefix || '-' || LPAD(next_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;
