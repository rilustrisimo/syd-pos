-- ============================================================================
-- ADMIN STEP 5: Fix cogs_per_unit on All Transaction Lines
-- ============================================================================
-- Problem: Some transaction lines have inflated or mismatched cogs_per_unit
-- because latest_cogs was wrong at time of sale (bad PO UOM, PO bloat, etc.)
--
-- Fix logic per line:
--   • If line UOM has an active PSU entry (non-primary selling unit, e.g. bulk):
--       cogs_per_unit = products.latest_cogs / psu.conversion_factor
--   • Otherwise (line is in selling_uom or base_uom):
--       cogs_per_unit = products.latest_cogs
--
-- Note: transaction_lines.line_profit is a GENERATED column — it auto-updates.
-- ============================================================================

-- ── STEP 1: Preview — what will change ────────────────────────────────────────
SELECT
    p.code                              AS product_code,
    p.name                              AS product_name,
    sale_uom.code                       AS sale_uom,
    COUNT(tl.id)                        AS affected_lines,
    ROUND(AVG(tl.cogs_per_unit)::NUMERIC, 4)   AS avg_current_cogs,
    ROUND(AVG(
        COALESCE(
            CASE
                WHEN psu.id IS NOT NULL
                     AND psu.conversion_factor > 0
                     AND tl.uom_id != p.selling_uom_id
                THEN p.latest_cogs / psu.conversion_factor
            END,
            p.latest_cogs
        )
    )::NUMERIC, 4)                      AS avg_expected_cogs,
    ROUND(SUM(tl.quantity * tl.cogs_per_unit)::NUMERIC, 2)  AS current_total_cogs,
    ROUND(SUM(tl.quantity * COALESCE(
        CASE
            WHEN psu.id IS NOT NULL
                 AND psu.conversion_factor > 0
                 AND tl.uom_id != p.selling_uom_id
            THEN p.latest_cogs / psu.conversion_factor
        END,
        p.latest_cogs
    ))::NUMERIC, 2)                     AS expected_total_cogs
FROM transaction_lines tl
JOIN transactions t         ON t.id   = tl.transaction_id
JOIN products p             ON p.id   = tl.product_id
LEFT JOIN units_of_measure sale_uom ON sale_uom.id = tl.uom_id
LEFT JOIN product_selling_units psu
    ON  psu.product_id      = tl.product_id
    AND psu.uom_id          = tl.uom_id
    AND psu.is_active       = true
    AND psu.conversion_factor > 0
WHERE t.is_deleted = false
  AND p.latest_cogs > 0
  AND ABS(
        tl.cogs_per_unit - COALESCE(
            CASE
                WHEN psu.id IS NOT NULL
                     AND psu.conversion_factor > 0
                     AND tl.uom_id != p.selling_uom_id
                THEN p.latest_cogs / psu.conversion_factor
            END,
            p.latest_cogs
        )
      ) > 0.01
GROUP BY p.code, p.name, sale_uom.code
ORDER BY (ROUND(SUM(tl.quantity * tl.cogs_per_unit)::NUMERIC, 2) -
          ROUND(SUM(tl.quantity * COALESCE(
              CASE WHEN psu.id IS NOT NULL AND psu.conversion_factor > 0 AND tl.uom_id != p.selling_uom_id
                   THEN p.latest_cogs / psu.conversion_factor END,
              p.latest_cogs
          ))::NUMERIC, 2)) DESC;


-- ── STEP 2: Apply fix ─────────────────────────────────────────────────────────
-- Note: PostgreSQL does not allow referencing the UPDATE target (tl) inside
-- JOIN ON clauses in the FROM clause. All joins are done in a subquery instead.
UPDATE transaction_lines tl
SET
    cogs_per_unit = sub.new_cogs
FROM (
    SELECT
        tl2.id,
        COALESCE(
            CASE
                WHEN psu.id IS NOT NULL
                     AND psu.conversion_factor > 0
                     AND tl2.uom_id != p.selling_uom_id
                THEN p.latest_cogs / psu.conversion_factor
            END,
            p.latest_cogs
        ) AS new_cogs
    FROM transaction_lines tl2
    JOIN transactions t  ON t.id  = tl2.transaction_id
    JOIN products p      ON p.id  = tl2.product_id
    LEFT JOIN product_selling_units psu
        ON  psu.product_id      = tl2.product_id
        AND psu.uom_id          = tl2.uom_id
        AND psu.is_active       = true
        AND psu.conversion_factor > 0
    WHERE t.is_deleted = false
      AND p.latest_cogs > 0
      AND ABS(
            tl2.cogs_per_unit - COALESCE(
                CASE
                    WHEN psu.id IS NOT NULL
                         AND psu.conversion_factor > 0
                         AND tl2.uom_id != p.selling_uom_id
                    THEN p.latest_cogs / psu.conversion_factor
                END,
                p.latest_cogs
            )
          ) > 0.01
) sub
WHERE tl.id = sub.id;


--- ── STEP 3: Verify — overall profit summary after fix ────────────────────────
-- Run this after applying Step 2 to confirm improvement.
SELECT
    COUNT(DISTINCT t.id)                        AS transactions,
    SUM(tl.line_total)                          AS total_revenue,
    SUM(tl.quantity * tl.cogs_per_unit)         AS total_cogs,
    SUM(tl.line_profit)                         AS gross_profit,
    ROUND(
        SUM(tl.line_profit) / NULLIF(SUM(tl.line_total), 0) * 100
    , 1)                                        AS margin_pct
FROM transaction_lines tl
JOIN transactions t ON t.id = tl.transaction_id
WHERE t.is_deleted = false
  AND t.transaction_type IN ('sale', 'return');
