-- ─────────────────────────────────────────────────────────────────────────────
-- Report RPC functions
--
-- Purpose: Bypass PostgREST's default row-limit cap (1 000 rows) for the P&L
-- and Sales report pages.  Aggregation happens inside Postgres so only compact
-- summary rows are returned over the wire.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. P&L: daily revenue + COGS ─────────────────────────────────────────────
-- Returns one row per PH calendar day in the range.
-- Revenue = subtotal + delivery_fee + other_fees - discount_amount
-- (valid simplification: sum(line_total) == subtotal by design)
CREATE OR REPLACE FUNCTION get_pl_revenue_cogs_daily(p_date_from date, p_date_to date)
RETURNS TABLE (
  ph_date      date,
  revenue      numeric,
  cogs         numeric
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH txns AS (
    SELECT
      t.id,
      CASE WHEN t.transaction_type = 'return' THEN -1 ELSE 1 END AS sign,
      (t.transaction_date AT TIME ZONE 'Asia/Manila')::date AS ph_date,
      COALESCE(t.subtotal, 0) + COALESCE(t.delivery_fee, 0)
        + COALESCE(t.other_fees, 0) - COALESCE(t.discount_amount, 0) AS txn_revenue
    FROM transactions t
    WHERE t.transaction_type IN ('sale', 'return')
      AND t.is_deleted = FALSE
      AND (t.transaction_date AT TIME ZONE 'Asia/Manila')::date
          BETWEEN p_date_from AND p_date_to
  ),
  line_cogs AS (
    SELECT
      tl.transaction_id,
      SUM(COALESCE(tl.quantity, 0) * COALESCE(tl.cogs_per_unit, 0)) AS cogs
    FROM transaction_lines tl
    WHERE tl.transaction_id IN (SELECT id FROM txns)
    GROUP BY tl.transaction_id
  )
  SELECT
    t.ph_date,
    SUM(t.sign * t.txn_revenue)::numeric  AS revenue,
    SUM(t.sign * COALESCE(lc.cogs, 0))::numeric AS cogs
  FROM txns t
  LEFT JOIN line_cogs lc ON lc.transaction_id = t.id
  GROUP BY t.ph_date
  ORDER BY t.ph_date
$$;

-- ── 2. P&L: expenses grouped by date + category ───────────────────────────────
-- Returns one row per (ph_date, category) combination.
-- JS side can aggregate both the daily totals and category totals from this.
CREATE OR REPLACE FUNCTION get_pl_expenses(p_date_from date, p_date_to date)
RETURNS TABLE (
  ph_date        date,
  category_id    uuid,
  category_name  text,
  category_color text,
  total_amount   numeric,
  cnt            bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    e.expense_date                            AS ph_date,
    e.category_id,
    COALESCE(ec.name,  'Uncategorized')       AS category_name,
    COALESCE(ec.color, '#6b7280')             AS category_color,
    SUM(e.amount)::numeric                    AS total_amount,
    COUNT(*)::bigint                          AS cnt
  FROM expenses e
  LEFT JOIN expense_categories ec ON ec.id = e.category_id
  WHERE e.is_deleted = FALSE
    AND e.expense_date BETWEEN p_date_from AND p_date_to
  GROUP BY e.expense_date, e.category_id, ec.name, ec.color
  ORDER BY e.expense_date
$$;

-- ── 3. Sales: product-level aggregation ──────────────────────────────────────
-- Returns one row per product with revenue, cost, quantity aggregated.
-- Pass p_category_id = NULL to include all categories.
CREATE OR REPLACE FUNCTION get_sales_by_product_report(
  p_date_from   date,
  p_date_to     date,
  p_category_id uuid DEFAULT NULL
)
RETURNS TABLE (
  product_id    uuid,
  product_code  text,
  product_name  text,
  category_name text,
  quantity_sold numeric,
  total_revenue numeric,
  total_cost    numeric
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH txns AS (
    SELECT
      t.id,
      CASE WHEN t.transaction_type = 'return' THEN -1 ELSE 1 END AS sign,
      COALESCE(t.subtotal, 0)        AS subtotal,
      COALESCE(t.delivery_fee, 0)    AS delivery_fee,
      COALESCE(t.other_fees, 0)      AS other_fees,
      COALESCE(t.discount_amount, 0) AS discount_amount
    FROM transactions t
    WHERE t.transaction_type IN ('sale', 'return')
      AND t.is_deleted = FALSE
      AND (t.transaction_date AT TIME ZONE 'Asia/Manila')::date
          BETWEEN p_date_from AND p_date_to
  ),
  lines AS (
    SELECT
      tl.transaction_id,
      p.id                                      AS product_id,
      p.code                                    AS product_code,
      p.name                                    AS product_name,
      COALESCE(pc.name, 'Uncategorized')        AS category_name,
      pc.id                                     AS category_id,
      COALESCE(tl.quantity, 0)                  AS quantity,
      COALESCE(tl.line_total, 0)                AS line_total,
      COALESCE(tl.cogs_per_unit, 0)             AS cogs_per_unit
    FROM transaction_lines tl
    JOIN     products          p  ON p.id  = tl.product_id
    LEFT JOIN product_categories pc ON pc.id = p.category_id
    WHERE tl.transaction_id IN (SELECT id FROM txns)
      AND (p_category_id IS NULL OR pc.id = p_category_id)
  ),
  combined AS (
    SELECT
      l.product_id,
      l.product_code,
      l.product_name,
      l.category_name,
      t.sign,
      l.quantity,
      l.line_total,
      l.cogs_per_unit,
      CASE WHEN t.subtotal > 0 THEN l.line_total / t.subtotal ELSE 0 END AS line_ratio,
      t.delivery_fee,
      t.other_fees,
      t.discount_amount
    FROM lines l
    JOIN txns t ON t.id = l.transaction_id
  )
  SELECT
    product_id,
    product_code,
    product_name,
    category_name,
    SUM(sign * quantity)::numeric AS quantity_sold,
    SUM(sign * (
      line_total
      + delivery_fee  * line_ratio
      + other_fees    * line_ratio
      - discount_amount * line_ratio
    ))::numeric AS total_revenue,
    SUM(sign * quantity * cogs_per_unit)::numeric AS total_cost
  FROM combined
  GROUP BY product_id, product_code, product_name, category_name
  ORDER BY total_revenue DESC
$$;

-- ── 4. Sales: daily trend ─────────────────────────────────────────────────────
-- Returns one row per PH calendar day with revenue, cost, discounts, tx count.
CREATE OR REPLACE FUNCTION get_sales_trend_daily(p_date_from date, p_date_to date)
RETURNS TABLE (
  ph_date      date,
  revenue      numeric,
  cost         numeric,
  discounts    numeric,
  transactions bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH txns AS (
    SELECT
      t.id,
      t.transaction_type,
      CASE WHEN t.transaction_type = 'return' THEN -1 ELSE 1 END AS sign,
      (t.transaction_date AT TIME ZONE 'Asia/Manila')::date AS ph_date,
      COALESCE(t.subtotal, 0)        AS subtotal,
      COALESCE(t.delivery_fee, 0)    AS delivery_fee,
      COALESCE(t.other_fees, 0)      AS other_fees,
      COALESCE(t.discount_amount, 0) AS txn_discount
    FROM transactions t
    WHERE t.transaction_type IN ('sale', 'return')
      AND t.is_deleted = FALSE
      AND (t.transaction_date AT TIME ZONE 'Asia/Manila')::date
          BETWEEN p_date_from AND p_date_to
  ),
  line_agg AS (
    SELECT
      tl.transaction_id,
      SUM(COALESCE(tl.quantity, 0) * COALESCE(tl.cogs_per_unit, 0)) AS total_cogs,
      SUM(COALESCE(tl.discount_amount, 0))                           AS line_discounts
    FROM transaction_lines tl
    WHERE tl.transaction_id IN (SELECT id FROM txns)
    GROUP BY tl.transaction_id
  )
  SELECT
    t.ph_date,
    SUM(t.sign * (t.subtotal + t.delivery_fee + t.other_fees - t.txn_discount))::numeric AS revenue,
    SUM(t.sign * COALESCE(la.total_cogs, 0))::numeric AS cost,
    SUM(CASE WHEN t.transaction_type = 'sale'
             THEN t.txn_discount + COALESCE(la.line_discounts, 0)
             ELSE 0 END)::numeric AS discounts,
    COUNT(CASE WHEN t.transaction_type = 'sale' THEN 1 END)::bigint AS transactions
  FROM txns t
  LEFT JOIN line_agg la ON la.transaction_id = t.id
  GROUP BY t.ph_date
  ORDER BY t.ph_date
$$;

-- ── 5. Sales: fee summary ────────────────────────────────────────────────────
-- Returns a single aggregate row with fee/discount totals.
-- Pass p_category_id = NULL to include all categories.
CREATE OR REPLACE FUNCTION get_sales_fee_summary_report(
  p_date_from   date,
  p_date_to     date,
  p_category_id uuid DEFAULT NULL
)
RETURNS TABLE (
  total_delivery_fees           numeric,
  total_other_fees              numeric,
  total_discounts               numeric,
  transactions_with_delivery_fee bigint,
  transactions_with_other_fees   bigint,
  items_with_discount            bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH txns AS (
    SELECT
      t.id,
      COALESCE(t.delivery_fee,    0) AS delivery_fee,
      COALESCE(t.other_fees,      0) AS other_fees,
      COALESCE(t.discount_amount, 0) AS txn_discount
    FROM transactions t
    WHERE t.transaction_type = 'sale'
      AND t.is_deleted = FALSE
      AND (t.transaction_date AT TIME ZONE 'Asia/Manila')::date
          BETWEEN p_date_from AND p_date_to
  ),
  -- When a category filter is applied, only keep transactions that have at
  -- least one line in that category.
  filtered_txns AS (
    SELECT DISTINCT t.id, t.delivery_fee, t.other_fees, t.txn_discount
    FROM txns t
    JOIN transaction_lines tl ON tl.transaction_id = t.id
    JOIN products           p  ON p.id = tl.product_id
    WHERE p_category_id IS NULL OR p.category_id = p_category_id
  ),
  line_agg AS (
    SELECT
      tl.transaction_id,
      SUM(COALESCE(tl.discount_amount, 0))                                   AS line_discounts,
      COUNT(CASE WHEN COALESCE(tl.discount_amount, 0) > 0 THEN 1 END)::bigint AS discounted_items
    FROM transaction_lines tl
    WHERE tl.transaction_id IN (SELECT id FROM filtered_txns)
    GROUP BY tl.transaction_id
  )
  SELECT
    SUM(ft.delivery_fee)::numeric                                         AS total_delivery_fees,
    SUM(ft.other_fees)::numeric                                           AS total_other_fees,
    SUM(ft.txn_discount + COALESCE(la.line_discounts, 0))::numeric        AS total_discounts,
    COUNT(CASE WHEN ft.delivery_fee > 0 THEN 1 END)::bigint               AS transactions_with_delivery_fee,
    COUNT(CASE WHEN ft.other_fees    > 0 THEN 1 END)::bigint              AS transactions_with_other_fees,
    SUM(COALESCE(la.discounted_items, 0))::bigint                         AS items_with_discount
  FROM filtered_txns ft
  LEFT JOIN line_agg la ON la.transaction_id = ft.id
$$;
