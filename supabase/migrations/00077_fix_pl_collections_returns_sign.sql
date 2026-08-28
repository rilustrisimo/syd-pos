-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: get_pl_collections counts refund cash-outs as cash in
--
-- Root cause:
--   get_pl_collections had no transaction_type filter and no sign flip for
--   returns, unlike get_pl_revenue_cogs_daily. A return row stores
--   amount_paid = refund_amount (cash paid OUT to the customer), but it was
--   being summed as if it were cash received, inflating Collections relative
--   to Revenue by roughly 2x the refunded amount for any period with returns.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_pl_collections(p_date_from date, p_date_to date)
RETURNS TABLE (total_collections numeric)
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(
    CASE WHEN transaction_type = 'return' THEN -1 ELSE 1 END
    * LEAST(amount_paid, total_amount)
  ), 0) AS total_collections
  FROM transactions
  WHERE is_deleted = FALSE
    AND transaction_type IN ('sale', 'return')
    AND (transaction_date AT TIME ZONE 'Asia/Manila')::date BETWEEN p_date_from AND p_date_to;
$$;

GRANT EXECUTE ON FUNCTION get_pl_collections(date, date) TO authenticated;
