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
