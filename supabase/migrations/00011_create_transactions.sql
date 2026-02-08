-- Transactions (sales)
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_number VARCHAR(50) UNIQUE NOT NULL,
    branch_id UUID NOT NULL REFERENCES branches(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    transaction_type transaction_type NOT NULL DEFAULT 'sale',
    delivery_type delivery_type NOT NULL DEFAULT 'pickup',
    delivery_address TEXT,
    delivery_phone VARCHAR(20),

    -- Totals
    subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    discount_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(12, 2) NOT NULL,

    -- Payment tracking
    payment_status payment_status NOT NULL DEFAULT 'unpaid',
    amount_paid DECIMAL(12, 2) NOT NULL DEFAULT 0,

    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_transactions_number ON transactions(transaction_number);
CREATE INDEX idx_transactions_branch_id ON transactions(branch_id);
CREATE INDEX idx_transactions_customer_id ON transactions(customer_id);
CREATE INDEX idx_transactions_date ON transactions(transaction_date);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_transactions_payment_status ON transactions(payment_status);

-- Composite index for analytics queries
CREATE INDEX idx_transactions_date_branch ON transactions(transaction_date, branch_id);
CREATE INDEX idx_transactions_date_product ON transactions(transaction_date, branch_id);

-- Enable RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view transactions"
    ON transactions FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Cashiers, managers, and admins can create transactions"
    ON transactions FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager', 'cashier')
        )
    );

CREATE POLICY "Managers and admins can update transactions"
    ON transactions FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager')
        )
    );

-- Trigger for updated_at
CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Transaction lines
CREATE TABLE transaction_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    product_id UUID NOT NULL REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    quantity DECIMAL(12, 4) NOT NULL,
    uom_id UUID NOT NULL REFERENCES units_of_measure(id),
    unit_price DECIMAL(12, 4) NOT NULL,
    cogs_per_unit DECIMAL(12, 4) NOT NULL,
    discount_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    line_total DECIMAL(12, 2) GENERATED ALWAYS AS ((quantity * unit_price) - discount_amount) STORED,
    line_profit DECIMAL(12, 2) GENERATED ALWAYS AS ((quantity * unit_price) - discount_amount - (quantity * cogs_per_unit)) STORED,
    notes VARCHAR(500),
    UNIQUE(transaction_id, line_number)
);

-- Create indexes
CREATE INDEX idx_transaction_lines_transaction_id ON transaction_lines(transaction_id);
CREATE INDEX idx_transaction_lines_product_id ON transaction_lines(product_id);

-- Enable RLS
ALTER TABLE transaction_lines ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view transaction lines"
    ON transaction_lines FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Cashiers, managers, and admins can create transaction lines"
    ON transaction_lines FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager', 'cashier')
        )
    );

-- Transaction payments
CREATE TABLE transaction_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    payment_method payment_method NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    reference_number VARCHAR(100),
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes VARCHAR(200),
    created_by UUID NOT NULL REFERENCES users(id)
);

-- Create indexes
CREATE INDEX idx_transaction_payments_transaction_id ON transaction_payments(transaction_id);
CREATE INDEX idx_transaction_payments_method ON transaction_payments(payment_method);
CREATE INDEX idx_transaction_payments_date ON transaction_payments(payment_date);

-- Enable RLS
ALTER TABLE transaction_payments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view payments"
    ON transaction_payments FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Cashiers, managers, and admins can create payments"
    ON transaction_payments FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager', 'cashier')
        )
    );

-- Function to generate transaction number
CREATE OR REPLACE FUNCTION generate_transaction_number()
RETURNS TEXT AS $$
DECLARE
    today_prefix TEXT;
    next_seq INTEGER;
BEGIN
    today_prefix := 'TXN-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD');

    SELECT COALESCE(MAX(
        CAST(SUBSTRING(transaction_number FROM LENGTH(today_prefix) + 2) AS INTEGER)
    ), 0) + 1
    INTO next_seq
    FROM transactions
    WHERE transaction_number LIKE today_prefix || '-%';

    RETURN today_prefix || '-' || LPAD(next_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to update inventory after transaction
CREATE OR REPLACE FUNCTION process_transaction_inventory()
RETURNS TRIGGER AS $$
DECLARE
    line RECORD;
    inv_id UUID;
    current_qty DECIMAL(12, 4);
BEGIN
    -- Get transaction branch from the transaction
    FOR line IN
        SELECT tl.*, t.branch_id, t.transaction_type
        FROM transaction_lines tl
        JOIN transactions t ON t.id = tl.transaction_id
        WHERE tl.transaction_id = NEW.id
    LOOP
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

        -- Update inventory based on transaction type
        IF line.transaction_type = 'sale' THEN
            UPDATE branch_inventory
            SET quantity_on_hand = quantity_on_hand - line.quantity,
                last_movement_at = NOW()
            WHERE id = inv_id;

            -- Record movement
            INSERT INTO inventory_movements (
                branch_id, product_id, variant_id, movement_type,
                quantity_change, quantity_before, quantity_after,
                reference_id, reference_type, created_by
            ) VALUES (
                line.branch_id, line.product_id, line.variant_id, 'sale',
                -line.quantity, current_qty, current_qty - line.quantity,
                NEW.id, 'transaction', NEW.created_by
            );
        ELSIF line.transaction_type = 'return' THEN
            UPDATE branch_inventory
            SET quantity_on_hand = quantity_on_hand + line.quantity,
                last_movement_at = NOW()
            WHERE id = inv_id;

            -- Record movement
            INSERT INTO inventory_movements (
                branch_id, product_id, variant_id, movement_type,
                quantity_change, quantity_before, quantity_after,
                reference_id, reference_type, created_by
            ) VALUES (
                line.branch_id, line.product_id, line.variant_id, 'return',
                line.quantity, current_qty, current_qty + line.quantity,
                NEW.id, 'transaction', NEW.created_by
            );
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: This trigger should be applied after transaction is completed
-- In practice, you might want to call this as a stored procedure instead
