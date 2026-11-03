-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00104: Leads in online orders
--
-- The shop now asks first-time visitors for their name and number before
-- they've added anything. Saving that creates an online_orders row with
-- status 'lead' (no lines, zero totals) so staff can call them right away.
-- When the visitor later submits their list, syd-shop updates that same
-- row to 'pending' and adds the lines.
--
-- lead_token: secret held in the visitor's browser; the shop only updates
--   a lead row when id + token match, then clears the token.
-- lead_captured_at / lead_converted_at: when the contact was captured and
--   when the list was submitted. The POS realtime listener uses
--   lead_converted_at to tell "lead submitted a list" apart from ordinary
--   staff edits (Supabase realtime doesn't send old values for RLS tables).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE online_orders DROP CONSTRAINT IF EXISTS online_orders_status_check;
ALTER TABLE online_orders ADD CONSTRAINT online_orders_status_check
  CHECK (status IN ('lead','pending','confirmed','preparing','out_for_delivery','delivered','picked_up','cancelled'));

ALTER TABLE online_orders
  ADD COLUMN IF NOT EXISTS lead_token        uuid UNIQUE,
  ADD COLUMN IF NOT EXISTS lead_captured_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lead_converted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_online_orders_lead_phone
  ON online_orders(customer_phone) WHERE status = 'lead';
