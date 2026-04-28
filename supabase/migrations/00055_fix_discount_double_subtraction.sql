-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: revenue formula double-subtracts line-level discounts
--
-- Root cause:
--   transactions.subtotal   = sum(qty × price − line_discount)   [post-line-discount]
--   transactions.discount_amount = line_discounts + order_discount [total]
--
-- The old formula:  subtotal + fees − discount_amount
--   = (gross − line_disc) + fees − (line_disc + order_disc)
--   = gross + fees − 2×line_disc − order_disc   ← WRONG
--
-- Correct formula:  subtotal + fees − order_discount_only
--   = subtotal + fees − (discount_amount − sum(tl.discount_amount))
--   = subtotal + fees − discount_amount + sum(tl.discount_amount)
--
-- Also fixes get_sales_fee_summary_report which similarly double-counted
-- total_discounts by adding txn.discount_amount + sum(line discounts).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. P&L: daily revenue + COGS ─────────────────────────────────────────────
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
  line_agg AS (
    SELECT
      tl.transaction_id,
      SUM(COALESCE(tl.quantity, 0) * COALESCE(tl.cogs_per_unit, 0)) AS cogs,
      -- Sum of per-line discounts: needed to undo the double-subtraction
      SUM(COALESCE(tl.discount_amount, 0))                           AS line_discounts
    FROM transaction_lines tl
    WHERE tl.transaction_id IN (SELECT id FROM txns)
    GROUP BY tl.transaction_id
  )
  SELECT
    t.ph_date,
    -- Add back line_discounts to cancel the double-subtraction
    SUM(t.sign * (t.txn_revenue + COALESCE(la.line_discounts, 0)))::numeric AS revenue,
    SUM(t.sign * COALESCE(la.cogs, 0))::numeric                             AS cogs
  FROM txns t
  LEFT JOIN line_agg la ON la.transaction_id = t.id
  GROUP BY t.ph_date
  ORDER BY t.ph_date
$$;

-- ── 2. P&L: expenses grouped by date + category ───────────────────────────────
-- (No change — expenses have no discount issue)
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
  -- Sum of per-line discounts per transaction (to compute order-only discount)
  txn_line_disc AS (
    SELECT
      tl.transaction_id,
      SUM(COALESCE(tl.discount_amount, 0)) AS line_discounts
    FROM transaction_lines tl
    WHERE tl.transaction_id IN (SELECT id FROM txns)
    GROUP BY tl.transaction_id
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
      -- Order-only discount: total discount minus the line-level portion
      t.discount_amount - COALESCE(tld.line_discounts, 0) AS order_discount
    FROM lines l
    JOIN txns t ON t.id = l.transaction_id
    LEFT JOIN txn_line_disc tld ON tld.transaction_id = t.id
  )
  SELECT
    product_id,
    product_code,
    product_name,
    category_name,
    SUM(sign * quantity)::numeric AS quantity_sold,
    -- line_total already net of line-level discounts;
    -- distribute order discount + fees proportionally via line_ratio
    SUM(sign * (
      line_total
      + delivery_fee    * line_ratio
      + other_fees      * line_ratio
      - order_discount  * line_ratio
    ))::numeric AS total_revenue,
    SUM(sign * quantity * cogs_per_unit)::numeric AS total_cost
  FROM combined
  GROUP BY product_id, product_code, product_name, category_name
  ORDER BY total_revenue DESC
$$;

-- ── 4. Sales: daily trend ─────────────────────────────────────────────────────
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
    -- Add back line_discounts to cancel the double-subtraction in subtotal - txn_discount
    SUM(t.sign * (t.subtotal + t.delivery_fee + t.other_fees - t.txn_discount
                  + COALESCE(la.line_discounts, 0)))::numeric AS revenue,
    SUM(t.sign * COALESCE(la.total_cogs, 0))::numeric AS cost,
    -- Total discounts shown is just txn_discount (already = line + order discounts)
    SUM(CASE WHEN t.transaction_type = 'sale'
             THEN t.txn_discount
             ELSE 0 END)::numeric AS discounts,
    COUNT(CASE WHEN t.transaction_type = 'sale' THEN 1 END)::bigint AS transactions
  FROM txns t
  LEFT JOIN line_agg la ON la.transaction_id = t.id
  GROUP BY t.ph_date
  ORDER BY t.ph_date
$$;

-- ── 5. Sales: fee summary ────────────────────────────────────────────────────
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
      COUNT(CASE WHEN COALESCE(tl.discount_amount, 0) > 0 THEN 1 END)::bigint AS discounted_items
    FROM transaction_lines tl
    WHERE tl.transaction_id IN (SELECT id FROM filtered_txns)
    GROUP BY tl.transaction_id
  )
  SELECT
    SUM(ft.delivery_fee)::numeric                                         AS total_delivery_fees,
    SUM(ft.other_fees)::numeric                                           AS total_other_fees,
    -- txn_discount already equals total discounts (line + order); no need to add line discounts again
    SUM(ft.txn_discount)::numeric                                         AS total_discounts,
    COUNT(CASE WHEN ft.delivery_fee > 0 THEN 1 END)::bigint               AS transactions_with_delivery_fee,
    COUNT(CASE WHEN ft.other_fees    > 0 THEN 1 END)::bigint              AS transactions_with_other_fees,
    SUM(COALESCE(la.discounted_items, 0))::bigint                         AS items_with_discount
  FROM filtered_txns ft
  LEFT JOIN line_agg la ON la.transaction_id = ft.id
$$;
