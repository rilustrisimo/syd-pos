-- ============================================================================
-- Diagnose: Compare latest_cogs on ALL products vs their most recent PO cost
-- ============================================================================
-- Shows products where latest_cogs deviates significantly from what the
-- most recent PO would imply. Run this to find any remaining wrong COGS.
--
-- implied_latest_cogs = what the DB trigger SHOULD have set:
--   • base_uom = sell_uom (conv_factor = 1):  pol.unit_cost
--   • base_uom ≠ sell_uom:                    pol.unit_cost / conv_factor
-- ============================================================================

WITH latest_po_per_product AS (
    -- Get the most recent received PO line per product
    SELECT DISTINCT ON (pol.product_id)
        pol.product_id,
        pol.unit_cost           AS po_unit_cost,
        pol.uom_id              AS po_uom_id,
        po.po_number,
        po.po_date
    FROM purchase_order_lines pol
    JOIN purchase_orders po ON po.id = pol.po_id
    WHERE po.is_deleted = false
      AND pol.quantity_received > 0
    ORDER BY pol.product_id, po.po_date DESC, po.created_at DESC
)
SELECT
    p.code                          AS product_code,
    p.name                          AS product_name,
    p.latest_cogs                   AS current_latest_cogs,
    p.base_unit_cost                AS current_base_unit_cost,
    p.conversion_factor             AS conv_factor,
    p.current_selling_price,
    base_uom.code                   AS base_uom,
    sell_uom.code                   AS sell_uom,
    lp.po_number                    AS latest_po,
    lp.po_date                      AS latest_po_date,
    lp.po_unit_cost                 AS po_unit_cost,
    po_uom.code                     AS po_uom,
    -- What latest_cogs should be based on most recent PO
    ROUND(CASE
        WHEN p.base_uom_id != p.selling_uom_id AND p.conversion_factor > 0
        THEN lp.po_unit_cost / p.conversion_factor
        ELSE lp.po_unit_cost
    END::NUMERIC, 4)                AS implied_latest_cogs,
    -- Deviation
    ROUND(ABS(
        p.latest_cogs - CASE
            WHEN p.base_uom_id != p.selling_uom_id AND p.conversion_factor > 0
            THEN lp.po_unit_cost / p.conversion_factor
            ELSE lp.po_unit_cost
        END
    )::NUMERIC, 4)                  AS cogs_deviation,
    ROUND(ABS(
        p.latest_cogs - CASE
            WHEN p.base_uom_id != p.selling_uom_id AND p.conversion_factor > 0
            THEN lp.po_unit_cost / p.conversion_factor
            ELSE lp.po_unit_cost
        END
    ) / NULLIF(CASE
            WHEN p.base_uom_id != p.selling_uom_id AND p.conversion_factor > 0
            THEN lp.po_unit_cost / p.conversion_factor
            ELSE lp.po_unit_cost
        END, 0) * 100
    ::NUMERIC, 1)                   AS deviation_pct
FROM products p
JOIN latest_po_per_product lp   ON lp.product_id = p.id
LEFT JOIN units_of_measure base_uom ON base_uom.id = p.base_uom_id
LEFT JOIN units_of_measure sell_uom ON sell_uom.id = p.selling_uom_id
LEFT JOIN units_of_measure po_uom   ON po_uom.id   = lp.po_uom_id
WHERE p.is_active = true
  AND p.latest_cogs > 0
  AND lp.po_unit_cost > 0
  -- Only show products where latest_cogs differs from implied by > 5%
  AND ABS(
        p.latest_cogs - CASE
            WHEN p.base_uom_id != p.selling_uom_id AND p.conversion_factor > 0
            THEN lp.po_unit_cost / p.conversion_factor
            ELSE lp.po_unit_cost
        END
      ) / NULLIF(CASE
            WHEN p.base_uom_id != p.selling_uom_id AND p.conversion_factor > 0
            THEN lp.po_unit_cost / p.conversion_factor
            ELSE lp.po_unit_cost
        END, 0) > 0.05
ORDER BY deviation_pct DESC;
