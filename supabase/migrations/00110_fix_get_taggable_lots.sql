-- Migration 00110: Fix "column reference lot_id is ambiguous" in get_taggable_lots
--
-- get_taggable_lots (00108) returns a column named lot_id and also selected an
-- unqualified lot_id in a subquery. In PL/pgSQL the output column is a
-- variable, so every call failed and the Tag to Investment dialog always
-- showed "Nothing left to tag". The subquery is now qualified, and the
-- admin functions that return tables also get #variable_conflict use_column
-- so a column name always means the table column. Product names are
-- varchar, so they're cast to the declared text type (RETURN QUERY is strict;
-- get_investment_sales had the same problem).

CREATE OR REPLACE FUNCTION public.get_taggable_lots(p_po_id uuid DEFAULT NULL, p_product_id uuid DEFAULT NULL)
RETURNS TABLE (
  lot_id uuid, po_id uuid, po_line_id uuid, product_id uuid, product_name text,
  branch_id uuid, received_at timestamptz, unit_cost numeric,
  qty_received numeric, qty_remaining numeric, qty_tagged_remaining numeric, qty_taggable numeric
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  PERFORM lots_private.assert_admin();
  RETURN QUERY
    SELECT l.id, l.po_id, l.po_line_id, l.product_id, p.name::text, l.branch_id, l.received_at, l.unit_cost,
           l.qty_received, l.qty_remaining,
           COALESCE(s.tagged, 0),
           l.qty_remaining - COALESCE(s.tagged, 0)
    FROM inventory_lots l
    JOIN products p ON p.id = l.product_id
    LEFT JOIN (
      -- Qualified: lot_id is also an output column of this function.
      SELECT sh.lot_id AS share_lot_id, SUM(sh.qty_remaining) AS tagged
      FROM investment_lot_shares sh GROUP BY sh.lot_id
    ) s ON s.share_lot_id = l.id
    WHERE (p_po_id IS NULL OR l.po_id = p_po_id)
      AND (p_product_id IS NULL OR l.product_id = p_product_id)
      AND (p_po_id IS NOT NULL OR p_product_id IS NOT NULL)
    ORDER BY l.received_at, p.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_investment_figures(p_investment_id uuid DEFAULT NULL)
RETURNS TABLE (
  investment_id uuid, capital_in numeric, withdrawals numeric, payouts numeric,
  units_tagged numeric, tagged_cost numeric, units_in_stock numeric, stock_value numeric,
  units_sold numeric, revenue_collected numeric, capital_returned numeric, profit_earned numeric,
  buybacks numeric, available numeric, owed_to_investor numeric
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  PERFORM lots_private.assert_admin();
  RETURN QUERY SELECT * FROM lots_private.investment_figures(p_investment_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_investment_sales(p_investment_id uuid)
RETURNS TABLE (
  consumption_id uuid, transaction_id uuid, transaction_number text, transaction_date timestamptz,
  product_id uuid, product_name text, lot_share_id uuid, qty_sold numeric, unit_cost numeric,
  unit_revenue numeric, paid_ratio numeric, investor_share numeric
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  PERFORM lots_private.assert_admin();
  RETURN QUERY
    SELECT r.consumption_id, r.transaction_id, r.transaction_number, r.transaction_date,
           r.product_id, p.name::text, r.lot_share_id, r.qty_sold, r.unit_cost, r.unit_revenue, r.paid_ratio,
           ROUND(r.qty_sold * (r.unit_cost + (r.unit_revenue - r.unit_cost) * i.profit_share_pct / 100)
                 * r.paid_ratio, 2)
    FROM lots_private.investment_sale_rows(p_investment_id) r
    JOIN investments i ON i.id = r.investment_id
    JOIN products p    ON p.id = r.product_id
    WHERE r.qty_sold > 0
    ORDER BY r.transaction_date DESC;
END;
$$;
