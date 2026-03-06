-- ============================================================================
-- DIAGNOSTIC: Find All Products With Suspected PO Over-Entry / Inventory Bloat
-- ============================================================================
-- Compares current inventory against source-of-truth recalculation.
-- Flags products where inventory is significantly higher than expected,
-- which usually indicates a PO was entered with wrong quantity or wrong UOM.
--
-- Run STEP 1 first to see all discrepancies.
-- Run STEP 2 to drill into the PO history of any flagged product.
-- ============================================================================


-- ============================================================================
-- STEP 1: Full inventory discrepancy report across all products
-- Shows: expected (from source records) vs current, and the gap
-- ============================================================================

WITH

-- All received PO quantities converted to base units
po_received AS (
    SELECT
        pol.product_id,
        pol.variant_id,
        po.branch_id,
        SUM(
            pol.quantity_received * COALESCE(
                -- Check product_selling_units for this UOM
                (SELECT psu.conversion_factor
                 FROM product_selling_units psu
                 WHERE psu.product_id = pol.product_id
                   AND psu.uom_id     = pol.uom_id
                   AND psu.is_active  = true
                 LIMIT 1),
                -- Fall back to product's default conversion if it's the selling UOM
                (SELECT CASE
                    WHEN p2.selling_uom_id = pol.uom_id AND p2.conversion_factor > 0
                    THEN p2.conversion_factor
                    ELSE 1
                 END
                 FROM products p2 WHERE p2.id = pol.product_id),
                1
            )
        ) AS total_received_base
    FROM purchase_order_lines pol
    JOIN purchase_orders po ON po.id = pol.po_id
    WHERE po.is_deleted = false
      AND pol.quantity_received > 0
    GROUP BY pol.product_id, pol.variant_id, po.branch_id
),

-- All sold quantities converted to base units
sold AS (
    SELECT
        tl.product_id,
        tl.variant_id,
        t.branch_id,
        SUM(
            tl.quantity / COALESCE(
                (SELECT psu.conversion_factor
                 FROM product_selling_units psu
                 WHERE psu.product_id = tl.product_id
                   AND psu.uom_id     = tl.uom_id
                   AND psu.is_active  = true
                 LIMIT 1),
                (SELECT CASE
                    WHEN p2.selling_uom_id = tl.uom_id AND p2.conversion_factor > 0
                    THEN p2.conversion_factor
                    ELSE 1
                 END
                 FROM products p2 WHERE p2.id = tl.product_id),
                1
            )
        ) AS total_sold_base
    FROM transaction_lines tl
    JOIN transactions t ON t.id = tl.transaction_id
    WHERE t.is_deleted     = false
      AND t.transaction_type = 'sale'
    GROUP BY tl.product_id, tl.variant_id, t.branch_id
),

-- Restocked returns (should_restock = true or null treated as true for older records)
returns AS (
    SELECT
        tl.product_id,
        tl.variant_id,
        t.branch_id,
        SUM(
            tl.quantity / COALESCE(
                (SELECT psu.conversion_factor
                 FROM product_selling_units psu
                 WHERE psu.product_id = tl.product_id
                   AND psu.uom_id     = tl.uom_id
                   AND psu.is_active  = true
                 LIMIT 1),
                (SELECT CASE
                    WHEN p2.selling_uom_id = tl.uom_id AND p2.conversion_factor > 0
                    THEN p2.conversion_factor
                    ELSE 1
                 END
                 FROM products p2 WHERE p2.id = tl.product_id),
                1
            )
        ) AS total_returned_base
    FROM transaction_lines tl
    JOIN transactions t ON t.id = tl.transaction_id
    WHERE t.is_deleted      = false
      AND t.transaction_type = 'return'
      AND COALESCE(tl.should_restock, true) = true
    GROUP BY tl.product_id, tl.variant_id, t.branch_id
),

-- Manual adjustments only (physical count corrections — NOT system fixes)
manual_adj AS (
    SELECT
        product_id, variant_id, branch_id,
        SUM(quantity_change) AS total_adj
    FROM inventory_movements
    WHERE reference_type = 'manual_adjustment'
    GROUP BY product_id, variant_id, branch_id
),

