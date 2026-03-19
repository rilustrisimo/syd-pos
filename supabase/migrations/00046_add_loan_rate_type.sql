-- ============================================================
-- Migration 00046: Add rate_type to liability_loans
--
-- Adds loan interest calculation method field.
-- Existing loans default to 'flat_rate'.
-- ============================================================

ALTER TABLE liability_loans
ADD COLUMN IF NOT EXISTS rate_type VARCHAR(20) NOT NULL DEFAULT 'flat_rate'
  CHECK (rate_type IN ('flat_rate', 'diminishing', 'interest_only'));

COMMENT ON COLUMN liability_loans.rate_type IS
  'flat_rate = add-on (interest on original principal); '
  'diminishing = reducing balance (interest on remaining balance); '
  'interest_only = pay only interest monthly, full principal at end';
