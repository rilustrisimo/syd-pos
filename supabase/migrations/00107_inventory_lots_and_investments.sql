-- Migration 00107: Inventory lots + investments (tables only)
--
-- Stock today is one number per product per branch. To let investors own
-- part of the stock, every delivery becomes a LOT, and a lot can be split
-- between investors (investment_lot_shares) and the store (whatever isn't
-- tagged). Sales consume lots oldest-first (lot_consumptions); returns,
-- deletes and adjustments move quantity back or write it off.
--
-- Invariant (checked by view lot_stock_mismatch in 00108):
--   SUM(lots.qty_remaining) = GREATEST(branch_inventory.quantity_on_hand, 0)
--   SUM(shares.qty_remaining on a lot) <= lot.qty_remaining
--
-- All writes happen inside SECURITY DEFINER functions (00108), so cashiers
-- never need direct access. Investment tables are admin-only.

-- ── Investments ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS investments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE,
  investor_name    text NOT NULL,
  contact          text,
  start_date       date NOT NULL DEFAULT CURRENT_DATE,
  -- Investor's share of gross profit (selling price − cost), 0–100.
  profit_share_pct numeric(5, 2) NOT NULL CHECK (profit_share_pct >= 0 AND profit_share_pct <= 100),
  -- true: profit share adds to the amount available to tag.
  -- false: profit share is held as "owed to investor" until paid out.
  reinvest_profit  boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  notes            text,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Manual money events: capital and top-ups add money; payout pays out profit
