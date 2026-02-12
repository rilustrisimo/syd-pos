-- Function to calculate inventory turnover metrics
CREATE OR REPLACE FUNCTION get_inventory_turnover(
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ
)
RETURNS TABLE (
  product_id UUID,
  product_code VARCHAR,
  product_name VARCHAR,
  category_name VARCHAR,
  current_stock BIGINT,
  avg_stock NUMERIC,
  units_sold BIGINT,
  cogs_sold NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH product_sales AS (
    -- Get total units sold and COGS for each product
    SELECT
      tl.product_id,
      SUM(tl.quantity) AS units_sold,
      SUM(tl.cost_price * tl.quantity) AS cogs_sold
    FROM transaction_lines tl
    JOIN transactions t ON t.id = tl.transaction_id
    WHERE t.transaction_type = 'sale'
      AND t.status = 'completed'
      AND t.created_at >= start_date
      AND t.created_at <= end_date
    GROUP BY tl.product_id
  ),
  current_inventory AS (
    -- Get current stock levels per product (sum across all branches)
    SELECT
      product_id,
      SUM(quantity_on_hand) AS current_stock
    FROM branch_inventory
    GROUP BY product_id
  ),
  avg_inventory AS (
    -- Calculate average inventory during the period
    -- This is a simplified approach - in production, you might track daily snapshots
    SELECT
      product_id,
      AVG(quantity_on_hand) AS avg_stock
    FROM branch_inventory
    GROUP BY product_id
  )
  SELECT
    p.id AS product_id,
    p.code AS product_code,
    p.name AS product_name,
    pc.name AS category_name,
    COALESCE(ci.current_stock, 0) AS current_stock,
    COALESCE(ai.avg_stock, ci.current_stock, 0) AS avg_stock,
    COALESCE(ps.units_sold, 0) AS units_sold,
    COALESCE(ps.cogs_sold, 0) AS cogs_sold
  FROM products p
  LEFT JOIN product_categories pc ON pc.id = p.category_id
  LEFT JOIN product_sales ps ON ps.product_id = p.id
  LEFT JOIN current_inventory ci ON ci.product_id = p.id
  LEFT JOIN avg_inventory ai ON ai.product_id = p.id
  WHERE p.is_active = TRUE
  ORDER BY ps.units_sold DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_inventory_turnover(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
