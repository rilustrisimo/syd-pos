-- ============================================================================
-- Diagnose today's COGS vs Revenue per product
-- ============================================================================
-- Run this to find which products/lines are dragging down gross profit today
-- ============================================================================

-- 1. Summary per product for today
SELECT
    p.code                          AS product_code,
    p.name                          AS product_name,
    uom.code                        AS sale_uom,
    base_uom.code                   AS base_uom,
    t.transaction_type,
    SUM(tl.quantity)                AS qty_sold,
    SUM(tl.line_total)              AS revenue,
    SUM(tl.quantity * tl.cogs_per_unit) AS total_cogs,
    SUM(tl.line_total) - SUM(tl.quantity * tl.cogs_per_unit) AS gross_profit,
    ROUND(
        CASE WHEN SUM(tl.line_total) > 0
            THEN (SUM(tl.line_total) - SUM(tl.quantity * tl.cogs_per_unit)) / SUM(tl.line_total) * 100
            ELSE 0
        END, 1
    )                               AS margin_pct,
    MIN(tl.cogs_per_unit)           AS min_cogs_per_unit,
    MAX(tl.cogs_per_unit)           AS max_cogs_per_unit,
    p.latest_cogs                   AS current_latest_cogs
FROM transaction_lines tl
JOIN transactions t     ON t.id  = tl.transaction_id
JOIN products p         ON p.id  = tl.product_id
LEFT JOIN units_of_measure uom      ON uom.id  = tl.uom_id
LEFT JOIN units_of_measure base_uom ON base_uom.id = p.base_uom_id
WHERE t.is_deleted = false
  AND t.transaction_type IN ('sale', 'return')
  AND t.transaction_date >= CURRENT_DATE::TIMESTAMPTZ
  AND t.transaction_date <  (CURRENT_DATE + INTERVAL '1 day')::TIMESTAMPTZ
GROUP BY p.code, p.name, uom.code, base_uom.code, t.transaction_type, p.latest_cogs
ORDER BY total_cogs DESC;


-- 2. Grand total check
SELECT
    SUM(tl.line_total)                                          AS total_revenue,
    SUM(tl.quantity * tl.cogs_per_unit)                         AS total_cogs,
    SUM(tl.line_total) - SUM(tl.quantity * tl.cogs_per_unit)    AS gross_profit,
    SUM(t.delivery_fee + t.other_fees) / COUNT(DISTINCT t.id)   AS avg_fees_per_txn,
    COUNT(DISTINCT t.id)                                        AS transaction_count
FROM transaction_lines tl
JOIN transactions t  ON t.id = tl.transaction_id
WHERE t.is_deleted = false
  AND t.transaction_type IN ('sale', 'return')
  AND t.transaction_date >= CURRENT_DATE::TIMESTAMPTZ
  AND t.transaction_date <  (CURRENT_DATE + INTERVAL '1 day')::TIMESTAMPTZ;
