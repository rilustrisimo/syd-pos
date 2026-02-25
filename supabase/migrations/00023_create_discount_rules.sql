-- Discount rules for standard POS discounts
-- Rules define what discount % to apply based on a product's markup range.
-- When a cashier selects "Standard Discount", the system checks each cart item's
-- markup_percentage and applies the matching rule's discount_percentage to it.

CREATE TABLE discount_rules (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR(100)  NOT NULL,
  markup_min          DECIMAL(5,2)  NOT NULL DEFAULT 0,
  markup_max          DECIMAL(5,2),          -- NULL = no upper limit
  discount_percentage DECIMAL(5,2)  NOT NULL CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
  is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
  sort_order          INTEGER       NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ   DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX idx_discount_rules_is_active ON discount_rules(is_active);
CREATE INDEX idx_discount_rules_sort_order ON discount_rules(sort_order);

ALTER TABLE discount_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view discount rules"
  ON discount_rules FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "Admins and managers can manage discount rules"
  ON discount_rules FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'manager')
    )
  );

CREATE TRIGGER update_discount_rules_updated_at
  BEFORE UPDATE ON discount_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE discount_rules IS
  'Standard discount rules applied per-item in POS based on product markup range.';
COMMENT ON COLUMN discount_rules.markup_min IS
  'Minimum markup % (inclusive) for this rule to apply.';
COMMENT ON COLUMN discount_rules.markup_max IS
  'Maximum markup % (inclusive). NULL means no upper limit.';
COMMENT ON COLUMN discount_rules.discount_percentage IS
  'Discount % applied to the line total when this rule matches.';

-- Seed example rules matching the user requirements
INSERT INTO discount_rules (name, markup_min, markup_max, discount_percentage, sort_order)
VALUES
  ('Low Markup (0–20%)',   0,    20,   1, 10),
  ('High Markup (21%+)',  21,  NULL,   2, 20);
