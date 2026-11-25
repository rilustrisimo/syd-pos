-- 00114: Business Insights (admin only)
--
-- Built to stay light as years of data pile up:
--   • Rollup tables hold pre-summed figures (per day, per product-week,
--     per customer-day, stock-outs per product-week). They are filled once,
--     then only the last ~week (plus any older day whose sales were edited,
--     deleted or back-dated) is recalculated — at most every 10 minutes —
--     by insights_refresh().
--   • insights_data() reads the rollups (plus a few small live tables) and
--     returns everything in ONE JSON value per page load.
--   • A tiny trigger on transactions notes an old day as "dirty" when a sale
--     on it changes (one small insert, only on such edits).
-- Revenue follows get_pl_revenue_cogs_daily exactly (returns netted,
-- deleted excluded, Manila dates) so Insights matches the P&L report.
--
-- Safe to re-run (drops/recreates its own objects; rollups rebuild).

-- ── Clean up any earlier version of this migration ─────────────────────────
DROP FUNCTION IF EXISTS public.insights_base_qty(uuid, uuid, numeric);
DROP FUNCTION IF EXISTS public.insights_daily(date, date);
DROP FUNCTION IF EXISTS public.insights_hourly(date, date, uuid);
DROP FUNCTION IF EXISTS public.insights_payment_mix(date, date, uuid);
DROP FUNCTION IF EXISTS public.insights_product_weekly(date, date, uuid);
DROP FUNCTION IF EXISTS public.insights_stockout_spans(date, date);
DROP FUNCTION IF EXISTS public.insights_customers();
DROP FUNCTION IF EXISTS public.insights_customer_months();
DROP FUNCTION IF EXISTS public.insights_inventory(uuid);
DROP FUNCTION IF EXISTS public.insights_po_leadtimes(date, date);
DROP FUNCTION IF EXISTS public.insights_below_cost(date, date, uuid);
DROP FUNCTION IF EXISTS public.insights_basket_pairs(date, date, int);
DROP FUNCTION IF EXISTS public.insights_adjustments(date, date, uuid);
DROP FUNCTION IF EXISTS public.insights_quotations(date, date);
DROP FUNCTION IF EXISTS public.insights_deliveries(date, date, uuid);
DROP FUNCTION IF EXISTS public.insights_ap_open();
DROP FUNCTION IF EXISTS public.insights_data(date, date, date, date, uuid);
DROP INDEX IF EXISTS public.inventory_movements_prod_branch_created;

-- ── Guard ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.insights_assert_admin()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Insights are for admins only' USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

-- ── Rollup tables (RLS on, no policies: read only via the functions) ───────
CREATE TABLE IF NOT EXISTS public.insights_r_daily (
  day date NOT NULL, branch_id uuid NOT NULL,
  revenue numeric NOT NULL DEFAULT 0, cogs numeric NOT NULL DEFAULT 0, discounts numeric NOT NULL DEFAULT 0,
  sales_count int NOT NULL DEFAULT 0, return_amount numeric NOT NULL DEFAULT 0,
  delivery_count int NOT NULL DEFAULT 0, delivery_fees numeric NOT NULL DEFAULT 0,
  gov_revenue numeric NOT NULL DEFAULT 0,
  credit_sales numeric NOT NULL DEFAULT 0,   -- part of sales not paid on the day of sale (sold on utang)
  customers int NOT NULL DEFAULT 0, new_customers int NOT NULL DEFAULT 0, units_lines int NOT NULL DEFAULT 0,
  PRIMARY KEY (day, branch_id)
);
CREATE TABLE IF NOT EXISTS public.insights_r_hour (
  day date NOT NULL, branch_id uuid NOT NULL, hour int NOT NULL,
  revenue numeric NOT NULL DEFAULT 0, cnt int NOT NULL DEFAULT 0,
  PRIMARY KEY (day, branch_id, hour)
);
CREATE TABLE IF NOT EXISTS public.insights_r_product_week (
  week date NOT NULL, branch_id uuid NOT NULL, product_id uuid NOT NULL,
  qty_base numeric NOT NULL DEFAULT 0, revenue numeric NOT NULL DEFAULT 0, cogs numeric NOT NULL DEFAULT 0,
  discounts numeric NOT NULL DEFAULT 0, orders int NOT NULL DEFAULT 0,
  below_cost_lines int NOT NULL DEFAULT 0, below_cost_loss numeric NOT NULL DEFAULT 0,
  last_day date,
  PRIMARY KEY (week, branch_id, product_id)
);
CREATE INDEX IF NOT EXISTS insights_r_product_week_product ON public.insights_r_product_week (product_id, week);
CREATE TABLE IF NOT EXISTS public.insights_r_stock_week (
  week date NOT NULL, branch_id uuid NOT NULL, product_id uuid NOT NULL,
  out_days int NOT NULL DEFAULT 0,
  qty_lost numeric NOT NULL DEFAULT 0, qty_found numeric NOT NULL DEFAULT 0, value_lost numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (week, branch_id, product_id)
);
CREATE TABLE IF NOT EXISTS public.insights_r_customer_day (
  day date NOT NULL, customer_id uuid NOT NULL,
  revenue numeric NOT NULL DEFAULT 0, profit numeric NOT NULL DEFAULT 0, orders int NOT NULL DEFAULT 0,
  PRIMARY KEY (customer_id, day)
);
CREATE INDEX IF NOT EXISTS insights_r_customer_day_day ON public.insights_r_customer_day (day);
CREATE TABLE IF NOT EXISTS public.insights_dirty_days (day date PRIMARY KEY);
CREATE TABLE IF NOT EXISTS public.insights_rollup_state (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  refreshed_through date, refreshed_at timestamptz, last_ms int
);
-- Re-running this migration rebuilds the rollups from scratch.
DELETE FROM public.insights_rollup_state;

