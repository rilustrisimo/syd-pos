-- Create custom enum types
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'cashier', 'inventory_staff', 'accountant');
CREATE TYPE customer_type AS ENUM ('cash', 'credit', 'wholesale', 'retail');
CREATE TYPE delivery_type AS ENUM ('pickup', 'delivery');
CREATE TYPE payment_method AS ENUM ('cash', 'gcash', 'maya', 'bank_transfer', 'credit');
CREATE TYPE payment_status AS ENUM ('unpaid', 'partial', 'paid');
CREATE TYPE po_status AS ENUM ('draft', 'sent', 'confirmed', 'partially_received', 'received', 'cancelled');
CREATE TYPE movement_type AS ENUM ('purchase', 'sale', 'adjustment', 'return', 'transfer');
CREATE TYPE transaction_type AS ENUM ('sale', 'return');
-- Branches table (multi-branch ready)
CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    address TEXT,
    phone VARCHAR(20),
    email VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index
CREATE INDEX idx_branches_code ON branches(code);
CREATE INDEX idx_branches_is_active ON branches(is_active);

-- Enable RLS
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

-- Basic RLS policy (admin policy added after users table is created)
CREATE POLICY "Authenticated users can view active branches"
    ON branches FOR SELECT
    TO authenticated
    USING (is_active = TRUE);

-- Insert default branch
INSERT INTO branches (code, name, address)
VALUES ('MAIN', 'SYD Construction Supplies - Main', 'Main Branch Address');
-- Users table (extends Supabase auth.users)
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role user_role NOT NULL DEFAULT 'cashier',
    branch_id UUID REFERENCES branches(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_branch_id ON users(branch_id);
CREATE INDEX idx_users_is_active ON users(is_active);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own profile"
    ON users FOR SELECT
    TO authenticated
    USING (id = auth.uid());

CREATE POLICY "Admins can view all users"
    ON users FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
            AND u.role = 'admin'
        )
    );

CREATE POLICY "Admins can manage users"
    ON users FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
            AND u.role = 'admin'
        )
    );

-- Now add the admin policy for branches (after users table exists)
CREATE POLICY "Admins can manage branches"
    ON branches FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'cashier')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user creation
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- Product categories
CREATE TABLE product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_product_categories_name ON product_categories(name);
CREATE INDEX idx_product_categories_is_active ON product_categories(is_active);

-- Enable RLS
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can view active categories"
    ON product_categories FOR SELECT
    TO authenticated
    USING (is_active = TRUE);

CREATE POLICY "Managers and admins can manage categories"
    ON product_categories FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager')
        )
    );

-- Product subcategories
CREATE TABLE product_subcategories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES product_categories(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(category_id, name)
);

-- Create indexes
CREATE INDEX idx_product_subcategories_category_id ON product_subcategories(category_id);
CREATE INDEX idx_product_subcategories_name ON product_subcategories(name);
CREATE INDEX idx_product_subcategories_is_active ON product_subcategories(is_active);

-- Enable RLS
ALTER TABLE product_subcategories ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can view active subcategories"
    ON product_subcategories FOR SELECT
    TO authenticated
    USING (is_active = TRUE);

CREATE POLICY "Managers and admins can manage subcategories"
    ON product_subcategories FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager')
        )
    );

-- Insert common construction supply categories
INSERT INTO product_categories (name, description) VALUES
    ('Cement & Concrete', 'Cement, ready-mix, and concrete products'),
    ('Steel & Metal', 'Steel bars, sheets, and metal products'),
    ('Lumber & Wood', 'Plywood, lumber, and wood products'),
    ('Pipes & Fittings', 'PVC, metal pipes, and fittings'),
    ('Electrical', 'Wires, switches, and electrical supplies'),
    ('Plumbing', 'Plumbing fixtures and supplies'),
    ('Paint & Finishes', 'Paints, primers, and finishing products'),
    ('Hardware', 'Nails, screws, bolts, and hardware'),
    ('Roofing', 'Roofing materials and supplies'),
    ('Tools', 'Hand tools and power tools');
