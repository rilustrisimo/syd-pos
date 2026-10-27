-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00102: Product signals for the Gemini marketing planner
--
-- One row per active product (shown online) with the numbers the planner
-- needs to pick WHAT to post about: stock on hand, recent sales and the
-- trend (last 30 days vs the 30 before), what sold in the coming 30 days
-- LAST year (seasonal demand), online quote requests, and when the product
-- was last featured in a post or ad (so repeats get a new angle).
--
-- Aggregated in SQL so the route never pulls raw sales lines (PostgREST's
-- 1000-row cap would silently truncate them). SECURITY INVOKER: runs under
-- the signed-in staff user's RLS, like the rest of the marketing reads.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_marketing_product_signals()
RETURNS TABLE (
  product_id                uuid,
  code                      text,
  name                      text,
  category_name             text,
  created_at                timestamptz,
  stock_on_hand             numeric,
  reorder_point             integer,
  sold_30d                  numeric,
  sold_prior_30d            numeric,
  sold_90d                  numeric,
  sold_next_30d_last_year   numeric,
  online_requests_60d       integer,
  last_featured_at          timestamptz,
  times_featured_90d        integer
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH stock AS (
    SELECT bi.product_id, SUM(bi.quantity_on_hand) AS qty
    FROM branch_inventory bi
    GROUP BY bi.product_id
  ),
  sales AS (
    SELECT
      tl.product_id,
      SUM(tl.quantity) FILTER (WHERE t.transaction_date >= NOW() - INTERVAL '30 days') AS sold_30d,
      SUM(tl.quantity) FILTER (WHERE t.transaction_date >= NOW() - INTERVAL '60 days'
                                 AND t.transaction_date <  NOW() - INTERVAL '30 days') AS sold_prior_30d,
      SUM(tl.quantity) FILTER (WHERE t.transaction_date >= NOW() - INTERVAL '90 days') AS sold_90d,
      SUM(tl.quantity) FILTER (WHERE t.transaction_date >= NOW() - INTERVAL '365 days'
                                 AND t.transaction_date <  NOW() - INTERVAL '335 days') AS sold_next_30d_last_year
    FROM transaction_lines tl
    JOIN transactions t ON t.id = tl.transaction_id
    WHERE t.transaction_type = 'sale'
      AND t.transaction_date >= NOW() - INTERVAL '365 days'
    GROUP BY tl.product_id
  ),
  online AS (
    SELECT ol.product_id, COUNT(DISTINCT ol.order_id)::int AS requests
    FROM online_order_lines ol
    JOIN online_orders o ON o.id = ol.order_id
    WHERE ol.product_id IS NOT NULL
      AND o.deleted_at IS NULL
      AND o.created_at >= NOW() - INTERVAL '60 days'
    GROUP BY ol.product_id
  ),
  featured AS (
    SELECT f.product_id, MAX(f.at) AS last_at,
           COUNT(*) FILTER (WHERE f.at >= NOW() - INTERVAL '90 days')::int AS times_90d
    FROM (
      SELECT ci.source_product_id AS product_id,
             COALESCE(ci.planned_for::timestamptz, ci.created_at) AS at
      FROM content_ideas ci
      WHERE ci.source_product_id IS NOT NULL
      UNION ALL
      -- Drafts made straight from a product (not from an idea).
      SELECT cs.source_product_id, cs.created_at
      FROM content_suggestions cs
      WHERE cs.source_product_id IS NOT NULL AND cs.source_idea_id IS NULL
    ) f
    GROUP BY f.product_id
  )
  SELECT
    p.id, p.code::text, p.name::text, pc.name::text, p.created_at,
    COALESCE(st.qty, 0), p.reorder_point,
    COALESCE(s.sold_30d, 0), COALESCE(s.sold_prior_30d, 0), COALESCE(s.sold_90d, 0),
    COALESCE(s.sold_next_30d_last_year, 0),
    COALESCE(o.requests, 0),
    fe.last_at, COALESCE(fe.times_90d, 0)
  FROM products p
  JOIN product_categories pc ON pc.id = p.category_id
  LEFT JOIN shop_product_overrides spo ON spo.product_id = p.id
  LEFT JOIN stock st ON st.product_id = p.id
  LEFT JOIN sales s ON s.product_id = p.id
  LEFT JOIN online o ON o.product_id = p.id
  LEFT JOIN featured fe ON fe.product_id = p.id
  WHERE p.is_active = TRUE
    AND COALESCE(spo.hidden_online, FALSE) = FALSE;
$$;

REVOKE ALL ON FUNCTION get_marketing_product_signals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_marketing_product_signals() TO authenticated;
