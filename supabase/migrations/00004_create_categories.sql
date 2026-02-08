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
