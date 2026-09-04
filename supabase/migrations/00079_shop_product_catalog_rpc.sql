-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00079: Paginated, profit-ranked shop product catalog RPC
--
-- The shop's storefront previously fetched the ENTIRE matching product set
-- in one unbounded query, sorted it in JS, and rendered everything at once.
-- At ~850 active products that's already close to PostgREST's default
-- max-rows ceiling (silent truncation risk), and it doesn't scale toward
-- "thousands" of products either in payload size or DOM cost.
--
-- This RPC pushes the full pipeline into SQL — category/search filtering,
-- dead-stock exclusion, hidden_online exclusion, profit-based ranking, and
-- LIMIT/OFFSET pagination — so pages stay correctly ordered and cheap at
-- any catalog size. total_count is returned via COUNT(*) OVER() so the
-- client knows when to stop requesting more pages without a second query.
--
-- Profit/revenue/cost values are used only inside the ORDER BY here and are
-- deliberately NOT included in the returned columns — this function is not
-- granted to anon/authenticated (server-only, via the shop's service-role
-- client), consistent with product_profit_stats (migration 00078).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_shop_product_catalog(
  p_branch_id     uuid,
  p_category_id   uuid DEFAULT NULL,
  p_search        text DEFAULT NULL,
  p_in_stock_only boolean DEFAULT FALSE,
  p_limit         int DEFAULT 24,
  p_offset        int DEFAULT 0
)
RETURNS TABLE (
  id                    uuid,
  code                  text,
  name                  text,
  description           text,
  current_selling_price numeric,
  category_id           uuid,
  category_name         text,
  subcategory_id        uuid,
  subcategory_name      text,
  uom_code              text,
  uom_name              text,
  quantity_on_hand      numeric,
  in_stock              boolean,
  primary_image_url     text,
  qty_sold_90d          numeric,
  last_sale_at          timestamptz,
  total_count           bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH stock AS (
    SELECT product_id, SUM(quantity_on_hand) AS qty
    FROM branch_inventory
    WHERE branch_id = p_branch_id
    GROUP BY product_id
  ),
  filtered AS (
    SELECT
      p.id,
      p.code,
      p.name,
      p.description,
      p.current_selling_price,
      p.category_id,
      pc.name AS category_name,
      p.subcategory_id,
      psc.name AS subcategory_name,
      suom.code AS uom_code,
      suom.name AS uom_name,
      COALESCE(st.qty, 0) AS quantity_on_hand,
      COALESCE(st.qty, 0) > 0 AS in_stock,
      img.url AS primary_image_url,
      COALESCE(pss.qty_sold_90d, 0) AS qty_sold_90d,
      pss.last_sale_at,
      COALESCE(pps.revenue_90d, 0) - COALESCE(pps.cost_90d, 0) AS profit_90d
    FROM products p
    JOIN product_categories pc ON pc.id = p.category_id
    LEFT JOIN product_subcategories psc ON psc.id = p.subcategory_id
    JOIN units_of_measure suom ON suom.id = p.selling_uom_id
    LEFT JOIN stock st ON st.product_id = p.id
    LEFT JOIN LATERAL (
      SELECT pi.url FROM product_images pi
      WHERE pi.product_id = p.id
      ORDER BY pi.is_primary DESC, pi.sort_order ASC
      LIMIT 1
    ) img ON true
    LEFT JOIN product_sales_stats pss ON pss.product_id = p.id
    LEFT JOIN product_profit_stats pps ON pps.product_id = p.id
    LEFT JOIN shop_product_overrides spo ON spo.product_id = p.id
    WHERE p.is_active = TRUE
      AND COALESCE(spo.hidden_online, FALSE) = FALSE
      -- A search term ignores the category filter entirely (search is global);
      -- with no search, apply the category filter only when one was given.
      AND (
        (p_search IS NOT NULL AND p_search <> '')
        OR p_category_id IS NULL
        OR p.category_id = p_category_id
      )
      AND (
        p_search IS NULL OR p_search = ''
        OR p.name ILIKE '%' || p_search || '%'
        OR p.code ILIKE '%' || p_search || '%'
      )
      -- Dead stock: sold before but not in 90+ days, and currently zero stock.
      -- Never-sold products and anything still on the shelf stay visible.
      AND NOT (
        pss.last_sale_at IS NOT NULL
        AND COALESCE(st.qty, 0) = 0
        AND pss.last_sale_at < NOW() - INTERVAL '90 days'
      )
      AND (NOT p_in_stock_only OR COALESCE(st.qty, 0) > 0)
  )
  SELECT
    f.id, f.code, f.name, f.description, f.current_selling_price,
    f.category_id, f.category_name, f.subcategory_id, f.subcategory_name,
    f.uom_code, f.uom_name, f.quantity_on_hand, f.in_stock, f.primary_image_url,
    f.qty_sold_90d, f.last_sale_at,
    COUNT(*) OVER() AS total_count
  FROM filtered f
  ORDER BY f.in_stock DESC, f.profit_90d DESC, f.qty_sold_90d DESC, f.name ASC
  LIMIT p_limit OFFSET p_offset;
$$;

-- No GRANTs to anon/authenticated — deliberately server-only (see comment above).