ALTER TABLE public.insights_r_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights_r_hour ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights_r_product_week ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights_r_stock_week ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights_r_customer_day ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights_dirty_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights_rollup_state ENABLE ROW LEVEL SECURITY;

-- ── Note old days whose sales change ────────────────────────────────────────
-- The last 8 days are always recalculated, so only older days are noted.
CREATE OR REPLACE FUNCTION public.insights_mark_dirty()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cut date := (now() AT TIME ZONE 'Asia/Manila')::date - 8;
BEGIN
  IF TG_OP <> 'INSERT' AND (OLD.transaction_date AT TIME ZONE 'Asia/Manila')::date < v_cut THEN
    INSERT INTO insights_dirty_days (day) VALUES ((OLD.transaction_date AT TIME ZONE 'Asia/Manila')::date) ON CONFLICT DO NOTHING;
  END IF;
  IF TG_OP <> 'DELETE' AND (NEW.transaction_date AT TIME ZONE 'Asia/Manila')::date < v_cut THEN
    INSERT INTO insights_dirty_days (day) VALUES ((NEW.transaction_date AT TIME ZONE 'Asia/Manila')::date) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS insights_mark_dirty ON public.transactions;
CREATE TRIGGER insights_mark_dirty AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.insights_mark_dirty();

