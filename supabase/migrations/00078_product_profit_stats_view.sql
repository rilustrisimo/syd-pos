-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00078: Product profit stats view (server-only, not anon-readable)
--
-- The shop's storefront currently sorts products purely by qty_sold_90d
-- (product_sales_stats, migration 00075), which lets a high-volume,
-- low-margin product (e.g. common screws) outrank a lower-volume but far
-- more profitable product. We want ranking to also weigh profitability.
--
-- This view exposes per-product revenue/cost aggregates over the trailing
-- 90 days so the shop can rank by gross profit contributed, not just units
-- moved. Unlike product_sales_stats, this view is intentionally NOT
-- granted to anon or authenticated — cost/margin data is business-sensitive
-- and must never reach a browser. It is only ever queried server-side via
-- the shop's service-role client (bypasses RLS/grants), which then returns
-- a sanitized, cost-free product list to the client.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW product_profit_stats AS
SELECT
  tl.product_id,
  SUM(
    CASE WHEN t.transaction_date >= NOW() - INTERVAL '90 days' THEN tl.line_total ELSE 0 END
  ) AS revenue_90d,
  SUM(
    CASE WHEN t.transaction_date >= NOW() - INTERVAL '90 days'
      THEN tl.quantity * COALESCE(tl.cogs_per_unit, 0)
      ELSE 0
    END
  ) AS cost_90d
FROM transaction_lines tl
JOIN transactions t ON t.id = tl.transaction_id
WHERE t.transaction_type = 'sale'
GROUP BY tl.product_id;

-- No GRANTs to anon/authenticated — deliberately server-only.
