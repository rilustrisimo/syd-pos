-- Migration 00108: Lot and investment functions
--
-- lots_private.* — internal helpers called from the existing stock functions
--   (sale, government delivery, return, delete, adjustment, PO receive; wired
--   in 00109). SECURITY DEFINER so cashiers can update lots without reading
--   investment data. The lots_private schema is NOT exposed by the API
--   (config.toml exposes only public/graphql_public), so nobody can call
--   these directly over /rpc.
--
-- public.* — admin-only RPCs for the Investments screens (each checks the
--   caller is an admin, because SECURITY DEFINER bypasses RLS).
--
-- Rules (agreed with the owner):
--   * Sales consume lots OLDEST FIRST, whoever owns them. Within one lot,
--     investor shares go first in the order they were tagged, then the store.
--   * Losses (negative adjustments, deleted returns that can't be matched)
--     come out of STORE-owned stock first, newest lot first. Investor units
--     are only touched once no store stock is left; those are bought back
--     from the investor at cost (lot_writeoffs rows with lot_share_id).
--   * A damaged (not restocked) return of an investor's unit also counts as
--     a buy-back at cost: the sale is undone and the investor gets the cost.
--   * Investor money is realized pro-rata to what the customer has paid.

CREATE SCHEMA IF NOT EXISTS lots_private;
GRANT USAGE ON SCHEMA lots_private TO authenticated, service_role;

-- ── Small helpers ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION lots_private.lots_total(p_branch uuid, p_product uuid, p_variant uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(qty_remaining), 0)
  FROM inventory_lots
  WHERE branch_id = p_branch AND product_id = p_product
    AND variant_id IS NOT DISTINCT FROM p_variant;
$$;

CREATE OR REPLACE FUNCTION lots_private.on_hand(p_branch uuid, p_product uuid, p_variant uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT quantity_on_hand FROM branch_inventory
    WHERE branch_id = p_branch AND product_id = p_product
      AND variant_id IS NOT DISTINCT FROM p_variant
  ), 0);
$$;