-- Source-of-truth per product per branch
expected AS (
    SELECT
        COALESCE(pr.product_id, s.product_id, r.product_id, m.product_id) AS product_id,
        COALESCE(pr.variant_id, s.variant_id, r.variant_id, m.variant_id) AS variant_id,
        COALESCE(pr.branch_id,  s.branch_id,  r.branch_id,  m.branch_id)  AS branch_id,
        COALESCE(pr.total_received_base, 0)  AS purchased,
        COALESCE(s.total_sold_base, 0)       AS sold,
        COALESCE(r.total_returned_base, 0)   AS returned,
        COALESCE(m.total_adj, 0)             AS manual_adj,
        GREATEST(0,
            COALESCE(pr.total_received_base, 0)
            - COALESCE(s.total_sold_base, 0)
            + COALESCE(r.total_returned_base, 0)
            + COALESCE(m.total_adj, 0)
        ) AS expected_qty
    FROM po_received pr
    FULL OUTER JOIN sold     s ON s.product_id = pr.product_id AND s.branch_id = pr.branch_id AND COALESCE(s.variant_id::TEXT,'') = COALESCE(pr.variant_id::TEXT,'')
    FULL OUTER JOIN returns  r ON r.product_id = COALESCE(pr.product_id,s.product_id) AND r.branch_id = COALESCE(pr.branch_id,s.branch_id) AND COALESCE(r.variant_id::TEXT,'') = COALESCE(pr.variant_id::TEXT,'')
    FULL OUTER JOIN manual_adj m ON m.product_id = COALESCE(pr.product_id,s.product_id,r.product_id) AND m.branch_id = COALESCE(pr.branch_id,s.branch_id,r.branch_id) AND COALESCE(m.variant_id::TEXT,'') = COALESCE(pr.variant_id::TEXT,'')
)

SELECT
    p.code,
    p.name,
    b.name                              AS branch,
    uom.code                            AS base_uom,
    e.purchased                         AS po_received,
    e.sold                              AS sold,
    e.returned                          AS returned,
    e.manual_adj                        AS manual_adj,
    e.expected_qty                      AS expected,
    COALESCE(bi.quantity_on_hand, 0)    AS current,
    COALESCE(bi.quantity_on_hand, 0) - e.expected_qty  AS gap,
    -- Ratio: how many times bigger is current vs expected?
    CASE WHEN e.expected_qty > 0
        THEN ROUND((COALESCE(bi.quantity_on_hand, 0) / e.expected_qty)::NUMERIC, 1)
        ELSE NULL
    END                                 AS current_to_expected_ratio,
    p.conversion_factor,
    base.code                           AS selling_uom_code
FROM expected e
JOIN products p  ON p.id  = e.product_id
JOIN branches b  ON b.id  = e.branch_id
LEFT JOIN branch_inventory bi ON bi.product_id = e.product_id AND bi.branch_id = e.branch_id AND COALESCE(bi.variant_id::TEXT,'') = COALESCE(e.variant_id::TEXT,'')
LEFT JOIN units_of_measure uom  ON uom.id  = p.base_uom_id
LEFT JOIN units_of_measure base ON base.id = p.selling_uom_id
WHERE
    -- Only show products with notable discrepancies
    ABS(COALESCE(bi.quantity_on_hand, 0) - e.expected_qty) > 0.5
ORDER BY
    -- Sort by worst offenders first (biggest absolute gap)
    ABS(COALESCE(bi.quantity_on_hand, 0) - e.expected_qty) DESC;


-- ============================================================================
-- STEP 2: Drill into PO history for a specific product
-- Replace 'PRODUCT_CODE_HERE' with the code from STEP 1 (e.g. 'CN-1.5')
-- ============================================================================

-- 2a. All PO lines for this product
SELECT
    pol.id                              AS po_line_id,
    po.po_number,
    po.po_date,
    po.status,
    pol.quantity_ordered,
    pol.quantity_received,
    uom.code                            AS uom,
    pol.unit_cost,
    -- How many base units this line added (using conversion)
    pol.quantity_received * COALESCE(
        (SELECT psu.conversion_factor FROM product_selling_units psu
         WHERE psu.product_id = pol.product_id AND psu.uom_id = pol.uom_id AND psu.is_active = true LIMIT 1),
        (SELECT CASE WHEN p2.selling_uom_id = pol.uom_id THEN p2.conversion_factor ELSE 1 END
         FROM products p2 WHERE p2.id = pol.product_id),
        1
    )                                   AS received_in_base_units,
    b.name                              AS branch,
    s.name                              AS supplier
FROM purchase_order_lines pol
JOIN purchase_orders po ON po.id = pol.po_id
JOIN products p         ON p.id  = pol.product_id
LEFT JOIN units_of_measure uom ON uom.id = pol.uom_id
LEFT JOIN branches b    ON b.id  = po.branch_id
LEFT JOIN suppliers s   ON s.id  = po.supplier_id
WHERE p.code = 'PRODUCT_CODE_HERE'
  AND po.is_deleted = false
ORDER BY po.po_date DESC;

-- 2b. Inventory movement totals by source for this product
SELECT
    im.reference_type,
    im.movement_type,
    COUNT(*)                            AS movement_count,
    SUM(im.quantity_change)             AS total_change,
    MIN(im.created_at)::DATE            AS first_date,
    MAX(im.created_at)::DATE            AS last_date
FROM inventory_movements im
JOIN products p ON p.id = im.product_id
WHERE p.code = 'PRODUCT_CODE_HERE'
GROUP BY im.reference_type, im.movement_type
ORDER BY SUM(im.quantity_change) DESC;
