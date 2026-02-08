-- Customers table
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    customer_type customer_type NOT NULL DEFAULT 'cash',
    credit_limit DECIMAL(12, 2) NOT NULL DEFAULT 0,
    outstanding_balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
    payment_terms INTEGER, -- Days for payment
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_customers_name ON customers(name);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_customer_type ON customers(customer_type);
CREATE INDEX idx_customers_is_active ON customers(is_active);

-- Full-text search
CREATE INDEX idx_customers_search ON customers USING gin(to_tsvector('english', name || ' ' || COALESCE(phone, '') || ' ' || COALESCE(email, '')));

-- Enable RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view customers"
    ON customers FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Most roles can create customers"
    ON customers FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager', 'cashier')
        )
    );

CREATE POLICY "Managers and admins can update customers"
    ON customers FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager')
        )
    );

CREATE POLICY "Only admins can delete customers"
    ON customers FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Trigger to update updated_at
CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert a default walk-in customer
INSERT INTO customers (name, customer_type, is_active)
VALUES ('Walk-in Customer', 'cash', TRUE);