-- Units of a lot not tagged to any investor.
CREATE OR REPLACE FUNCTION lots_private.store_qty(p_lot uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.qty_remaining - COALESCE((
    SELECT SUM(s.qty_remaining) FROM investment_lot_shares s WHERE s.lot_id = l.id
  ), 0)
  FROM inventory_lots l WHERE l.id = p_lot;
$$;

CREATE OR REPLACE FUNCTION lots_private.assert_admin()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Only admins can manage investments' USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

-- ── Add a lot (PO receive, positive adjustment, restock) ─────────────────────
-- Call AFTER branch_inventory has been increased. The lot keeps only what
-- fits under on-hand stock, so receiving into negative stock first fills the
-- shortfall (those units were already sold).
CREATE OR REPLACE FUNCTION lots_private.add_lot(
  p_branch uuid, p_product uuid, p_variant uuid,
  p_qty numeric, p_unit_cost numeric, p_source text,
  p_po_id uuid DEFAULT NULL, p_po_line_id uuid DEFAULT NULL,
  p_received_at timestamptz DEFAULT now(), p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_room numeric;
  v_id   uuid;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN NULL;
  END IF;
  v_room := GREATEST(lots_private.on_hand(p_branch, p_product, p_variant), 0)
          - lots_private.lots_total(p_branch, p_product, p_variant);
  INSERT INTO inventory_lots (
    branch_id, product_id, variant_id, source, po_id, po_line_id,
    received_at, unit_cost, qty_received, qty_remaining, notes
  ) VALUES (
    p_branch, p_product, p_variant, p_source, p_po_id, p_po_line_id,
    COALESCE(p_received_at, now()), COALESCE(p_unit_cost, 0), p_qty,
    LEAST(p_qty, GREATEST(v_room, 0)), p_notes
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── Consume lots for a sale line (oldest first) ──────────────────────────────
-- Call AFTER branch_inventory has been decreased.
CREATE OR REPLACE FUNCTION lots_private.consume(
  p_txn uuid, p_line uuid, p_branch uuid, p_product uuid, p_variant uuid, p_qty numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_left  numeric := p_qty;
  v_lot   record;
  v_share record;
  v_take  numeric;
  v_store numeric;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN;
  END IF;

  FOR v_lot IN
    SELECT id, unit_cost FROM inventory_lots
    WHERE branch_id = p_branch AND product_id = p_product
      AND variant_id IS NOT DISTINCT FROM p_variant
      AND qty_remaining > 0
    ORDER BY received_at, created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_left <= 0;

    -- Investor shares in this lot, in tag order
    FOR v_share IN
      SELECT id, unit_cost, qty_remaining FROM investment_lot_shares
      WHERE lot_id = v_lot.id AND qty_remaining > 0
      ORDER BY tagged_at, id
      FOR UPDATE
    LOOP
      EXIT WHEN v_left <= 0;
      v_take := LEAST(v_left, v_share.qty_remaining);
      UPDATE investment_lot_shares SET qty_remaining = qty_remaining - v_take WHERE id = v_share.id;
      UPDATE inventory_lots SET qty_remaining = qty_remaining - v_take WHERE id = v_lot.id;
      INSERT INTO lot_consumptions (transaction_id, transaction_line_id, lot_id, lot_share_id, qty_base, unit_cost)
      VALUES (p_txn, p_line, v_lot.id, v_share.id, v_take, v_share.unit_cost);
      v_left := v_left - v_take;
    END LOOP;

    -- Then the store's part of the lot
    IF v_left > 0 THEN
      v_store := lots_private.store_qty(v_lot.id);
      v_take := LEAST(v_left, v_store);
      IF v_take > 0 THEN
        UPDATE inventory_lots SET qty_remaining = qty_remaining - v_take WHERE id = v_lot.id;
        INSERT INTO lot_consumptions (transaction_id, transaction_line_id, lot_id, lot_share_id, qty_base, unit_cost)
        VALUES (p_txn, p_line, v_lot.id, NULL, v_take, v_lot.unit_cost);
        v_left := v_left - v_take;
      END IF;
    END IF;
  END LOOP;

  -- Sold below zero (allow_negative_inventory): no lot to take from; store-owned.
  IF v_left > 0 THEN
    INSERT INTO lot_consumptions (transaction_id, transaction_line_id, lot_id, lot_share_id, qty_base, unit_cost)
    VALUES (p_txn, p_line, NULL, NULL, v_left,
            COALESCE((SELECT latest_cogs FROM products WHERE id = p_product), 0));
  END IF;
END;
$$;

-- ── Trim lots down to on-hand stock (losses) ─────────────────────────────────
-- Call AFTER branch_inventory has been decreased. Removes the excess of lots
-- over on-hand stock: store-owned units first (newest lot first), then
-- investor units (bought back at cost).
CREATE OR REPLACE FUNCTION lots_private.trim(
  p_branch uuid, p_product uuid, p_variant uuid,
  p_reason text DEFAULT NULL, p_ref_type text DEFAULT NULL, p_ref_id uuid DEFAULT NULL,
  p_user uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_excess numeric;
  v_lot    record;
  v_share  record;
  v_take   numeric;
BEGIN
  v_excess := lots_private.lots_total(p_branch, p_product, p_variant)
            - GREATEST(lots_private.on_hand(p_branch, p_product, p_variant), 0);
  IF v_excess <= 0 THEN
    RETURN;
  END IF;

  -- Pass 1: store-owned units, newest lot first
  FOR v_lot IN
    SELECT id, unit_cost FROM inventory_lots
    WHERE branch_id = p_branch AND product_id = p_product
      AND variant_id IS NOT DISTINCT FROM p_variant
      AND qty_remaining > 0
    ORDER BY received_at DESC, created_at DESC, id DESC
    FOR UPDATE
  LOOP
    EXIT WHEN v_excess <= 0;
    v_take := LEAST(v_excess, lots_private.store_qty(v_lot.id));
    IF v_take > 0 THEN
      UPDATE inventory_lots SET qty_remaining = qty_remaining - v_take WHERE id = v_lot.id;
      INSERT INTO lot_writeoffs (lot_id, lot_share_id, qty_base, unit_cost, reason, reference_type, reference_id, created_by)
      VALUES (v_lot.id, NULL, v_take, v_lot.unit_cost, p_reason, p_ref_type, p_ref_id, p_user);
      v_excess := v_excess - v_take;
    END IF;
  END LOOP;

  -- Pass 2: investor units (store absorbs: bought back at cost)
  IF v_excess > 0 THEN
    FOR v_share IN
      SELECT s.id, s.lot_id, s.unit_cost, s.qty_remaining
      FROM investment_lot_shares s
      JOIN inventory_lots l ON l.id = s.lot_id
      WHERE l.branch_id = p_branch AND l.product_id = p_product
        AND l.variant_id IS NOT DISTINCT FROM p_variant
        AND s.qty_remaining > 0
      ORDER BY l.received_at DESC, l.created_at DESC, s.tagged_at DESC, s.id DESC
      FOR UPDATE OF s
    LOOP
      EXIT WHEN v_excess <= 0;
      v_take := LEAST(v_excess, v_share.qty_remaining);
      UPDATE investment_lot_shares SET qty_remaining = qty_remaining - v_take WHERE id = v_share.id;
      UPDATE inventory_lots SET qty_remaining = qty_remaining - v_take WHERE id = v_share.lot_id;
      INSERT INTO lot_writeoffs (lot_id, lot_share_id, qty_base, unit_cost, reason, reference_type, reference_id, created_by)
      VALUES (v_share.lot_id, v_share.id, v_take, v_share.unit_cost, p_reason, p_ref_type, p_ref_id, p_user);
      v_excess := v_excess - v_take;
    END LOOP;
  END IF;
END;
$$;

-- ── Deleted sale: put consumed units back ────────────────────────────────────
-- Call AFTER branch_inventory has been increased.
CREATE OR REPLACE FUNCTION lots_private.reverse_sale(p_txn uuid, p_user uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c   record;
  v_q numeric;
BEGIN
  FOR c IN
    SELECT lc.*, t.branch_id, tl.product_id, tl.variant_id
    FROM lot_consumptions lc
    JOIN transactions t       ON t.id  = lc.transaction_id
    JOIN transaction_lines tl ON tl.id = lc.transaction_line_id
    WHERE lc.transaction_id = p_txn AND lc.reversed_at IS NULL
    ORDER BY lc.created_at, lc.id
    FOR UPDATE OF lc
  LOOP
    v_q := c.qty_base - c.qty_returned;
    IF v_q > 0 THEN
      IF c.lot_id IS NOT NULL THEN
        UPDATE inventory_lots SET qty_remaining = qty_remaining + v_q WHERE id = c.lot_id;
        IF c.lot_share_id IS NOT NULL THEN
          UPDATE investment_lot_shares SET qty_remaining = qty_remaining + v_q WHERE id = c.lot_share_id;
        END IF;
      ELSE
        PERFORM lots_private.add_lot(c.branch_id, c.product_id, c.variant_id, v_q, c.unit_cost,
                                     'return', NULL, NULL, now(), 'Deleted sale');
      END IF;
    END IF;
    UPDATE lot_consumptions SET reversed_at = now() WHERE id = c.id;
  END LOOP;

  -- Safety: never leave more in lots than is on hand.
  FOR c IN
    SELECT DISTINCT t.branch_id, tl.product_id, tl.variant_id
    FROM transaction_lines tl JOIN transactions t ON t.id = tl.transaction_id
    WHERE tl.transaction_id = p_txn
  LOOP
    PERFORM lots_private.trim(c.branch_id, c.product_id, c.variant_id,
                              'Deleted sale reconciliation', 'transaction_reversal', p_txn, p_user);
  END LOOP;
END;
$$;

-- ── Return: match units back to the original sale's consumptions ─────────────
-- Latest consumptions first. Restocked units go back to the same lot/owner;
-- damaged units don't (an investor's damaged unit = buy-back at cost).
-- Call AFTER branch_inventory has been increased (restocked lines only).
CREATE OR REPLACE FUNCTION lots_private.return_restore(
  p_return_txn uuid, p_return_line uuid, p_orig_txn uuid,
  p_branch uuid, p_product uuid, p_variant uuid, p_qty numeric, p_restock boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_left numeric := p_qty;
  c      record;
  v_take numeric;
  v_lot  uuid;
  v_cogs numeric;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN;
  END IF;

  FOR c IN
    SELECT lc.* FROM lot_consumptions lc
    JOIN transaction_lines tl ON tl.id = lc.transaction_line_id
    WHERE lc.transaction_id = p_orig_txn
      AND tl.product_id = p_product
      AND tl.variant_id IS NOT DISTINCT FROM p_variant
      AND lc.reversed_at IS NULL
      AND lc.qty_base - lc.qty_returned > 0
    ORDER BY lc.created_at DESC, lc.id DESC
    FOR UPDATE OF lc
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(v_left, c.qty_base - c.qty_returned);
    UPDATE lot_consumptions SET qty_returned = qty_returned + v_take WHERE id = c.id;

    v_lot := NULL;
    IF p_restock THEN
      IF c.lot_id IS NOT NULL THEN
        UPDATE inventory_lots SET qty_remaining = qty_remaining + v_take WHERE id = c.lot_id;
        IF c.lot_share_id IS NOT NULL THEN
          UPDATE investment_lot_shares SET qty_remaining = qty_remaining + v_take WHERE id = c.lot_share_id;
        END IF;
        v_lot := c.lot_id;
      ELSE
        v_lot := lots_private.add_lot(p_branch, p_product, p_variant, v_take, c.unit_cost,
                                      'return', NULL, NULL, now(), 'Returned (sold below zero stock)');
      END IF;
    END IF;

    INSERT INTO lot_return_restores (return_txn_id, return_line_id, consumption_id, lot_id, lot_share_id,
                                     qty_base, restocked, unit_cost)
    VALUES (p_return_txn, p_return_line, c.id, v_lot,
            CASE WHEN p_restock AND c.lot_id IS NULL THEN NULL ELSE c.lot_share_id END,
            v_take, p_restock, c.unit_cost);
    v_left := v_left - v_take;
  END LOOP;

  -- Nothing left to match (e.g. the sale was made before lots existed): store-owned.
  IF v_left > 0 THEN
    v_cogs := COALESCE((SELECT latest_cogs FROM products WHERE id = p_product), 0);
    v_lot := NULL;
    IF p_restock THEN
      v_lot := lots_private.add_lot(p_branch, p_product, p_variant, v_left, v_cogs,
                                    'return', NULL, NULL, now(), 'Returned (no matching lot)');
    END IF;
    INSERT INTO lot_return_restores (return_txn_id, return_line_id, consumption_id, lot_id, lot_share_id,
                                     qty_base, restocked, unit_cost)
    VALUES (p_return_txn, p_return_line, NULL, v_lot, NULL, v_left, p_restock, v_cogs);
  END IF;

  IF p_restock THEN
    PERFORM lots_private.trim(p_branch, p_product, p_variant, 'Return reconciliation', 'transaction', p_return_txn, NULL);
  END IF;
END;
$$;

-- ── Deleted return: undo return_restore ──────────────────────────────────────
-- Call AFTER branch_inventory has been decreased (restocked lines only).
CREATE OR REPLACE FUNCTION lots_private.reverse_return(p_return_txn uuid, p_user uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r      record;
  v_take numeric;
BEGIN
  FOR r IN
    SELECT * FROM lot_return_restores
    WHERE return_txn_id = p_return_txn AND reversed_at IS NULL
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    IF r.consumption_id IS NOT NULL THEN
      UPDATE lot_consumptions SET qty_returned = GREATEST(0, qty_returned - r.qty_base)
      WHERE id = r.consumption_id;
    END IF;

    -- Take the units back out of the lot/owner they were returned to, as far
    -- as they're still there; anything already resold is handled by trim.
    IF r.restocked AND r.lot_id IS NOT NULL THEN
      PERFORM 1 FROM inventory_lots WHERE id = r.lot_id FOR UPDATE;
      IF r.lot_share_id IS NOT NULL THEN
        SELECT LEAST(r.qty_base, qty_remaining) INTO v_take
        FROM investment_lot_shares WHERE id = r.lot_share_id FOR UPDATE;
        IF v_take > 0 THEN
          UPDATE investment_lot_shares SET qty_remaining = qty_remaining - v_take WHERE id = r.lot_share_id;
          UPDATE inventory_lots SET qty_remaining = qty_remaining - v_take WHERE id = r.lot_id;
        END IF;
      ELSE
        v_take := LEAST(r.qty_base, lots_private.store_qty(r.lot_id));
        IF v_take > 0 THEN
          UPDATE inventory_lots SET qty_remaining = qty_remaining - v_take WHERE id = r.lot_id;
        END IF;
      END IF;
    END IF;

    UPDATE lot_return_restores SET reversed_at = now() WHERE id = r.id;
  END LOOP;

  FOR r IN
    SELECT DISTINCT t.branch_id, tl.product_id, tl.variant_id
    FROM transaction_lines tl JOIN transactions t ON t.id = tl.transaction_id
    WHERE tl.transaction_id = p_return_txn
  LOOP
    PERFORM lots_private.trim(r.branch_id, r.product_id, r.variant_id,
                              'Deleted return', 'transaction_reversal', p_return_txn, p_user);
  END LOOP;
END;
$$;

-- ── Investment figures (all computed) ────────────────────────────────────────
-- Revenue per base unit of a sale line = line total minus its share of the
-- order-level discount, spread over the line's base units. Delivery and
-- other fees stay the store's. "ratio" = share of the sale the customer has
-- paid (credit sales realize as they're collected).
CREATE OR REPLACE FUNCTION lots_private.investment_sale_rows(p_investment uuid)
RETURNS TABLE (
  investment_id     uuid,
  consumption_id    uuid,
  transaction_id    uuid,
  transaction_number text,
  transaction_date  timestamptz,
  product_id        uuid,
  lot_share_id      uuid,
  qty_sold          numeric,
  unit_cost         numeric,
  unit_revenue      numeric,
  paid_ratio        numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    s.investment_id,
    lc.id,
    t.id,
    t.transaction_number,
    t.transaction_date,
    tl.product_id,
    s.id,
    lc.qty_base - lc.qty_returned,
    lc.unit_cost,
    (tl.line_total
      - CASE WHEN t.subtotal > 0
             THEN GREATEST(COALESCE(t.discount_amount, 0) - ld.line_disc, 0) * tl.line_total / t.subtotal
             ELSE 0 END
    ) / NULLIF(lb.base_qty, 0),
    CASE WHEN COALESCE(t.total_amount, 0) > 0
         THEN LEAST(1, GREATEST(0, COALESCE(t.amount_paid, 0) / t.total_amount))
         ELSE 1 END
  FROM lot_consumptions lc
  JOIN investment_lot_shares s ON s.id = lc.lot_share_id
  JOIN transactions t          ON t.id = lc.transaction_id
  JOIN transaction_lines tl    ON tl.id = lc.transaction_line_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(x.qty_base), 0) AS base_qty
    FROM lot_consumptions x
    WHERE x.transaction_line_id = lc.transaction_line_id AND x.reversed_at IS NULL
  ) lb
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(y.discount_amount), 0) AS line_disc
    FROM transaction_lines y WHERE y.transaction_id = t.id
  ) ld
  WHERE lc.reversed_at IS NULL
    AND t.is_deleted = false
    AND (p_investment IS NULL OR s.investment_id = p_investment);
$$;

CREATE OR REPLACE FUNCTION lots_private.investment_figures(p_investment uuid)
RETURNS TABLE (
  investment_id      uuid,
  capital_in         numeric,
  withdrawals        numeric,
  payouts            numeric,
  units_tagged       numeric,
  tagged_cost        numeric,
  units_in_stock     numeric,
  stock_value        numeric,
  units_sold         numeric,
  revenue_collected  numeric,
  capital_returned   numeric,
  profit_earned      numeric,
  buybacks           numeric,
  available          numeric,
  owed_to_investor   numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH inv AS (
    SELECT * FROM investments WHERE p_investment IS NULL OR id = p_investment
  ),
  led AS (
    SELECT l.investment_id,
      COALESCE(SUM(l.amount) FILTER (WHERE l.entry_type IN ('capital', 'top_up')), 0) AS cap,
      COALESCE(SUM(l.amount) FILTER (WHERE l.entry_type = 'withdrawal'), 0)          AS wd,
      COALESCE(SUM(l.amount) FILTER (WHERE l.entry_type = 'payout'), 0)              AS po
    FROM investment_ledger l JOIN inv ON inv.id = l.investment_id
    GROUP BY l.investment_id
  ),
  sh AS (
    SELECT s.investment_id,
      SUM(s.qty_tagged)                  AS units_tagged,
      SUM(s.qty_tagged * s.unit_cost)    AS tagged_cost,
      SUM(s.qty_remaining)               AS in_stock,
      SUM(s.qty_remaining * s.unit_cost) AS stock_value
    FROM investment_lot_shares s JOIN inv ON inv.id = s.investment_id
    GROUP BY s.investment_id
  ),
  sales AS (
    SELECT r.investment_id,
      SUM(r.qty_sold)                                             AS units_sold,
      SUM(r.qty_sold * r.unit_revenue * r.paid_ratio)             AS revenue_collected,
      SUM(r.qty_sold * r.unit_cost * r.paid_ratio)                AS capital_returned,
      SUM(r.qty_sold * (r.unit_revenue - r.unit_cost) * r.paid_ratio
          * inv.profit_share_pct / 100)                           AS profit_earned
    FROM lots_private.investment_sale_rows(p_investment) r
    JOIN inv ON inv.id = r.investment_id
    GROUP BY r.investment_id
  ),
  buy AS (
    SELECT x.investment_id, SUM(x.amt) AS amt FROM (
      SELECT s.investment_id, w.qty_base * w.unit_cost AS amt
      FROM lot_writeoffs w JOIN investment_lot_shares s ON s.id = w.lot_share_id
      UNION ALL
      SELECT s.investment_id, r.qty_base * r.unit_cost
      FROM lot_return_restores r JOIN investment_lot_shares s ON s.id = r.lot_share_id
      WHERE r.restocked = false AND r.reversed_at IS NULL
    ) x JOIN inv ON inv.id = x.investment_id
    GROUP BY x.investment_id
  )
  SELECT
    inv.id,
    COALESCE(led.cap, 0),
    COALESCE(led.wd, 0),
    COALESCE(led.po, 0),
    COALESCE(sh.units_tagged, 0),
    ROUND(COALESCE(sh.tagged_cost, 0), 2),
    COALESCE(sh.in_stock, 0),
    ROUND(COALESCE(sh.stock_value, 0), 2),
    COALESCE(sales.units_sold, 0),
    ROUND(COALESCE(sales.revenue_collected, 0), 2),
    ROUND(COALESCE(sales.capital_returned, 0), 2),
    ROUND(COALESCE(sales.profit_earned, 0), 2),
    ROUND(COALESCE(buy.amt, 0), 2),
    ROUND(
      COALESCE(led.cap, 0) - COALESCE(led.wd, 0)
      - COALESCE(sh.tagged_cost, 0)
      + COALESCE(sales.capital_returned, 0)
      + COALESCE(buy.amt, 0)
      + CASE WHEN inv.reinvest_profit THEN COALESCE(sales.profit_earned, 0) - COALESCE(led.po, 0) ELSE 0 END
    , 2),
    ROUND(CASE WHEN inv.reinvest_profit THEN 0
               ELSE COALESCE(sales.profit_earned, 0) - COALESCE(led.po, 0) END, 2)
  FROM inv
  LEFT JOIN led   ON led.investment_id   = inv.id
  LEFT JOIN sh    ON sh.investment_id    = inv.id
  LEFT JOIN sales ON sales.investment_id = inv.id
  LEFT JOIN buy   ON buy.investment_id   = inv.id;
$$;

-- ── Tag / untag (core, no role check; public wrappers check admin) ───────────
CREATE OR REPLACE FUNCTION lots_private.tag(
  p_investment uuid, p_lot uuid, p_qty numeric, p_user uuid, p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inv      investments%ROWTYPE;
  v_lot      inventory_lots%ROWTYPE;
  v_untagged numeric;
  v_cost     numeric;
  v_avail    numeric;
  v_price    numeric;
  v_id       uuid;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity to tag must be greater than zero' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_inv FROM investments WHERE id = p_investment FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investment not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_inv.status <> 'active' THEN
    RAISE EXCEPTION 'Investment % is closed', v_inv.code USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_lot FROM inventory_lots WHERE id = p_lot FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock lot not found' USING ERRCODE = 'no_data_found';
  END IF;

  -- Only units still unsold and not tagged to anyone (covers late tagging).
  v_untagged := lots_private.store_qty(p_lot);
  IF p_qty > v_untagged THEN
    RAISE EXCEPTION 'Only % unit(s) of this delivery are still unsold and untagged', ROUND(v_untagged, 4)
      USING ERRCODE = 'check_violation';
  END IF;

  v_cost := ROUND(p_qty * v_lot.unit_cost, 2);
  SELECT f.available INTO v_avail FROM lots_private.investment_figures(p_investment) f;
  IF v_cost > COALESCE(v_avail, 0) THEN
    RAISE EXCEPTION 'Investment % has ₱% available; tagging these units costs ₱%',
      v_inv.code, ROUND(COALESCE(v_avail, 0), 2), v_cost
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT current_selling_price INTO v_price FROM products WHERE id = v_lot.product_id;

  INSERT INTO investment_lot_shares (investment_id, lot_id, qty_tagged, qty_remaining, unit_cost,
                                     price_at_tag, tagged_by, notes)
  VALUES (p_investment, p_lot, p_qty, p_qty, v_lot.unit_cost, v_price, p_user, p_notes)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── Lot ↔ stock check ────────────────────────────────────────────────────────
-- Rows here mean lots and on-hand stock disagree for a product/branch.
CREATE OR REPLACE VIEW lot_stock_mismatch WITH (security_invoker = true) AS
  SELECT
    bi.branch_id, bi.product_id, bi.variant_id,
    bi.quantity_on_hand,
    COALESCE(l.lots_remaining, 0) AS lots_remaining,
    COALESCE(l.lots_remaining, 0) - GREATEST(bi.quantity_on_hand, 0) AS difference
  FROM branch_inventory bi
  LEFT JOIN (
    SELECT branch_id, product_id, variant_id, SUM(qty_remaining) AS lots_remaining
    FROM inventory_lots GROUP BY branch_id, product_id, variant_id
  ) l ON l.branch_id = bi.branch_id AND l.product_id = bi.product_id
     AND l.variant_id IS NOT DISTINCT FROM bi.variant_id
  WHERE ABS(COALESCE(l.lots_remaining, 0) - GREATEST(bi.quantity_on_hand, 0)) > 0.0001;

-- ── Public admin RPCs ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tag_investment(
  p_investment_id uuid, p_lot_id uuid, p_qty numeric, p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM lots_private.assert_admin();
  RETURN lots_private.tag(p_investment_id, p_lot_id, p_qty, auth.uid(), p_notes);
END;
$$;

CREATE OR REPLACE FUNCTION public.untag_investment(p_share_id uuid, p_qty numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_share investment_lot_shares%ROWTYPE;
BEGIN
  PERFORM lots_private.assert_admin();
  SELECT * INTO v_share FROM investment_lot_shares WHERE id = p_share_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tag not found' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM 1 FROM investments WHERE id = v_share.investment_id FOR UPDATE;
  IF p_qty IS NULL OR p_qty <= 0 OR p_qty > v_share.qty_remaining THEN
    RAISE EXCEPTION 'Can only untag up to % unsold unit(s)', ROUND(v_share.qty_remaining, 4)
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE investment_lot_shares
  SET qty_tagged = qty_tagged - p_qty, qty_remaining = qty_remaining - p_qty
  WHERE id = p_share_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_investment_figures(p_investment_id uuid DEFAULT NULL)
RETURNS TABLE (
  investment_id uuid, capital_in numeric, withdrawals numeric, payouts numeric,
  units_tagged numeric, tagged_cost numeric, units_in_stock numeric, stock_value numeric,
  units_sold numeric, revenue_collected numeric, capital_returned numeric, profit_earned numeric,
  buybacks numeric, available numeric, owed_to_investor numeric
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM lots_private.assert_admin();
  RETURN QUERY SELECT * FROM lots_private.investment_figures(p_investment_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_investment_sales(p_investment_id uuid)
RETURNS TABLE (
  consumption_id uuid, transaction_id uuid, transaction_number text, transaction_date timestamptz,
  product_id uuid, product_name text, lot_share_id uuid, qty_sold numeric, unit_cost numeric,
  unit_revenue numeric, paid_ratio numeric, investor_share numeric
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM lots_private.assert_admin();
  RETURN QUERY
    SELECT r.consumption_id, r.transaction_id, r.transaction_number, r.transaction_date,
           r.product_id, p.name, r.lot_share_id, r.qty_sold, r.unit_cost, r.unit_revenue, r.paid_ratio,
           ROUND(r.qty_sold * (r.unit_cost + (r.unit_revenue - r.unit_cost) * i.profit_share_pct / 100)
                 * r.paid_ratio, 2)
    FROM lots_private.investment_sale_rows(p_investment_id) r
    JOIN investments i ON i.id = r.investment_id
    JOIN products p    ON p.id = r.product_id
    WHERE r.qty_sold > 0
    ORDER BY r.transaction_date DESC;
END;
$$;

-- Lots of a PO (or one product) with how much is still taggable.
CREATE OR REPLACE FUNCTION public.get_taggable_lots(p_po_id uuid DEFAULT NULL, p_product_id uuid DEFAULT NULL)
RETURNS TABLE (
  lot_id uuid, po_id uuid, po_line_id uuid, product_id uuid, product_name text,
  branch_id uuid, received_at timestamptz, unit_cost numeric,
  qty_received numeric, qty_remaining numeric, qty_tagged_remaining numeric, qty_taggable numeric
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM lots_private.assert_admin();
  RETURN QUERY
    SELECT l.id, l.po_id, l.po_line_id, l.product_id, p.name, l.branch_id, l.received_at, l.unit_cost,
           l.qty_received, l.qty_remaining,
           COALESCE(s.tagged, 0),
           l.qty_remaining - COALESCE(s.tagged, 0)
    FROM inventory_lots l
    JOIN products p ON p.id = l.product_id
    LEFT JOIN (
      SELECT lot_id, SUM(qty_remaining) AS tagged FROM investment_lot_shares GROUP BY lot_id
    ) s ON s.lot_id = l.id
    WHERE (p_po_id IS NULL OR l.po_id = p_po_id)
      AND (p_product_id IS NULL OR l.product_id = p_product_id)
      AND (p_po_id IS NOT NULL OR p_product_id IS NOT NULL)
    ORDER BY l.received_at, p.name;
END;
$$;

-- Total investor profit share (collected so far) on sales dated in the range
-- (Manila dates). For the P&L, so roles that can view reports may call it;
-- it returns one number and no investor details.
CREATE OR REPLACE FUNCTION public.get_investor_profit_share(p_date_from date, p_date_to date)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager', 'accountant')) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT COALESCE(SUM(r.qty_sold * (r.unit_revenue - r.unit_cost) * r.paid_ratio * i.profit_share_pct / 100), 0)
  INTO v
  FROM lots_private.investment_sale_rows(NULL) r
  JOIN investments i ON i.id = r.investment_id
  WHERE (r.transaction_date AT TIME ZONE 'Asia/Manila')::date BETWEEN p_date_from AND p_date_to;
  RETURN ROUND(v, 2);
END;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA lots_private TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_investor_profit_share(date, date)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.tag_investment(uuid, uuid, numeric, text)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.untag_investment(uuid, numeric)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_investment_figures(uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_investment_sales(uuid)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_taggable_lots(uuid, uuid)                 TO authenticated;
GRANT SELECT ON lot_stock_mismatch TO authenticated;
