-- ============================================================================
-- Migration 00037: Create canvases + canvas_lines tables
-- ============================================================================
-- PURPOSE:
--   A "canvas" is a price quotation / tally sheet built like a POS cart but
--   with NO checkout, NO inventory deduction, and NO payment tracking.
--   Staff use canvases to show customers an estimated total before they
--   decide to buy. A canvas can later be converted to a real transaction.
--
-- KEY DESIGN DECISIONS:
--   • No inventory triggers — canvases never affect stock levels
--   • customer_id is nullable — walk-in / anonymous canvases are allowed
--   • canvas_lines.cogs_per_unit is stored so "Convert to Sale" can pre-fill
--     the POS cart with the same cost that was current at canvas time
--   • Soft-delete via is_deleted + deleted_at (mirrors transactions pattern)
-- ============================================================================


-- ── canvases ─────────────────────────────────────────────────────────────────

CREATE TABLE canvases (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    canvas_number  VARCHAR(50)  UNIQUE NOT NULL,

    branch_id      UUID         NOT NULL REFERENCES branches(id),
    customer_id    UUID         REFERENCES customers(id),   -- nullable: walk-in OK

    -- Optional label the cashier can set (e.g. "Juan – plumbing materials")
    title          TEXT,
    notes          TEXT,

    -- Financial totals (caller-computed, same as transactions)
    subtotal           DECIMAL(12, 2) NOT NULL DEFAULT 0,
    discount_amount    DECIMAL(12, 2) NOT NULL DEFAULT 0,
    discount_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0,
    delivery_fee       DECIMAL(12, 2) NOT NULL DEFAULT 0,
    other_fees         DECIMAL(12, 2) NOT NULL DEFAULT 0,
    other_fees_notes   TEXT,
    total_amount       DECIMAL(12, 2) NOT NULL DEFAULT 0,

    canvas_date    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Soft delete
    is_deleted     BOOLEAN      NOT NULL DEFAULT FALSE,
    deleted_at     TIMESTAMPTZ,

    created_by     UUID         NOT NULL REFERENCES users(id),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_canvases_number      ON canvases(canvas_number);
CREATE INDEX idx_canvases_branch_id   ON canvases(branch_id);
CREATE INDEX idx_canvases_customer_id ON canvases(customer_id);
CREATE INDEX idx_canvases_date        ON canvases(canvas_date);
CREATE INDEX idx_canvases_is_deleted  ON canvases(is_deleted);

-- updated_at trigger
CREATE TRIGGER update_canvases_updated_at
    BEFORE UPDATE ON canvases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── canvas_lines ──────────────────────────────────────────────────────────────

CREATE TABLE canvas_lines (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    canvas_id   UUID         NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    line_number INTEGER      NOT NULL,
    product_id  UUID         NOT NULL REFERENCES products(id),
    quantity    DECIMAL(12, 4) NOT NULL,
    uom_id      UUID         NOT NULL REFERENCES units_of_measure(id),
    unit_price  DECIMAL(12, 4) NOT NULL,
    -- Stored so "Convert to Sale" can populate POS cart with the correct COGS
    cogs_per_unit DECIMAL(12, 4) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    line_total  DECIMAL(12, 2)
                GENERATED ALWAYS AS ((quantity * unit_price) - discount_amount) STORED,
    notes       VARCHAR(500),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(canvas_id, line_number)
);

CREATE INDEX idx_canvas_lines_canvas_id   ON canvas_lines(canvas_id);
CREATE INDEX idx_canvas_lines_product_id  ON canvas_lines(product_id);

-- updated_at trigger
CREATE TRIGGER update_canvas_lines_updated_at
    BEFORE UPDATE ON canvas_lines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE canvases      ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_lines  ENABLE ROW LEVEL SECURITY;

-- canvases
CREATE POLICY "Authenticated users can view canvases"
    ON canvases FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Cashiers, managers, and admins can create canvases"
    ON canvases FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager', 'cashier')
        )
    );

CREATE POLICY "Authenticated users can update canvases"
    ON canvases FOR UPDATE
    TO authenticated
    USING (TRUE);

-- canvas_lines
CREATE POLICY "Authenticated users can view canvas lines"
    ON canvas_lines FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Cashiers, managers, and admins can create canvas lines"
    ON canvas_lines FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager', 'cashier')
        )
    );

CREATE POLICY "Authenticated users can update canvas lines"
    ON canvas_lines FOR UPDATE
    TO authenticated
    USING (TRUE);

CREATE POLICY "Authenticated users can delete canvas lines"
    ON canvas_lines FOR DELETE
    TO authenticated
    USING (TRUE);


-- ── Auto-number function ──────────────────────────────────────────────────────
-- Generates sequential canvas numbers per day: CAN-YYYYMMDD-0001

CREATE OR REPLACE FUNCTION generate_canvas_number()
RETURNS TEXT AS $$
DECLARE
    today_prefix TEXT;
    next_seq     INTEGER;
BEGIN
    today_prefix := 'CAN-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD');

    SELECT COALESCE(MAX(
        CAST(SUBSTRING(canvas_number FROM LENGTH(today_prefix) + 2) AS INTEGER)
    ), 0) + 1
    INTO next_seq
    FROM canvases
    WHERE canvas_number LIKE today_prefix || '-%';

    RETURN today_prefix || '-' || LPAD(next_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_canvas_number IS
    'Generates daily-sequential canvas numbers in the format CAN-YYYYMMDD-0001.';
COMMENT ON TABLE canvases IS
    'Price quotation / canvass sheets — mirrors POS cart state but never affects inventory or sales.';
COMMENT ON TABLE canvas_lines IS
    'Line items for a canvas. Stores cogs_per_unit so Convert-to-Sale can pre-fill the POS cart correctly.';
