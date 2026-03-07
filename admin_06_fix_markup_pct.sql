-- ============================================================================
-- ADMIN STEP 6: Recalculate Markup % on Products + Product Selling Units
-- ============================================================================
-- Problem: markup_percentage on both tables may be stale after COGS corrections
-- from PO UOM fixes and the admin_05 cogs_per_unit fix.
--
-- What is CORRECT (do NOT touch):
--   • products.current_selling_price      — the actual price charged
--   • product_selling_units.selling_price — the actual price charged per PSU
--   • products.latest_cogs                — updated by PO receive trigger (trusted)
--
-- What this script RECALCULATES:
--   • products.markup_percentage
--   • product_selling_units.markup_percentage
--
-- Formula:  markup_pct = ((selling_price / effective_cogs) - 1) * 100
--   where effective_cogs:
--     • Primary / standard selling UOM (psu.uom_id = products.selling_uom_id):
--         effective_cogs = products.latest_cogs
--     • Alternate PSU (psu.uom_id != products.selling_uom_id):
--         effective_cogs = products.latest_cogs / psu.conversion_factor
-- ============================================================================


-- ── STEP 1: Preview — products where markup_pct will change ──────────────────
SELECT
    p.code                          AS product_code,
    p.name                          AS product_name,
    p.latest_cogs,
    p.current_selling_price,
    p.markup_percentage             AS old_markup_pct,
    ROUND(
        (p.current_selling_price / NULLIF(p.latest_cogs, 0) - 1) * 100
    , 2)                            AS new_markup_pct,
    ROUND(ABS(
        p.markup_percentage -
        (p.current_selling_price / NULLIF(p.latest_cogs, 0) - 1) * 100
    ), 2)                           AS delta_pct
FROM products p
WHERE p.is_active = true
  AND p.latest_cogs > 0
  AND p.current_selling_price > 0
  AND ABS(
        p.markup_percentage -
        (p.current_selling_price / NULLIF(p.latest_cogs, 0) - 1) * 100
      ) > 0.1
ORDER BY delta_pct DESC;


-- ── STEP 2: Preview — PSU rows where markup_pct will change ──────────────────
SELECT
    p.code                          AS product_code,
    p.name                          AS product_name,
    uom.code                        AS uom_code,
    psu.is_primary,
    psu.selling_price,
    p.latest_cogs                   AS product_cogs,
    psu.conversion_factor           AS psu_cf,
    CASE
        WHEN psu.uom_id = p.selling_uom_id
        THEN p.latest_cogs
        ELSE ROUND((p.latest_cogs / NULLIF(psu.conversion_factor, 0))::NUMERIC, 4)
    END                             AS effective_cogs,
    psu.markup_percentage           AS old_markup_pct,
    ROUND(
        (psu.selling_price / NULLIF(
            CASE
                WHEN psu.uom_id = p.selling_uom_id
                THEN p.latest_cogs
                ELSE p.latest_cogs / NULLIF(psu.conversion_factor, 0)
            END
        , 0) - 1) * 100
    , 2)                            AS new_markup_pct
FROM product_selling_units psu
JOIN products p           ON p.id   = psu.product_id
LEFT JOIN units_of_measure uom ON uom.id = psu.uom_id
WHERE p.latest_cogs > 0
  AND psu.selling_price > 0
  AND psu.is_active = true
  AND ABS(
        psu.markup_percentage -
        (psu.selling_price / NULLIF(
            CASE
                WHEN psu.uom_id = p.selling_uom_id
                THEN p.latest_cogs
                ELSE p.latest_cogs / NULLIF(psu.conversion_factor, 0)
            END
        , 0) - 1) * 100
      ) > 0.1
ORDER BY p.code, psu.is_primary DESC;


-- ── STEP 3: Apply fix — products.markup_percentage ───────────────────────────
UPDATE products p
SET
    markup_percentage = ROUND(
        (p.current_selling_price / NULLIF(p.latest_cogs, 0) - 1) * 100
    , 2),
    updated_at = NOW()
WHERE p.is_active = true
  AND p.latest_cogs > 0
  AND p.current_selling_price > 0
  AND ABS(
        p.markup_percentage -
        (p.current_selling_price / NULLIF(p.latest_cogs, 0) - 1) * 100
      ) > 0.1;


-- ── STEP 4: Apply fix — product_selling_units.markup_percentage ──────────────
UPDATE product_selling_units psu
SET
    markup_percentage = ROUND(
        (psu.selling_price / NULLIF(
            CASE
                WHEN psu.uom_id = p.selling_uom_id
                THEN p.latest_cogs
                ELSE p.latest_cogs / NULLIF(psu.conversion_factor, 0)
            END
        , 0) - 1) * 100
    , 2),
    updated_at = NOW()
FROM products p
WHERE psu.product_id = p.id
  AND p.latest_cogs > 0
  AND psu.selling_price > 0
  AND psu.is_active = true
  AND ABS(
        psu.markup_percentage -
        (psu.selling_price / NULLIF(
            CASE
                WHEN psu.uom_id = p.selling_uom_id
                THEN p.latest_cogs
                ELSE p.latest_cogs / NULLIF(psu.conversion_factor, 0)
            END
        , 0) - 1) * 100
      ) > 0.1;


-- ── STEP 5: Verify — products sorted by margin (flag low/negative) ───────────
SELECT
    p.code,
    p.name,
    p.latest_cogs,
    p.current_selling_price,
    p.markup_percentage             AS markup_pct,
    CASE
        WHEN p.markup_percentage < 0   THEN '⚠️  BELOW COST'
        WHEN p.markup_percentage < 5   THEN '⚠️  NEAR ZERO'
        WHEN p.markup_percentage < 15  THEN '⚡ LOW MARGIN'
        ELSE '✓ OK'
    END                             AS margin_status
FROM products p
WHERE p.is_active = true
  AND p.latest_cogs > 0
ORDER BY p.markup_percentage ASC
LIMIT 30;
