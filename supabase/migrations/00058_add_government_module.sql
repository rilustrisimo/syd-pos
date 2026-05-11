-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00058: Add Government Module
--
-- Adds the data model required for selling to Philippine government offices
-- (DepEd, LGU, etc.) with proper withholding-tax tracking and a government
-- canvass workflow (ad hoc line items + government-specific header).
--
-- Changes:
--   1. New enum values: customer_type 'government', payment_method 'government_withholding'
--   2. New columns on transactions (is_government_sale, po_number, government_agency,
--      withholding_rate, withholding_amount)
--   3. New columns on canvases (is_government, po_number, government_agency, contact_person)
--   4. canvas_lines: product_id + uom_id made nullable to support ad hoc items;
--      add line_description + unit_label for free-text entries
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Enum additions ────────────────────────────────────────────────────────

ALTER TYPE customer_type  ADD VALUE IF NOT EXISTS 'government';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'government_withholding';


-- ── 2. Government columns on transactions ────────────────────────────────────

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_government_sale BOOLEAN       NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS po_number          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS government_agency  VARCHAR(200),
  ADD COLUMN IF NOT EXISTS withholding_rate   DECIMAL(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS withholding_amount DECIMAL(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN transactions.is_government_sale IS
  'TRUE for sales to government offices (DepEd, LGU, etc.) that go through the RA 9184 procurement process.';

COMMENT ON COLUMN transactions.po_number IS
  'Government Purchase Order number issued by the procuring entity.';

COMMENT ON COLUMN transactions.withholding_rate IS
  'Withholding tax rate applied by government when releasing cheque (e.g. 5.00 for 5%).';

COMMENT ON COLUMN transactions.withholding_amount IS
  'Peso amount withheld = total_amount * withholding_rate / 100. Recorded as a government_withholding payment when cheque arrives.';


-- ── 3. Government columns on canvases ────────────────────────────────────────

ALTER TABLE canvases
  ADD COLUMN IF NOT EXISTS is_government     BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS po_number         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS government_agency VARCHAR(200),
  ADD COLUMN IF NOT EXISTS contact_person    VARCHAR(200);

COMMENT ON COLUMN canvases.is_government IS
  'TRUE for canvasses prepared for government procurement (RA 9184 Abstract of Canvass).';


-- ── 4. canvas_lines: support ad hoc (non-inventory) items ───────────────────

-- Make product_id nullable so government canvasses can include items not yet
-- in inventory (free-text description only).
ALTER TABLE canvas_lines ALTER COLUMN product_id DROP NOT NULL;

-- Make uom_id nullable; use unit_label text for ad hoc items.
ALTER TABLE canvas_lines ALTER COLUMN uom_id DROP NOT NULL;

-- Add free-text fields for non-inventory items.
ALTER TABLE canvas_lines
  ADD COLUMN IF NOT EXISTS line_description TEXT,
  ADD COLUMN IF NOT EXISTS unit_label       VARCHAR(50);

-- Drop the non-null partial index that would reject NULLs (if it exists).
-- The canvas_lines_product_id index is a plain btree; NULLs are simply not
-- indexed in PostgreSQL btrees, so the index itself is fine as-is.

COMMENT ON COLUMN canvas_lines.line_description IS
  'Used when product_id is NULL (ad hoc item). Either product_id or line_description must be provided.';

COMMENT ON COLUMN canvas_lines.unit_label IS
  'Unit label for ad hoc items (e.g. "pc", "bag", "length"). Used when uom_id is NULL.';
