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