-- share (held mode) or reduces available (reinvest mode); withdrawal takes
-- capital out. Everything else (tagged cost, returns, profit) is
-- computed from lots and sales, so it can't drift.
CREATE TABLE IF NOT EXISTS investment_ledger (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id  uuid NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  entry_type     text NOT NULL CHECK (entry_type IN ('capital', 'top_up', 'payout', 'withdrawal')),
  amount         numeric(14, 2) NOT NULL CHECK (amount > 0),
  entry_date     date NOT NULL DEFAULT CURRENT_DATE,
  notes          text,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS investment_ledger_investment_idx ON investment_ledger (investment_id);

-- ── Lots ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_lots (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id      uuid NOT NULL REFERENCES branches(id),
  product_id     uuid NOT NULL REFERENCES products(id),
  variant_id     uuid,
  source         text NOT NULL CHECK (source IN ('po', 'opening', 'adjustment', 'return')),
  po_id          uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  -- Kept even if the PO line is later edited or deleted; cost is snapshotted below.
  po_line_id     uuid REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
  received_at    timestamptz NOT NULL DEFAULT now(),
  -- Cost of ONE BASE UNIT, including the PO delivery-charge share.
  unit_cost      numeric(14, 6) NOT NULL DEFAULT 0,
  qty_received   numeric(14, 4) NOT NULL CHECK (qty_received >= 0),
  qty_remaining  numeric(14, 4) NOT NULL CHECK (qty_remaining >= 0),
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_lots_fifo_idx
  ON inventory_lots (branch_id, product_id, received_at, created_at)
  WHERE qty_remaining > 0;
CREATE INDEX IF NOT EXISTS inventory_lots_po_line_idx ON inventory_lots (po_line_id);

-- An investor's part of a lot.
CREATE TABLE IF NOT EXISTS investment_lot_shares (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id  uuid NOT NULL REFERENCES investments(id),
  lot_id         uuid NOT NULL REFERENCES inventory_lots(id),
  qty_tagged     numeric(14, 4) NOT NULL CHECK (qty_tagged >= 0),  -- 0 once fully untagged
  qty_remaining  numeric(14, 4) NOT NULL CHECK (qty_remaining >= 0 AND qty_remaining <= qty_tagged),
  unit_cost      numeric(14, 6) NOT NULL,       -- snapshot of the lot's base-unit cost
  price_at_tag   numeric(14, 6),                -- selling price per base unit when tagged
  tagged_at      timestamptz NOT NULL DEFAULT now(),
  tagged_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes          text
);
CREATE INDEX IF NOT EXISTS investment_lot_shares_lot_idx ON investment_lot_shares (lot_id, tagged_at);
CREATE INDEX IF NOT EXISTS investment_lot_shares_investment_idx ON investment_lot_shares (investment_id);

-- Which lot (and which owner) each sale line used.
-- lot_id NULL = sold below zero stock (no lot existed); store-owned.
CREATE TABLE IF NOT EXISTS lot_consumptions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id       uuid NOT NULL REFERENCES transactions(id),
  transaction_line_id  uuid NOT NULL REFERENCES transaction_lines(id),
  lot_id               uuid REFERENCES inventory_lots(id),
  lot_share_id         uuid REFERENCES investment_lot_shares(id),
  qty_base             numeric(14, 4) NOT NULL CHECK (qty_base > 0),
  -- Units later returned against this consumption (restocked or not).
  qty_returned         numeric(14, 4) NOT NULL DEFAULT 0 CHECK (qty_returned >= 0 AND qty_returned <= qty_base),
  unit_cost            numeric(14, 6) NOT NULL,
  reversed_at          timestamptz,              -- set when the sale is deleted
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lot_consumptions_txn_idx ON lot_consumptions (transaction_id);
CREATE INDEX IF NOT EXISTS lot_consumptions_line_idx ON lot_consumptions (transaction_line_id);
CREATE INDEX IF NOT EXISTS lot_consumptions_share_idx ON lot_consumptions (lot_share_id) WHERE lot_share_id IS NOT NULL;

-- How each return line was matched back to the original sale's consumptions.
CREATE TABLE IF NOT EXISTS lot_return_restores (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_txn_id        uuid NOT NULL REFERENCES transactions(id),
  return_line_id       uuid NOT NULL REFERENCES transaction_lines(id),
  consumption_id       uuid REFERENCES lot_consumptions(id),  -- NULL = no matching consumption (pre-lots sale)
  lot_id               uuid REFERENCES inventory_lots(id),    -- lot the units went back into (restocked only)
  lot_share_id         uuid REFERENCES investment_lot_shares(id),
  qty_base             numeric(14, 4) NOT NULL CHECK (qty_base > 0),
  restocked            boolean NOT NULL,
  unit_cost            numeric(14, 6) NOT NULL,
  reversed_at          timestamptz,              -- set when the return is deleted
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lot_return_restores_return_idx ON lot_return_restores (return_txn_id);
CREATE INDEX IF NOT EXISTS lot_return_restores_share_idx ON lot_return_restores (lot_share_id) WHERE lot_share_id IS NOT NULL;

-- Stock removed by negative adjustments (or a deleted return) without a sale.
-- Rows with lot_share_id are investor units the store bought back at cost.
CREATE TABLE IF NOT EXISTS lot_writeoffs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id          uuid NOT NULL REFERENCES inventory_lots(id),
  lot_share_id    uuid REFERENCES investment_lot_shares(id),
  qty_base        numeric(14, 4) NOT NULL CHECK (qty_base > 0),
  unit_cost       numeric(14, 6) NOT NULL,
  reason          text,
  reference_type  text,
  reference_id    uuid,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lot_writeoffs_share_idx ON lot_writeoffs (lot_share_id) WHERE lot_share_id IS NOT NULL;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Investment data: admin only. Lot tables: admin + manager can read (stock
-- reports); nobody writes directly — only the SECURITY DEFINER functions.

ALTER TABLE investments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_ledger     ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_lot_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_lots        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lot_consumptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lot_return_restores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE lot_writeoffs         ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage investments" ON investments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY "Admins manage investment ledger" ON investment_ledger
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY "Admins read investment shares" ON investment_lot_shares
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

CREATE POLICY "Staff read lots" ON inventory_lots
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager')));

CREATE POLICY "Staff read lot consumptions" ON lot_consumptions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager')));

CREATE POLICY "Staff read lot return restores" ON lot_return_restores
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager')));

CREATE POLICY "Staff read lot writeoffs" ON lot_writeoffs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'manager')));
