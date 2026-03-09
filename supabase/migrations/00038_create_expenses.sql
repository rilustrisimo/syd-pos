-- ============================================================================
-- Migration 00038: Create expense_categories + expenses tables
-- ============================================================================
-- PURPOSE:
--   Track operational expenses (rent, electricity, salaries, etc.) so
--   management can produce a P&L report that shows net profit after costs.
--
-- KEY DESIGN DECISIONS:
--   • expense_categories has is_system flag — pre-seeded categories can't be
--     deleted by users; custom categories can be added freely
--   • expenses.branch_id is required — each expense belongs to a branch
--   • expense_date is TIMESTAMPTZ so the same PH-timezone filtering as
--     transactions can be applied in reports
--   • Soft-delete via is_deleted + deleted_at (mirrors transactions pattern)
-- ============================================================================


-- ── expense_categories ────────────────────────────────────────────────────────

CREATE TABLE expense_categories (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    color       VARCHAR(7)   NOT NULL DEFAULT '#6b7280',  -- tailwind gray-500 hex
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    -- Pre-seeded system categories cannot be deleted
    is_system   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_expense_categories_active ON expense_categories(is_active);

CREATE TRIGGER update_expense_categories_updated_at
    BEFORE UPDATE ON expense_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── expenses ──────────────────────────────────────────────────────────────────

CREATE TABLE expenses (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_number   VARCHAR(50)  UNIQUE NOT NULL,

    branch_id        UUID         NOT NULL REFERENCES branches(id),
    category_id      UUID         REFERENCES expense_categories(id),   -- nullable

    amount           DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),
    expense_date     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    description      TEXT,
    notes            TEXT,
    reference_number VARCHAR(100),   -- receipt / invoice number
    paid_to          VARCHAR(200),   -- vendor / payee name

    -- Soft delete
    is_deleted       BOOLEAN      NOT NULL DEFAULT FALSE,
    deleted_at       TIMESTAMPTZ,

    created_by       UUID         NOT NULL REFERENCES users(id),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_expenses_number     ON expenses(expense_number);
CREATE INDEX idx_expenses_branch_id  ON expenses(branch_id);
CREATE INDEX idx_expenses_category   ON expenses(category_id);
CREATE INDEX idx_expenses_date       ON expenses(expense_date);
CREATE INDEX idx_expenses_is_deleted ON expenses(is_deleted);
CREATE INDEX idx_expenses_created_by ON expenses(created_by);

CREATE TRIGGER update_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses            ENABLE ROW LEVEL SECURITY;

-- expense_categories
CREATE POLICY "Authenticated users can view expense categories"
    ON expense_categories FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Managers and admins can manage expense categories"
    ON expense_categories FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager', 'accountant')
        )
    );

CREATE POLICY "Managers and admins can update expense categories"
    ON expense_categories FOR UPDATE
    TO authenticated
    USING (TRUE);

-- expenses
CREATE POLICY "Authenticated users can view expenses"
    ON expenses FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Authenticated users can create expenses"
    ON expenses FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update expenses"
    ON expenses FOR UPDATE
    TO authenticated
    USING (TRUE);


-- ── Auto-number function ──────────────────────────────────────────────────────
-- Generates sequential expense numbers per day: EXP-YYYYMMDD-0001

CREATE OR REPLACE FUNCTION generate_expense_number()
RETURNS TEXT AS $$
DECLARE
    today_prefix TEXT;
    next_seq     INTEGER;
BEGIN
    today_prefix := 'EXP-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD');

    SELECT COALESCE(MAX(
        CAST(SUBSTRING(expense_number FROM LENGTH(today_prefix) + 2) AS INTEGER)
    ), 0) + 1
    INTO next_seq
    FROM expenses
    WHERE expense_number LIKE today_prefix || '-%';

    RETURN today_prefix || '-' || LPAD(next_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_expense_number IS
    'Generates daily-sequential expense numbers in the format EXP-YYYYMMDD-0001.';


-- ── Pre-seeded system categories ──────────────────────────────────────────────

INSERT INTO expense_categories (name, description, color, is_system) VALUES
    ('Rent',               'Monthly rent / lease payments',            '#ef4444', TRUE),  -- red
    ('Electricity',        'Electricity / power bills',                '#f97316', TRUE),  -- orange
    ('Water',              'Water / utility bills',                    '#3b82f6', TRUE),  -- blue
    ('Internet',           'Internet / broadband / data bills',        '#8b5cf6', TRUE),  -- violet
    ('Gas / Fuel',         'Gas, LPG, or vehicle fuel',                '#eab308', TRUE),  -- yellow
    ('Staff Salaries',     'Employee wages, salaries, and allowances', '#22c55e', TRUE),  -- green
    ('Office Supplies',    'Paper, ink, pens, and miscellaneous supplies', '#14b8a6', TRUE),  -- teal
    ('Transportation',     'Freight, delivery, and vehicle expenses',  '#f59e0b', TRUE),  -- amber
    ('Maintenance',        'Repairs, maintenance, and improvements',   '#ec4899', TRUE),  -- pink
    ('Other',              'Miscellaneous expenses not in other categories', '#6b7280', TRUE);  -- gray

COMMENT ON TABLE expense_categories IS
    'Expense categories — pre-seeded system entries cannot be deleted by users.';
COMMENT ON TABLE expenses IS
    'Operational expenses (rent, utilities, salaries, etc.) for P&L reporting.';
