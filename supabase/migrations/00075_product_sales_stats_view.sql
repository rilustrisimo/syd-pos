-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00075: Product sales stats view for the shop
--
-- syd-shop needs two things per product to rank/filter the catalog:
--   1. Total quantity sold in the last 90 days (fast-movers-first sort)
--   2. The date of the most recent sale (feeds the "hide if stale AND
--      zero stock" rule, applied in application code alongside the live
--      branch_inventory quantity)
--
-- transactions/transaction_lines are authenticated-only tables (staff POS
-- data). This view exposes only the aggregated, non-sensitive numbers the
-- storefront needs — no customer info, no per-sale prices — and is granted
-- to anon directly. Views run with the privileges of their owner by default,
-- so anon can query it without needing direct table access.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW product_sales_stats AS
SELECT
  tl.product_id,
  MAX(t.transaction_date) AS last_sale_at,
  SUM(
    CASE WHEN t.transaction_date >= NOW() - INTERVAL '90 days' THEN tl.quantity ELSE 0 END
  ) AS qty_sold_90d
FROM transaction_lines tl
JOIN transactions t ON t.id = tl.transaction_id
WHERE t.transaction_type = 'sale'
GROUP BY tl.product_id;

GRANT SELECT ON product_sales_stats TO anon;
GRANT SELECT ON product_sales_stats TO authenticated;
