-- ============================================================================
-- Diagnostic: Products where base_unit_cost ≠ latest_cogs * conversion_factor
-- Run this in Supabase SQL Editor to see the drift before applying the fix.
-- ============================================================================

SELECT
    p.code,
    p.name,
    b.code  AS base_uom,
    s.code  AS selling_uom,
    p.conversion_factor,
    p.latest_cogs                                                         AS cogs_per_piece,
    p.base_unit_cost                                                      AS base_unit_cost_current,
    ROUND(p.latest_cogs * COALESCE(NULLIF(p.conversion_factor, 0), 1), 4) AS base_unit_cost_expected,
    ROUND(
        p.base_unit_cost
        - ROUND(p.latest_cogs * COALESCE(NULLIF(p.conversion_factor, 0), 1), 4)
    , 4)                                                                  AS drift
FROM products p
LEFT JOIN units_of_measure b ON b.id = p.base_uom_id
LEFT JOIN units_of_measure s ON s.id = p.selling_uom_id
WHERE
    p.is_active = true
    AND p.latest_cogs > 0
    AND ABS(
        p.base_unit_cost
        - ROUND(p.latest_cogs * COALESCE(NULLIF(p.conversion_factor, 0), 1), 4)
    ) > 0.0001
ORDER BY ABS(
    p.base_unit_cost
    - ROUND(p.latest_cogs * COALESCE(NULLIF(p.conversion_factor, 0), 1), 4)
) DESC;