-- ── Incremental refresh ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.insights_refresh(p_force boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_state insights_rollup_state%ROWTYPE;
  v_full boolean;
  v_from date;
  v_dirty int;
  v_t0 timestamptz := clock_timestamp();
  v_days int; v_weeks int;
BEGIN
  PERFORM insights_assert_admin();
  -- One refresh at a time; anyone else just reads the current rollups.
  IF NOT pg_try_advisory_xact_lock(hashtext('insights_refresh')) THEN
    RETURN jsonb_build_object('skipped', 'busy');
  END IF;
  SELECT * INTO v_state FROM insights_rollup_state WHERE id = 1;
  SELECT count(*) INTO v_dirty FROM insights_dirty_days;
  IF NOT p_force AND v_state.refreshed_at > now() - interval '10 minutes' AND v_dirty = 0 THEN
    RETURN jsonb_build_object('skipped', 'fresh', 'refreshed_at', v_state.refreshed_at);
  END IF;

  v_full := p_force OR v_state.refreshed_through IS NULL;
  IF v_full THEN
    SELECT LEAST(
      COALESCE((SELECT (min(transaction_date) AT TIME ZONE 'Asia/Manila')::date FROM transactions), v_today),
      COALESCE((SELECT (min(created_at) AT TIME ZONE 'Asia/Manila')::date FROM inventory_movements), v_today)
    ) INTO v_from;
    TRUNCATE insights_r_daily, insights_r_hour, insights_r_product_week, insights_r_stock_week, insights_r_customer_day;
  ELSE
    v_from := LEAST(v_state.refreshed_through, v_today) - 7;
  END IF;
  v_from := date_trunc('week', v_from)::date;

  -- Weeks to rebuild: the recent range + weeks holding dirty days.
  PERFORM set_config('client_min_messages', 'warning', true);
  DROP TABLE IF EXISTS _iw, _id, _it, _ila, _ipay, _ifirst;
  CREATE TEMP TABLE _iw ON COMMIT DROP AS
    SELECT DISTINCT date_trunc('week', d)::date AS week FROM (
      SELECT generate_series(v_from, v_today, interval '1 day')::date AS d
      UNION SELECT day FROM insights_dirty_days
    ) x;
  CREATE TEMP TABLE _id ON COMMIT DROP AS
    SELECT (w.week + k)::date AS day FROM _iw w, generate_series(0, 6) k WHERE w.week + k <= v_today;

  -- Sales/returns of those days (index range scans on transaction_date).
  CREATE TEMP TABLE _it ON COMMIT DROP AS
  SELECT t.id, t.branch_id, t.customer_id, t.transaction_type::text AS ttype,
    CASE WHEN t.transaction_type = 'return' THEN -1 ELSE 1 END AS sign,
    (t.transaction_date AT TIME ZONE 'Asia/Manila')::date AS d,
    EXTRACT(hour FROM t.transaction_date AT TIME ZONE 'Asia/Manila')::int AS hr,
    COALESCE(t.subtotal,0) + COALESCE(t.delivery_fee,0) + COALESCE(t.other_fees,0) - COALESCE(t.discount_amount,0) AS rev0,
    COALESCE(t.discount_amount,0) AS disc, COALESCE(t.delivery_fee,0) AS dfee,
    t.delivery_type::text AS dtype, COALESCE(t.is_government_sale, false) AS gov, COALESCE(t.total_amount,0) AS total
  FROM _id
  JOIN transactions t
    ON t.transaction_date >= (_id.day::timestamp AT TIME ZONE 'Asia/Manila')
   AND t.transaction_date <  ((_id.day + 1)::timestamp AT TIME ZONE 'Asia/Manila')
  WHERE t.is_deleted = false AND t.transaction_type IN ('sale', 'return');

  CREATE TEMP TABLE _ila ON COMMIT DROP AS
  SELECT tl.transaction_id,
    SUM(COALESCE(tl.quantity,0) * COALESCE(tl.cogs_per_unit,0)) AS cogs,
    SUM(COALESCE(tl.discount_amount,0)) AS line_disc,
    SUM(COALESCE(tl.line_profit,0)) AS profit, COUNT(*) AS n
  FROM transaction_lines tl JOIN _it ON _it.id = tl.transaction_id
  GROUP BY 1;

  CREATE TEMP TABLE _ipay ON COMMIT DROP AS
  SELECT p.transaction_id, SUM(p.amount) AS paid
  FROM transaction_payments p JOIN _it ON _it.id = p.transaction_id AND _it.ttype = 'sale'
  WHERE p.payment_method::text <> 'credit' AND (p.payment_date AT TIME ZONE 'Asia/Manila')::date = _it.d
  GROUP BY 1;

  -- Customer-days
  DELETE FROM insights_r_customer_day WHERE day IN (SELECT day FROM _id);
  INSERT INTO insights_r_customer_day (day, customer_id, revenue, profit, orders)
  SELECT _it.d, _it.customer_id, SUM(_it.sign * _it.total), SUM(_it.sign * COALESCE(_ila.profit,0)),
    COUNT(*) FILTER (WHERE _it.ttype = 'sale')
  FROM _it LEFT JOIN _ila ON _ila.transaction_id = _it.id
  WHERE _it.customer_id IS NOT NULL
  GROUP BY 1, 2;

  CREATE TEMP TABLE _ifirst ON COMMIT DROP AS
  SELECT c.customer_id, MIN(c.day) AS first_day FROM insights_r_customer_day c
  WHERE c.orders > 0 AND c.customer_id IN (SELECT DISTINCT customer_id FROM _it)
  GROUP BY 1;

  -- Days
  DELETE FROM insights_r_daily WHERE day IN (SELECT day FROM _id);
  INSERT INTO insights_r_daily (day, branch_id, revenue, cogs, discounts, sales_count, return_amount,
    delivery_count, delivery_fees, gov_revenue, credit_sales, customers, new_customers, units_lines)
  SELECT _it.d, _it.branch_id,
    SUM(_it.sign * (_it.rev0 + COALESCE(_ila.line_disc,0))),
    SUM(_it.sign * COALESCE(_ila.cogs,0)),
    SUM(CASE WHEN _it.ttype = 'sale' THEN _it.disc ELSE 0 END),
    COUNT(*) FILTER (WHERE _it.ttype = 'sale'),
    SUM(CASE WHEN _it.ttype = 'return' THEN _it.rev0 + COALESCE(_ila.line_disc,0) ELSE 0 END),
    COUNT(*) FILTER (WHERE _it.ttype = 'sale' AND _it.dtype = 'delivery'),
    SUM(CASE WHEN _it.ttype = 'sale' AND _it.dtype = 'delivery' THEN _it.dfee ELSE 0 END),
    SUM(CASE WHEN _it.gov THEN _it.sign * (_it.rev0 + COALESCE(_ila.line_disc,0)) ELSE 0 END),
    SUM(CASE WHEN _it.ttype = 'sale' THEN GREATEST(_it.total - COALESCE(_ipay.paid,0), 0) ELSE 0 END),
    COUNT(DISTINCT _it.customer_id) FILTER (WHERE _it.ttype = 'sale'),
    COUNT(DISTINCT _it.customer_id) FILTER (WHERE _it.ttype = 'sale' AND _ifirst.first_day = _it.d),
    SUM(CASE WHEN _it.ttype = 'sale' THEN COALESCE(_ila.n,0) ELSE 0 END)
  FROM _it
  LEFT JOIN _ila ON _ila.transaction_id = _it.id
  LEFT JOIN _ipay ON _ipay.transaction_id = _it.id
  LEFT JOIN _ifirst ON _ifirst.customer_id = _it.customer_id
  GROUP BY 1, 2;

  -- Hours
  DELETE FROM insights_r_hour WHERE day IN (SELECT day FROM _id);
  INSERT INTO insights_r_hour (day, branch_id, hour, revenue, cnt)
  SELECT d, branch_id, hr, SUM(total), COUNT(*) FROM _it WHERE ttype = 'sale' GROUP BY 1, 2, 3;

  -- Product-weeks (base units, same conversion rule as the sale function)
  DELETE FROM insights_r_product_week WHERE week IN (SELECT week FROM _iw);
  INSERT INTO insights_r_product_week (week, branch_id, product_id, qty_base, revenue, cogs, discounts,
    orders, below_cost_lines, below_cost_loss, last_day)
  SELECT date_trunc('week', _it.d)::date, _it.branch_id, tl.product_id,
    SUM(_it.sign * CASE
      WHEN p.base_uom_id = tl.uom_id THEN tl.quantity
      WHEN su.conversion_factor > 0 THEN tl.quantity / su.conversion_factor
      WHEN p.selling_uom_id = tl.uom_id AND p.conversion_factor > 0 THEN tl.quantity / p.conversion_factor
      ELSE tl.quantity END),
    SUM(_it.sign * tl.line_total),
    SUM(_it.sign * tl.quantity * tl.cogs_per_unit),
    SUM(CASE WHEN _it.sign = 1 THEN tl.discount_amount ELSE 0 END),
    COUNT(DISTINCT _it.id) FILTER (WHERE _it.sign = 1),
    COUNT(*) FILTER (WHERE _it.sign = 1 AND tl.line_total < tl.quantity * tl.cogs_per_unit - 0.01),
    SUM(CASE WHEN _it.sign = 1 AND tl.line_total < tl.quantity * tl.cogs_per_unit - 0.01
             THEN tl.quantity * tl.cogs_per_unit - tl.line_total ELSE 0 END),
    MAX(_it.d) FILTER (WHERE _it.sign = 1)
  FROM _it
  JOIN transaction_lines tl ON tl.transaction_id = _it.id
  JOIN products p ON p.id = tl.product_id
  LEFT JOIN LATERAL (
    SELECT psu.conversion_factor FROM product_selling_units psu
    WHERE psu.product_id = tl.product_id AND psu.uom_id = tl.uom_id AND psu.is_active = true LIMIT 1
  ) su ON true
  GROUP BY 1, 2, 3;

  -- Stock-out days + adjustments per product-week. Stock movements are
  -- append-only (edits/deletes post new movements today), so only the
  -- recent range ever changes.
  DELETE FROM insights_r_stock_week WHERE week >= v_from;
  WITH mv AS (
    SELECT m.product_id, m.branch_id, m.created_at, (m.created_at AT TIME ZONE 'Asia/Manila')::date AS d,
      m.quantity_after AS qa, COALESCE(m.quantity_before, m.quantity_after - m.quantity_change) AS qb,
      m.quantity_change AS qc, m.movement_type::text AS mt
    FROM inventory_movements m
    WHERE m.variant_id IS NULL AND m.created_at >= (v_from::timestamp AT TIME ZONE 'Asia/Manila')
  ),
  eod AS (
    SELECT DISTINCT ON (product_id, branch_id, d) product_id, branch_id, d, qa AS q
    FROM mv ORDER BY product_id, branch_id, d, created_at DESC
  ),
  opening AS (  -- stock before the first movement in range (not on a full rebuild: the product didn't exist yet)
    SELECT DISTINCT ON (product_id, branch_id) product_id, branch_id, (v_from - 1) AS d, qb AS q
    FROM mv WHERE NOT v_full ORDER BY product_id, branch_id, created_at ASC
  ),
  still AS (    -- no movement in range: stock unchanged; only out-of-stock items that sold in the last 26 weeks
    SELECT bi.product_id, bi.branch_id, (v_from - 1) AS d, bi.quantity_on_hand AS q
    FROM branch_inventory bi
    WHERE bi.variant_id IS NULL AND bi.quantity_on_hand <= 0
      AND NOT EXISTS (SELECT 1 FROM mv WHERE mv.product_id = bi.product_id AND mv.branch_id = bi.branch_id)
      AND EXISTS (SELECT 1 FROM insights_r_product_week pw
                  WHERE pw.product_id = bi.product_id AND pw.branch_id = bi.branch_id AND pw.week >= v_from - 182)
  ),
  pts AS (SELECT * FROM eod UNION ALL SELECT * FROM opening UNION ALL SELECT * FROM still),
  seg AS (
    SELECT product_id, branch_id, d AS s, q,
      COALESCE(LEAD(d) OVER (PARTITION BY product_id, branch_id ORDER BY d) - 1, v_today) AS e
    FROM pts
  ),
  wk AS (SELECT generate_series(v_from, v_today, interval '7 day')::date AS week),
  outw AS (
    SELECT wk.week, seg.product_id, seg.branch_id,
      SUM(GREATEST(0, LEAST(seg.e, wk.week + 6, v_today) - GREATEST(seg.s, wk.week) + 1))::int AS out_days
    FROM seg JOIN wk ON seg.s <= wk.week + 6 AND seg.e >= wk.week
    WHERE seg.q <= 0
    GROUP BY 1, 2, 3
  ),
  adj AS (
    SELECT date_trunc('week', mv.d)::date AS week, mv.product_id, mv.branch_id,
      SUM(CASE WHEN qc < 0 THEN -qc ELSE 0 END) AS lost,
      SUM(CASE WHEN qc > 0 THEN qc ELSE 0 END) AS found,
      SUM(CASE WHEN qc < 0 THEN -qc * COALESCE(p.base_unit_cost, 0) ELSE 0 END) AS vlost
    FROM mv JOIN products p ON p.id = mv.product_id
    WHERE mv.mt = 'adjustment'
    GROUP BY 1, 2, 3
  )
  INSERT INTO insights_r_stock_week (week, branch_id, product_id, out_days, qty_lost, qty_found, value_lost)
  SELECT COALESCE(o.week, a.week), COALESCE(o.branch_id, a.branch_id), COALESCE(o.product_id, a.product_id),
    COALESCE(o.out_days, 0), COALESCE(a.lost, 0), COALESCE(a.found, 0), COALESCE(a.vlost, 0)
  FROM (SELECT * FROM outw WHERE out_days > 0) o
  FULL JOIN adj a ON a.week = o.week AND a.product_id = o.product_id AND a.branch_id = o.branch_id;

  SELECT count(*) INTO v_days FROM _id;
  SELECT count(*) INTO v_weeks FROM _iw;
  DELETE FROM insights_dirty_days WHERE day IN (SELECT day FROM _id);
  INSERT INTO insights_rollup_state (id, refreshed_through, refreshed_at, last_ms)
  VALUES (1, v_today, now(), (extract(epoch FROM clock_timestamp() - v_t0) * 1000)::int)
  ON CONFLICT (id) DO UPDATE SET refreshed_through = EXCLUDED.refreshed_through,
    refreshed_at = EXCLUDED.refreshed_at, last_ms = EXCLUDED.last_ms;

  RETURN jsonb_build_object('full', v_full, 'days', v_days, 'weeks', v_weeks,
    'ms', (extract(epoch FROM clock_timestamp() - v_t0) * 1000)::int);
END;
$$;

-- ── Everything the Insights page needs, in one JSON value ──────────────────
-- p_hist_from..p_to: history for trends/forecasts; p_range_from..p_range_to:
-- the selected period. Product weekly series are capped at 104 weeks and
-- sent as compact arrays; "bought together" covers at most the last 90 days
-- of the period.
CREATE OR REPLACE FUNCTION public.insights_data(
  p_hist_from date, p_to date, p_range_from date, p_range_to date, p_branch uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r jsonb;
  v_last_week date := date_trunc('week', p_to)::date - 7;           -- last full week
  v_first_week date;
  v_cap date := GREATEST(p_range_from, p_range_to - 89);
  v_nweeks int;
BEGIN
  PERFORM insights_assert_admin();
  SELECT GREATEST(COALESCE(min(week), v_last_week), v_last_week - 7 * 103, date_trunc('week', p_hist_from)::date)
    INTO v_first_week FROM insights_r_product_week;
  v_nweeks := (v_last_week - v_first_week) / 7 + 1;

  SELECT jsonb_build_object(
    'refreshed_at', (SELECT refreshed_at FROM insights_rollup_state WHERE id = 1),

    'daily', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'ph_date', day, 'branch_id', branch_id, 'revenue', revenue, 'cogs', cogs, 'discounts', discounts,
        'sales_count', sales_count, 'return_amount', return_amount, 'delivery_count', delivery_count,
        'delivery_fees', delivery_fees, 'gov_revenue', gov_revenue, 'credit_sales', credit_sales,
        'customers', customers, 'new_customers', new_customers, 'units_lines', units_lines) ORDER BY day), '[]')
      FROM insights_r_daily WHERE day BETWEEN p_hist_from AND p_to AND (p_branch IS NULL OR branch_id = p_branch)),

    'hourly', (SELECT COALESCE(jsonb_agg(x), '[]') FROM (
        SELECT EXTRACT(dow FROM day)::int AS dow, hour, SUM(revenue) AS revenue, SUM(cnt) AS sales_count
        FROM insights_r_hour WHERE day BETWEEN p_range_from AND p_range_to AND (p_branch IS NULL OR branch_id = p_branch)
        GROUP BY 1, 2) x),

    'product_range', (SELECT COALESCE(jsonb_agg(x), '[]') FROM (
        SELECT product_id, SUM(qty_base) AS qty_base, SUM(revenue) AS revenue, SUM(cogs) AS cogs,
          SUM(discounts) AS discounts, SUM(orders) AS orders,
          SUM(below_cost_lines) AS below_cost_lines, SUM(below_cost_loss) AS below_cost_loss
        FROM insights_r_product_week
        WHERE week BETWEEN date_trunc('week', p_range_from)::date AND p_range_to AND (p_branch IS NULL OR branch_id = p_branch)
        GROUP BY 1) x),

    'weeks', (SELECT COALESCE(jsonb_agg(w::date ORDER BY w), '[]') FROM generate_series(v_first_week, v_last_week, interval '7 day') w),

    -- Sparse: per product, the week numbers (1 = first week) that had sales / stock-outs.
    'series', (
      WITH pw AS (SELECT ((week - v_first_week) / 7 + 1)::int AS i, product_id,
                    round(SUM(qty_base), 3) AS q, round(SUM(revenue), 2) AS rv, round(SUM(cogs), 2) AS cg
                  FROM insights_r_product_week
                  WHERE week BETWEEN v_first_week AND v_last_week AND (p_branch IS NULL OR branch_id = p_branch)
                  GROUP BY 1, 2),
      sw AS (SELECT ((week - v_first_week) / 7 + 1)::int AS i, product_id, MAX(out_days) AS o
             FROM insights_r_stock_week
             WHERE out_days > 0 AND week BETWEEN v_first_week AND v_last_week AND (p_branch IS NULL OR branch_id = p_branch)
             GROUP BY 1, 2),
      ps AS (SELECT product_id, array_agg(i ORDER BY i) AS wi, array_agg(q ORDER BY i) AS q,
               -- revenue/cost only for the last 16 weeks (margin trend, price vs volume)
               COALESCE(array_agg(i ORDER BY i) FILTER (WHERE i > v_nweeks - 16), '{}') AS ri,
               COALESCE(array_agg(rv ORDER BY i) FILTER (WHERE i > v_nweeks - 16), '{}') AS rv,
               COALESCE(array_agg(cg ORDER BY i) FILTER (WHERE i > v_nweeks - 16), '{}') AS cg
             FROM pw GROUP BY 1),
      ss AS (SELECT product_id, array_agg(i ORDER BY i) AS oi, array_agg(o ORDER BY i) AS o FROM sw
             WHERE product_id IN (SELECT product_id FROM ps) GROUP BY 1)
      SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id', ps.product_id, 'wi', ps.wi, 'q', ps.q, 'ri', ps.ri, 'rv', ps.rv, 'cg', ps.cg,
               'oi', COALESCE(ss.oi, '{}'), 'o', COALESCE(ss.o, '{}'))), '[]')
      FROM ps LEFT JOIN ss ON ss.product_id = ps.product_id),

    'category_months', (SELECT COALESCE(jsonb_agg(x), '[]') FROM (
        SELECT COALESCE(pc.name, 'Uncategorized')::text AS category, date_trunc('month', pw.week + 3)::date AS month,
          SUM(pw.revenue) AS revenue
        FROM insights_r_product_week pw
        JOIN products p ON p.id = pw.product_id
        LEFT JOIN product_categories pc ON pc.id = p.category_id
        WHERE pw.week BETWEEN date_trunc('week', p_hist_from)::date AND p_to AND (p_branch IS NULL OR pw.branch_id = p_branch)
        GROUP BY 1, 2) x),

    'customers', (SELECT COALESCE(jsonb_agg(x), '[]') FROM (
        WITH days AS (SELECT customer_id, day FROM insights_r_customer_day WHERE orders > 0),
        gaps AS (
          SELECT customer_id, percentile_cont(0.5) WITHIN GROUP (ORDER BY gap)::numeric AS med
          FROM (SELECT customer_id, day - LAG(day) OVER (PARTITION BY customer_id ORDER BY day) AS gap FROM days) g
          WHERE gap IS NOT NULL GROUP BY 1
        ),
        agg AS (
          SELECT customer_id,
            MIN(day) FILTER (WHERE orders > 0) AS first_date, MAX(day) FILTER (WHERE orders > 0) AS last_date,
            SUM(orders) AS orders, COUNT(*) FILTER (WHERE orders > 0) AS buy_days,
            SUM(revenue) AS revenue, SUM(profit) AS profit,
            COALESCE(SUM(revenue) FILTER (WHERE day > p_to - 90), 0) AS rev_90,
            COALESCE(SUM(revenue) FILTER (WHERE day <= p_to - 90 AND day > p_to - 180), 0) AS rev_prev_90
          FROM insights_r_customer_day GROUP BY 1
        ),
        ar AS (   -- live: only unpaid sales are read (indexed by payment_status)
          SELECT t.customer_id, SUM(GREATEST(t.total_amount - t.amount_paid, 0)) AS open_ar,
            MIN((t.transaction_date AT TIME ZONE 'Asia/Manila')::date) FILTER (WHERE t.total_amount - t.amount_paid > 0.009) AS oldest_unpaid
          FROM transactions t
          WHERE t.payment_status <> 'paid' AND t.is_deleted = false AND t.transaction_type = 'sale'
          GROUP BY 1
        )
        SELECT c.id AS customer_id, c.name::text AS name, c.customer_type::text AS customer_type, c.phone::text AS phone,
          c.credit_limit, (c.name ILIKE 'walk%in%' OR c.name ILIKE 'cash customer%') AS is_walkin,
          a.first_date, a.last_date, a.orders, a.buy_days, a.revenue, a.profit, a.rev_90, a.rev_prev_90,
          g.med AS median_gap_days, COALESCE(ar.open_ar, 0) AS open_ar, ar.oldest_unpaid
        FROM agg a JOIN customers c ON c.id = a.customer_id
        LEFT JOIN gaps g ON g.customer_id = a.customer_id
        LEFT JOIN ar ON ar.customer_id = a.customer_id
        WHERE a.first_date IS NOT NULL) x),

    -- Cohorts: only customers whose first purchase is in the last 12 months, with the months they bought in.
    'customer_months', (SELECT COALESCE(jsonb_agg(jsonb_build_object('customer_id', customer_id, 'months', months)), '[]') FROM (
        SELECT cd.customer_id, array_agg(DISTINCT to_char(cd.day, 'YYYY-MM')) AS months
        FROM insights_r_customer_day cd
        WHERE cd.orders > 0 AND cd.day >= (date_trunc('month', p_to) - interval '11 months')::date
          AND NOT EXISTS (SELECT 1 FROM insights_r_customer_day o
                          WHERE o.customer_id = cd.customer_id AND o.orders > 0
                            AND o.day < (date_trunc('month', p_to) - interval '11 months')::date)
        GROUP BY 1) x),

    'inventory', (SELECT COALESCE(jsonb_agg(x), '[]') FROM (
        WITH inv AS (
          SELECT bi.product_id, SUM(bi.quantity_on_hand) AS q FROM branch_inventory bi
          WHERE bi.variant_id IS NULL AND (p_branch IS NULL OR bi.branch_id = p_branch) GROUP BY 1
        ),
        lots AS (
          SELECT l.product_id, SUM(l.qty_remaining * l.unit_cost) AS v, SUM(l.qty_remaining) AS q,
            MAX((l.received_at AT TIME ZONE 'Asia/Manila')::date) FILTER (WHERE l.source = 'po') AS last_rcv
          FROM inventory_lots l WHERE l.qty_remaining > 0 AND (p_branch IS NULL OR l.branch_id = p_branch) GROUP BY 1
        ),
        inv_sh AS (
          SELECT l.product_id, SUM(s.qty_remaining) AS q
          FROM investment_lot_shares s JOIN inventory_lots l ON l.id = s.lot_id
          WHERE s.qty_remaining > 0 AND (p_branch IS NULL OR l.branch_id = p_branch) GROUP BY 1
        ),
        ls AS (
          SELECT product_id, MAX(last_day) AS d FROM insights_r_product_week
          WHERE p_branch IS NULL OR branch_id = p_branch GROUP BY 1
        ),
        lt AS (
          SELECT pol.product_id, AVG(po.actual_delivery_date - po.po_date)::numeric AS days, COUNT(*) AS n
          FROM purchase_order_lines pol JOIN purchase_orders po ON po.id = pol.po_id
          WHERE po.is_deleted = false AND po.actual_delivery_date IS NOT NULL
            AND po.actual_delivery_date >= po.po_date AND pol.quantity_received > 0
            AND po.po_date >= p_to - 730
          GROUP BY 1
        )
        SELECT p.id AS product_id, p.code::text AS code, p.name::text AS name, COALESCE(pc.name, 'Uncategorized')::text AS category,
          COALESCE(u.name, u.code, '')::text AS base_uom, p.is_active,
          COALESCE(inv.q, 0) AS qty_on_hand,
          COALESCE(lots.v, GREATEST(COALESCE(inv.q, 0), 0) * COALESCE(p.base_unit_cost, 0)) AS stock_value,
          COALESCE(inv_sh.q, 0) AS investor_qty,
          COALESCE(NULLIF(lots.v, 0) / NULLIF(lots.q, 0), p.base_unit_cost) AS unit_cost,
          p.current_selling_price AS selling_price, COALESCE(NULLIF(p.conversion_factor, 0), 1) AS sell_conv,
          p.reorder_point::numeric AS reorder_point, ls.d AS last_sale, lots.last_rcv AS last_received,
          lt.days AS lead_days, COALESCE(lt.n, 0) AS lead_samples
        FROM products p
        LEFT JOIN product_categories pc ON pc.id = p.category_id
        LEFT JOIN units_of_measure u ON u.id = p.base_uom_id
        LEFT JOIN inv ON inv.product_id = p.id
        LEFT JOIN lots ON lots.product_id = p.id
        LEFT JOIN inv_sh ON inv_sh.product_id = p.id
        LEFT JOIN ls ON ls.product_id = p.id
        LEFT JOIN lt ON lt.product_id = p.id
        WHERE p.is_active OR COALESCE(inv.q, 0) <> 0) x),

    'lead_times', (SELECT COALESCE(jsonb_agg(x), '[]') FROM (
        SELECT po.id AS po_id, po.po_number::text AS po_number, COALESCE(s.name, '—')::text AS supplier,
          po.po_date, po.expected_delivery_date AS expected, po.actual_delivery_date AS actual,
          (po.actual_delivery_date - po.po_date) AS lead_days,
          CASE WHEN po.expected_delivery_date IS NULL THEN NULL ELSE po.actual_delivery_date - po.expected_delivery_date END AS late_days,
          po.total_amount AS total
        FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.is_deleted = false AND po.status IN ('received', 'partially_received')
          AND po.actual_delivery_date IS NOT NULL AND po.po_date BETWEEN GREATEST(p_hist_from, p_to - 365) AND p_to
          AND (p_branch IS NULL OR po.branch_id = p_branch)) x),

    'adjustments', (SELECT COALESCE(jsonb_agg(x), '[]') FROM (
        SELECT date_trunc('month', week + 3)::date AS month, product_id,
          SUM(qty_lost) AS qty_lost, SUM(qty_found) AS qty_found, SUM(value_lost) AS value_lost
        FROM insights_r_stock_week
        WHERE (qty_lost > 0 OR qty_found > 0) AND week BETWEEN date_trunc('week', p_hist_from)::date AND p_to
          AND (p_branch IS NULL OR branch_id = p_branch)
        GROUP BY 1, 2) x),

    'payment_mix', (SELECT COALESCE(jsonb_agg(x), '[]') FROM (
        SELECT p.payment_method::text AS method, SUM(p.amount) AS amount, COUNT(*) AS cnt
        FROM transaction_payments p JOIN transactions t ON t.id = p.transaction_id
        WHERE p.payment_date >= (p_range_from::timestamp AT TIME ZONE 'Asia/Manila')
          AND p.payment_date < ((p_range_to + 1)::timestamp AT TIME ZONE 'Asia/Manila')
          AND t.is_deleted = false AND t.transaction_type = 'sale'
          AND (p_branch IS NULL OR t.branch_id = p_branch)
        GROUP BY 1) x),

    'deliveries', (SELECT COALESCE(jsonb_agg(x), '[]') FROM (
        SELECT COALESCE(NULLIF(split_part(t.delivery_geocoded_address, ',', 1), ''), NULLIF(t.delivery_address, ''), 'Unknown')::text AS place,
          t.delivery_distance_km::numeric AS distance_km, t.total_amount AS revenue, COALESCE(t.delivery_fee, 0) AS delivery_fee
        FROM transactions t
        WHERE t.transaction_date >= (p_range_from::timestamp AT TIME ZONE 'Asia/Manila')
          AND t.transaction_date < ((p_range_to + 1)::timestamp AT TIME ZONE 'Asia/Manila')
          AND t.is_deleted = false AND t.transaction_type = 'sale' AND t.delivery_type = 'delivery'
          AND (p_branch IS NULL OR t.branch_id = p_branch)) x),

    'pairs', (SELECT COALESCE(jsonb_agg(x), '[]') FROM (
        WITH l AS (
          SELECT DISTINCT tl.transaction_id, tl.product_id
          FROM transactions t JOIN transaction_lines tl ON tl.transaction_id = t.id
          WHERE t.transaction_date >= (v_cap::timestamp AT TIME ZONE 'Asia/Manila')
            AND t.transaction_date < ((p_range_to + 1)::timestamp AT TIME ZONE 'Asia/Manila')
            AND t.is_deleted = false AND t.transaction_type = 'sale'
            AND (p_branch IS NULL OR t.branch_id = p_branch)
        )
        SELECT a.product_id AS product_a, b.product_id AS product_b, COUNT(*) AS together
        FROM l a JOIN l b ON a.transaction_id = b.transaction_id AND a.product_id < b.product_id
        GROUP BY 1, 2 HAVING COUNT(*) >= 3 ORDER BY 3 DESC LIMIT 60) x),

    'quotations', (SELECT COALESCE(jsonb_agg(x), '[]') FROM (
        SELECT date_trunc('month', c.canvas_date AT TIME ZONE 'Asia/Manila')::date AS month,
          COUNT(*) AS quotes, SUM(c.total_amount) AS quoted_amount,
          COUNT(*) FILTER (WHERE x.amt IS NOT NULL) AS converted, COALESCE(SUM(x.amt), 0) AS converted_amount
        FROM canvases c
        LEFT JOIN LATERAL (
          SELECT SUM(t.total_amount) AS amt FROM transactions t
          WHERE t.canvas_id = c.id AND t.is_deleted = false AND t.transaction_type = 'sale'
        ) x ON true
        WHERE c.is_deleted = false
          AND c.canvas_date >= (p_hist_from::timestamp AT TIME ZONE 'Asia/Manila')
          AND (p_branch IS NULL OR c.branch_id = p_branch)
        GROUP BY 1) x),

    -- Expenses and purchases are small tables: daily rows over the history.
    'expenses', (SELECT COALESCE(jsonb_agg(x), '[]') FROM (
        SELECT (e.expense_date AT TIME ZONE 'Asia/Manila')::date AS ph_date,
          COALESCE(ec.name, 'Uncategorized')::text AS category_name, SUM(e.amount) AS total_amount
        FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.category_id
        WHERE e.is_deleted = false
          AND e.expense_date >= (p_hist_from::timestamp AT TIME ZONE 'Asia/Manila')
          AND e.expense_date < ((p_to + 1)::timestamp AT TIME ZONE 'Asia/Manila')
          AND (p_branch IS NULL OR e.branch_id = p_branch)
        GROUP BY 1, 2) x),

    'purchases', (SELECT COALESCE(jsonb_agg(x), '[]') FROM (
        SELECT d AS ph_date, SUM(amt) AS total_purchases FROM (
          SELECT COALESCE(po.actual_delivery_date, po.po_date) AS d,
            COALESCE((SELECT SUM(pol.quantity_received * pol.unit_cost) FROM purchase_order_lines pol WHERE pol.po_id = po.id), 0)
              + CASE WHEN po.status = 'received' THEN COALESCE(po.delivery_charge, 0) ELSE 0 END AS amt
          FROM purchase_orders po
          WHERE po.is_deleted = false AND po.status IN ('received', 'partially_received')
            AND COALESCE(po.actual_delivery_date, po.po_date) BETWEEN p_hist_from AND p_to
            AND (p_branch IS NULL OR po.branch_id = p_branch)
        ) y GROUP BY 1) x),

    'ap_open', (SELECT jsonb_build_object(
        'open_ap', COALESCE(SUM(lp.total_amount - lp.paid_amount), 0),
        'due_30', COALESCE(SUM(lp.total_amount - lp.paid_amount) FILTER (WHERE lp.due_date <= p_to + 30), 0))
      FROM liability_payables lp
      WHERE lp.is_deleted = false AND lp.total_amount > lp.paid_amount AND (p_branch IS NULL OR lp.branch_id = p_branch))
  ) INTO r;
  RETURN r;
END;
$$;

-- ── Stored AI briefs + weather cache ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.insights_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('weekly', 'monthly')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  payload jsonb NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS insights_briefs_kind_created ON public.insights_briefs (kind, created_at DESC);
ALTER TABLE public.insights_briefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS insights_briefs_admin ON public.insights_briefs;
CREATE POLICY insights_briefs_admin ON public.insights_briefs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE TABLE IF NOT EXISTS public.insights_weather_daily (
  day date PRIMARY KEY,
  rain_mm numeric NOT NULL DEFAULT 0,
  tmax numeric,
  is_forecast boolean NOT NULL DEFAULT false,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.insights_weather_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS insights_weather_admin ON public.insights_weather_daily;
CREATE POLICY insights_weather_admin ON public.insights_weather_daily FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

REVOKE ALL ON FUNCTION public.insights_mark_dirty() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.insights_refresh(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.insights_data(date, date, date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.insights_assert_admin(), public.insights_refresh(boolean),
  public.insights_data(date, date, date, date, uuid)
TO authenticated;
