-- ─── 1. Daily purchase cost from received POs (PH timezone) ──────────────────
CREATE OR REPLACE FUNCTION get_pl_purchases_daily(p_date_from date, p_date_to date)
RETURNS TABLE (
  ph_date          date,
  merchandise_cost numeric,
  delivery_cost    numeric,
  total_purchases  numeric
)
LANGUAGE sql STABLE AS $$
  SELECT
    (COALESCE(po.actual_delivery_date, po.po_date) AT TIME ZONE 'Asia/Manila')::date AS ph_date,
    SUM(pol.quantity_received * pol.unit_cost)                                        AS merchandise_cost,
    SUM(CASE WHEN po.status = 'received' THEN po.delivery_charge ELSE 0 END)         AS delivery_cost,
    SUM(pol.quantity_received * pol.unit_cost)
      + SUM(CASE WHEN po.status = 'received' THEN po.delivery_charge ELSE 0 END)     AS total_purchases
  FROM purchase_orders po
  JOIN purchase_order_lines pol ON pol.po_id = po.id
  WHERE po.is_deleted = FALSE
    AND po.status IN ('received', 'partially_received')
    AND (COALESCE(po.actual_delivery_date, po.po_date) AT TIME ZONE 'Asia/Manila')::date
        BETWEEN p_date_from AND p_date_to
  GROUP BY ph_date
  ORDER BY ph_date;
$$;

-- ─── 2. Total cash actually collected from customers in period ────────────────
-- Uses LEAST(amount_paid, total_amount) to exclude change given back to customers
-- (amount_paid stores cash tendered, not net cash received)
CREATE OR REPLACE FUNCTION get_pl_collections(p_date_from date, p_date_to date)
RETURNS TABLE (total_collections numeric)
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(LEAST(amount_paid, total_amount)), 0) AS total_collections
  FROM transactions
  WHERE is_deleted = FALSE
    AND (transaction_date AT TIME ZONE 'Asia/Manila')::date BETWEEN p_date_from AND p_date_to;
$$;

-- ─── 3. Inventory summary — server-side aggregation (no PostgREST row-limit risk)
CREATE OR REPLACE FUNCTION get_inventory_summary(p_branch_id uuid DEFAULT NULL)
RETURNS TABLE (
  total_items        bigint,
  total_quantity     numeric,
  total_value        numeric,
  potential_profit   numeric,
  low_stock_count    bigint,
  out_of_stock_count bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    COUNT(DISTINCT bi.product_id)                                                   AS total_items,
    COALESCE(SUM(bi.quantity_on_hand), 0)                                           AS total_quantity,
    COALESCE(SUM(bi.quantity_on_hand * p.latest_cogs), 0)                           AS total_value,
    COALESCE(SUM(
      CASE WHEN bi.quantity_on_hand > 0
        THEN bi.quantity_on_hand * (p.current_selling_price - p.latest_cogs)
        ELSE 0
      END
    ), 0)                                                                           AS potential_profit,
    COUNT(CASE WHEN bi.quantity_on_hand > 0
      AND bi.quantity_on_hand <= p.reorder_point THEN 1 END)                        AS low_stock_count,
    COUNT(CASE WHEN bi.quantity_on_hand <= 0 THEN 1 END)                            AS out_of_stock_count
  FROM branch_inventory bi
  JOIN products p ON p.id = bi.product_id
  WHERE (p_branch_id IS NULL OR bi.branch_id = p_branch_id)
    AND p.is_active = TRUE;
$$;

-- ─── Grants ───────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION get_pl_purchases_daily(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION get_pl_collections(date, date)     TO authenticated;
GRANT EXECUTE ON FUNCTION get_inventory_summary(uuid)        TO authenticated;
