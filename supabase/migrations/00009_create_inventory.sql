-- Branch inventory (stock per branch)
CREATE TABLE branch_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES branches(id),
    product_id UUID NOT NULL REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    quantity_on_hand DECIMAL(12, 4) NOT NULL DEFAULT 0,
    quantity_reserved DECIMAL(12, 4) NOT NULL DEFAULT 0,
    last_movement_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(branch_id, product_id, variant_id)
);

-- Create indexes
CREATE INDEX idx_branch_inventory_branch_id ON branch_inventory(branch_id);
CREATE INDEX idx_branch_inventory_product_id ON branch_inventory(product_id);
CREATE INDEX idx_branch_inventory_quantity ON branch_inventory(quantity_on_hand);

-- Enable RLS
ALTER TABLE branch_inventory ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view inventory"
    ON branch_inventory FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Inventory staff, managers, and admins can manage inventory"
    ON branch_inventory FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager', 'inventory_staff')
        )
    );

-- Trigger for updated_at
CREATE TRIGGER update_branch_inventory_updated_at
    BEFORE UPDATE ON branch_inventory
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Inventory movements (audit trail)
CREATE TABLE inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES branches(id),
    product_id UUID NOT NULL REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    movement_type movement_type NOT NULL,
    quantity_change DECIMAL(12, 4) NOT NULL,
    quantity_before DECIMAL(12, 4) NOT NULL DEFAULT 0,
    quantity_after DECIMAL(12, 4) NOT NULL DEFAULT 0,
    reference_id UUID, -- PO ID, Transaction ID, etc.
    reference_type VARCHAR(50), -- 'purchase_order', 'transaction', 'adjustment'
    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_inventory_movements_branch_id ON inventory_movements(branch_id);
CREATE INDEX idx_inventory_movements_product_id ON inventory_movements(product_id);
CREATE INDEX idx_inventory_movements_type ON inventory_movements(movement_type);
CREATE INDEX idx_inventory_movements_created_at ON inventory_movements(created_at);
CREATE INDEX idx_inventory_movements_reference ON inventory_movements(reference_id, reference_type);

-- Enable RLS
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view movements"
    ON inventory_movements FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Only system can insert movements"
    ON inventory_movements FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager', 'inventory_staff', 'cashier')
        )
    );

-- Stock alerts
CREATE TABLE stock_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES branches(id),
    product_id UUID NOT NULL REFERENCES products(id),
    alert_type VARCHAR(20) NOT NULL, -- 'low_stock', 'out_of_stock', 'overstock'
    current_quantity DECIMAL(12, 4) NOT NULL,
    threshold_quantity DECIMAL(12, 4) NOT NULL,
    is_acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_stock_alerts_branch_id ON stock_alerts(branch_id);
CREATE INDEX idx_stock_alerts_product_id ON stock_alerts(product_id);
CREATE INDEX idx_stock_alerts_alert_type ON stock_alerts(alert_type);
CREATE INDEX idx_stock_alerts_is_acknowledged ON stock_alerts(is_acknowledged);

-- Enable RLS
ALTER TABLE stock_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view alerts"
    ON stock_alerts FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Managers, inventory staff, and admins can manage alerts"
    ON stock_alerts FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager', 'inventory_staff')
        )
    );
