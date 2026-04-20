-- Enhanced Demand Forecast with Year-over-Year Analysis
-- This adds historical seasonal trend detection

CREATE OR REPLACE FUNCTION get_demand_forecast_v2()
RETURNS TABLE (
  product_id          UUID,
  product_code        TEXT,
  product_name        TEXT,
  category_name       TEXT,
  uom_code            TEXT,
  latest_cogs         NUMERIC,
  current_stock       NUMERIC,
  total_units_sold    NUMERIC,
  avg_daily_demand    NUMERIC,
  demand_stddev_daily NUMERIC,
  cv                  NUMERIC,
  days_since_first_sale INTEGER,
  last_sale_date      DATE,
  sold_last_30d       NUMERIC,
  sold_prior_30d      NUMERIC,
  sold_last_90d       NUMERIC,
  sold_same_month_last_year  NUMERIC,
  sold_same_quarter_last_year NUMERIC,
  yoy_growth_pct      NUMERIC,
  has_seasonal_pattern BOOLEAN,
  abc_class           TEXT
)
LANGUAGE sql STABLE AS $$
  WITH sale_movements AS (
    SELECT
      product_id,
      DATE(created_at) AS sale_date,
      SUM(ABS(quantity_change)) AS daily_qty
    FROM inventory_movements
    WHERE movement_type = 'sale'
    GROUP BY product_id, DATE(created_at)
  ),
  product_stats AS (
    SELECT
      product_id,
      SUM(daily_qty)     AS total_units_sold,
      AVG(daily_qty)     AS avg_demand_on_sale_days,
      STDDEV(daily_qty)  AS stddev_on_sale_days,
      MIN(sale_date)     AS first_sale_date,
      MAX(sale_date)     AS last_sale_date,
      
      -- Recent periods
      SUM(CASE WHEN sale_date >= CURRENT_DATE - 30 THEN daily_qty ELSE 0 END) AS sold_last_30d,
      SUM(CASE WHEN sale_date >= CURRENT_DATE - 60 AND sale_date < CURRENT_DATE - 30 THEN daily_qty ELSE 0 END) AS sold_prior_30d,
      SUM(CASE WHEN sale_date >= CURRENT_DATE - 90 THEN daily_qty ELSE 0 END) AS sold_last_90d,
      
      -- Year-over-year comparisons (same month last year)
      SUM(CASE 
        WHEN sale_date >= (CURRENT_DATE - INTERVAL '1 year' - INTERVAL '15 days') 
         AND sale_date <= (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '15 days')
        THEN daily_qty 
        ELSE 0 
      END) AS sold_same_month_last_year,
      
      -- Same quarter last year (90-day period from 365 days ago)
      SUM(CASE 
        WHEN sale_date >= (CURRENT_DATE - INTERVAL '1 year' - INTERVAL '45 days')
         AND sale_date <= (CURRENT_DATE - INTERVAL '1 year' + INTERVAL '45 days')
        THEN daily_qty 
        ELSE 0 
      END) AS sold_same_quarter_last_year
      
    FROM sale_movements
    GROUP BY product_id
  ),
  stock AS (
    SELECT product_id, SUM(quantity_on_hand) AS current_stock
    FROM branch_inventory
    GROUP BY product_id
  ),
  revenue_base AS (
    SELECT
      ps.product_id,
      ps.total_units_sold * COALESCE(p.latest_cogs, 0) AS total_revenue
    FROM product_stats ps
    JOIN products p ON p.id = ps.product_id
    WHERE p.is_active = TRUE
  ),
  abc AS (
    SELECT
      product_id,
      CASE
        WHEN total_revenue = 0 THEN 'C'
        WHEN SUM(total_revenue) OVER (ORDER BY total_revenue DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
             / NULLIF(SUM(total_revenue) OVER (), 0) <= 0.70 THEN 'A'
        WHEN SUM(total_revenue) OVER (ORDER BY total_revenue DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
             / NULLIF(SUM(total_revenue) OVER (), 0) <= 0.90 THEN 'B'
        ELSE 'C'
      END AS abc_class
    FROM revenue_base
  )
  SELECT
    p.id,
    p.code,
    p.name,
    COALESCE(pc.name, 'Uncategorized'),
    COALESCE(uom.code, uom.name, 'pc'),
    COALESCE(p.latest_cogs, 0)::NUMERIC,
    COALESCE(s.current_stock, 0)::NUMERIC,
    COALESCE(ps.total_units_sold, 0)::NUMERIC,
    CASE
      WHEN ps.first_sale_date IS NULL THEN 0::NUMERIC
      ELSE (COALESCE(ps.total_units_sold, 0) / GREATEST(1, CURRENT_DATE - ps.first_sale_date))::NUMERIC
    END AS avg_daily_demand,
    COALESCE(ps.stddev_on_sale_days, 0)::NUMERIC,
    CASE
      WHEN COALESCE(ps.avg_demand_on_sale_days, 0) = 0 THEN 0::NUMERIC
      ELSE (COALESCE(ps.stddev_on_sale_days, 0) / ps.avg_demand_on_sale_days)::NUMERIC
    END AS cv,
    CASE WHEN ps.first_sale_date IS NULL THEN 0
         ELSE (CURRENT_DATE - ps.first_sale_date)::INTEGER END,
    ps.last_sale_date,
    COALESCE(ps.sold_last_30d, 0)::NUMERIC,
    COALESCE(ps.sold_prior_30d, 0)::NUMERIC,
    COALESCE(ps.sold_last_90d, 0)::NUMERIC,
    COALESCE(ps.sold_same_month_last_year, 0)::NUMERIC,
    COALESCE(ps.sold_same_quarter_last_year, 0)::NUMERIC,
    
    -- YoY growth percentage
    CASE 
      WHEN COALESCE(ps.sold_same_month_last_year, 0) = 0 THEN 
        CASE WHEN COALESCE(ps.sold_last_30d, 0) > 0 THEN 100::NUMERIC ELSE 0::NUMERIC END
      ELSE 
        ((COALESCE(ps.sold_last_30d, 0) - ps.sold_same_month_last_year) / ps.sold_same_month_last_year * 100)::NUMERIC
    END AS yoy_growth_pct,
    
    -- Detect if there's a consistent seasonal pattern (compare recent vs YoY)
    CASE
      WHEN ps.first_sale_date IS NULL OR (CURRENT_DATE - ps.first_sale_date) < 365 THEN FALSE
      WHEN COALESCE(ps.sold_same_quarter_last_year, 0) = 0 THEN FALSE
      WHEN ABS(
        (COALESCE(ps.sold_last_90d, 0) / NULLIF(ps.sold_same_quarter_last_year, 0)) - 1
      ) > 0.25 THEN TRUE  -- >25% variance suggests seasonality
      ELSE FALSE
    END AS has_seasonal_pattern,
    
    COALESCE(abc.abc_class, 'C')
  FROM products p
  LEFT JOIN product_categories pc  ON pc.id  = p.category_id
  LEFT JOIN units_of_measure   uom ON uom.id = p.base_uom_id
  LEFT JOIN stock              s   ON s.product_id = p.id
  LEFT JOIN product_stats      ps  ON ps.product_id = p.id
  LEFT JOIN abc                    ON abc.product_id = p.id
  WHERE p.is_active = TRUE
    AND (COALESCE(s.current_stock, 0) > 0 OR COALESCE(ps.total_units_sold, 0) > 0)
  ORDER BY p.name;
$$;

-- Comment explaining the enhancements
COMMENT ON FUNCTION get_demand_forecast_v2() IS 
'Enhanced demand forecast with year-over-year trend analysis and seasonal pattern detection. 
Includes: last 90d sales, same month last year, same quarter last year, YoY growth %, 
and automatic seasonality detection (>25% variance = seasonal).';