-- Units of measure
CREATE TABLE units_of_measure (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(50) NOT NULL,
    description VARCHAR(200),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index
CREATE INDEX idx_uom_code ON units_of_measure(code);

-- Enable RLS
ALTER TABLE units_of_measure ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can view units"
    ON units_of_measure FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Admins can manage units"
    ON units_of_measure FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Insert common units of measure
INSERT INTO units_of_measure (code, name, description) VALUES
    ('PC', 'Piece', 'Individual piece or unit'),
    ('BOX', 'Box', 'Box or carton'),
    ('BAG', 'Bag', 'Bag or sack'),
    ('KG', 'Kilogram', 'Weight in kilograms'),
    ('LB', 'Pound', 'Weight in pounds'),
    ('M', 'Meter', 'Length in meters'),
    ('FT', 'Foot', 'Length in feet'),
    ('SQM', 'Square Meter', 'Area in square meters'),
    ('SQFT', 'Square Foot', 'Area in square feet'),
    ('L', 'Liter', 'Volume in liters'),
    ('GAL', 'Gallon', 'Volume in gallons'),
    ('ROLL', 'Roll', 'Roll or spool'),
    ('SHEET', 'Sheet', 'Single sheet'),
    ('PAIR', 'Pair', 'Pair of items'),
    ('SET', 'Set', 'Complete set'),
    ('PAIL', 'Pail', 'Pail or bucket'),
    ('PACK', 'Pack', 'Package or pack'),
    ('BUNDLE', 'Bundle', 'Bundle of items'),
    ('LENGTH', 'Length', 'Standard length (varies by product)'),
    ('CAN', 'Can', 'Can or container');
-- Products table
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category_id UUID NOT NULL REFERENCES product_categories(id),
    subcategory_id UUID REFERENCES product_subcategories(id),
    base_uom_id UUID NOT NULL REFERENCES units_of_measure(id),
    selling_uom_id UUID NOT NULL REFERENCES units_of_measure(id),

    -- Pricing (auto-updated from latest purchase)
    latest_cogs DECIMAL(12, 4) NOT NULL DEFAULT 0,
    markup_percentage DECIMAL(5, 2) NOT NULL DEFAULT 20,
    current_selling_price DECIMAL(12, 4) NOT NULL DEFAULT 0,

    -- Stock management
    reorder_point INTEGER NOT NULL DEFAULT 10,
    reorder_quantity INTEGER NOT NULL DEFAULT 50,

    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_products_code ON products(code);
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_subcategory_id ON products(subcategory_id);
CREATE INDEX idx_products_is_active ON products(is_active);

-- Full-text search index
CREATE INDEX idx_products_search ON products USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can view active products"
    ON products FOR SELECT
    TO authenticated
    USING (is_active = TRUE);

CREATE POLICY "Managers, inventory staff, and admins can manage products"
    ON products FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager', 'inventory_staff')
        )
    );

-- Trigger to update updated_at
CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Product variants
CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    sku VARCHAR(50),
    description TEXT,
    override_selling_price DECIMAL(12, 4),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, name)
);

-- Create indexes
CREATE INDEX idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX idx_product_variants_sku ON product_variants(sku);
CREATE INDEX idx_product_variants_is_active ON product_variants(is_active);

-- Enable RLS
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

-- RLS policies (same as products)
CREATE POLICY "Anyone can view active variants"
    ON product_variants FOR SELECT
    TO authenticated
    USING (is_active = TRUE);

CREATE POLICY "Managers, inventory staff, and admins can manage variants"
    ON product_variants FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager', 'inventory_staff')
        )
    );

-- Product images
CREATE TABLE product_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    alt_text VARCHAR(200),
    is_primary BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_product_images_product_id ON product_images(product_id);
CREATE INDEX idx_product_images_is_primary ON product_images(is_primary);

-- Enable RLS
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can view product images"
    ON product_images FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Managers, inventory staff, and admins can manage images"
    ON product_images FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager', 'inventory_staff')
        )
    );

-- Unit conversions (per product)
CREATE TABLE unit_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    from_uom_id UUID NOT NULL REFERENCES units_of_measure(id),
    to_uom_id UUID NOT NULL REFERENCES units_of_measure(id),
    conversion_factor DECIMAL(12, 4) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, from_uom_id, to_uom_id)
);

-- Create indexes
CREATE INDEX idx_unit_conversions_product_id ON unit_conversions(product_id);
CREATE INDEX idx_unit_conversions_from_uom ON unit_conversions(from_uom_id);

-- Enable RLS
ALTER TABLE unit_conversions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can view unit conversions"
    ON unit_conversions FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Managers, inventory staff, and admins can manage conversions"
    ON unit_conversions FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager', 'inventory_staff')
        )
    );
-- Suppliers table
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    payment_terms VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_suppliers_code ON suppliers(code);
CREATE INDEX idx_suppliers_name ON suppliers(name);
CREATE INDEX idx_suppliers_is_active ON suppliers(is_active);

-- Enable RLS
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view active suppliers"
    ON suppliers FOR SELECT
    TO authenticated
    USING (is_active = TRUE);

CREATE POLICY "Managers, inventory staff, and admins can manage suppliers"
    ON suppliers FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager', 'inventory_staff')
        )
    );
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
