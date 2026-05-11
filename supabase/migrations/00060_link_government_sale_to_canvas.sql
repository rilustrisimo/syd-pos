-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00060: Link government sales to their canvass reference
--
-- A government sale must be tied to a canvass (the Abstract of Canvass that
-- was submitted to the procuring entity). The canvass total_amount serves as
-- the budget cap — the sale total cannot exceed it.
--
-- Changes:
--   1. Add canvas_id (nullable FK) to transactions
--   2. Index for lookup: "show me the sale tied to this canvass"
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS canvas_id UUID REFERENCES canvases(id) ON DELETE SET NULL;

COMMENT ON COLUMN transactions.canvas_id IS
  'For government sales: references the canvass/Abstract of Canvass that authorised this sale.
   The canvass total_amount is the budget cap — sale total_amount must not exceed it.
   NULL for non-government sales.';

CREATE INDEX IF NOT EXISTS idx_transactions_canvas_id ON transactions(canvas_id)
  WHERE canvas_id IS NOT NULL;
