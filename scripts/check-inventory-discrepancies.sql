-- ============================================================================
-- CHECK INVENTORY DISCREPANCIES (READ-ONLY)
-- ============================================================================
-- This script shows what SHOULD be the correct inventory vs current inventory
-- Run this first to see the scope of the problem before fixing
--
-- IMPORTANT: This accounts for unit conversions in both purchases and sales
-- ============================================================================

WITH purchase_totals AS (
  -- Sum all received purchases per product per branch (converted to base units)
  SELECT 
    po.branch_id,
    pol.product_id,
    SUM(
      CASE 
        -- If purchased in base units, use as-is
        WHEN pol.uom_id = p.base_uom_id OR p.conversion_factor <= 0
        THEN pol.quantity_received
        -- If purchased in selling units, convert to base units
        ELSE pol.quantity_received / p.conversion_factor
      END
    ) as total_purchased
  FROM purchase_order_lines pol
  JOIN purchase_orders po ON po.id = pol.po_id
  JOIN products p ON p.id = pol.product_id
  WHERE po.is_deleted = false
  GROUP BY po.branch_id, pol.product_id
),
sales_totals AS (
  -- Sum all sales per product per branch (converted to base units)
  SELECT 
    t.branch_id,
    tl.product_id,
    SUM(
      CASE 
        -- If sold in selling units and it differs from base unit, convert
        WHEN tl.uom_id = p.selling_uom_id 
         AND p.base_uom_id != p.selling_uom_id 
         AND p.conversion_factor > 0
        THEN tl.quantity / p.conversion_factor
        -- Otherwise use quantity as-is (already in base units)
        ELSE tl.quantity
      END
    ) as total_sold_base_units
  FROM transaction_lines tl
  JOIN transactions t ON t.id = tl.transaction_id
  JOIN products p ON p.id = tl.product_id
  WHERE t.transaction_type = 'sale'
    AND t.is_deleted = false
  GROUP BY t.branch_id, tl.product_id
)
SELECT 
  p.code as "Product Code",
  p.name as "Product Name",
  b.name as "Branch",
  COALESCE(pt.total_purchased, 0)::numeric(10,2) as "Total Purchased",
  COALESCE(st.total_sold_base_units, 0)::numeric(10,2) as "Total Sold",
  (COALESCE(pt.total_purchased, 0) - COALESCE(st.total_sold_base_units, 0))::numeric(10,2) as "Should Be",
  COALESCE(bi.quantity_on_hand, 0)::numeric(10,2) as "Current Qty",
  ((COALESCE(pt.total_purchased, 0) - COALESCE(st.total_sold_base_units, 0)) - COALESCE(bi.quantity_on_hand, 0))::numeric(10,2) as "Difference",
  CASE 
    WHEN COALESCE(bi.quantity_on_hand, 0) = (COALESCE(pt.total_purchased, 0) - COALESCE(st.total_sold_base_units, 0))
    THEN '✓ OK'
    WHEN COALESCE(bi.quantity_on_hand, 0) > (COALESCE(pt.total_purchased, 0) - COALESCE(st.total_sold_base_units, 0))
    THEN '⚠ OVER'
    ELSE '⚠ UNDER'
  END as "Status"
FROM products p
CROSS JOIN branches b
LEFT JOIN purchase_totals pt ON pt.branch_id = b.id AND pt.product_id = p.id
LEFT JOIN sales_totals st ON st.branch_id = b.id AND st.product_id = p.id
LEFT JOIN branch_inventory bi ON bi.branch_id = b.id AND bi.product_id = p.id
WHERE p.is_active = true
  AND (pt.total_purchased IS NOT NULL OR bi.id IS NOT NULL)
  -- Show only discrepancies
  AND COALESCE(bi.quantity_on_hand, 0) != (COALESCE(pt.total_purchased, 0) - COALESCE(st.total_sold_base_units, 0))
ORDER BY ABS((COALESCE(pt.total_purchased, 0) - COALESCE(st.total_sold_base_units, 0)) - COALESCE(bi.quantity_on_hand, 0)) DESC;

-- Summary statistics
SELECT 
  COUNT(*) as "Total Products with Discrepancies",
  SUM(ABS(difference))::numeric(10,2) as "Total Quantity Difference"
FROM (
  SELECT 
    ((COALESCE(pt.total_purchased, 0) - COALESCE(st.total_sold_base_units, 0)) - COALESCE(bi.quantity_on_hand, 0)) as difference
  FROM products p
  CROSS JOIN branches b
  LEFT JOIN (
    SELECT po.branch_id, pol.product_id, 
      SUM(
        CASE 
          WHEN pol.uom_id = p.base_uom_id OR p.conversion_factor <= 0
          THEN pol.quantity_received
          ELSE pol.quantity_received / p.conversion_factor
        END
      ) as total_purchased
    FROM purchase_order_lines pol
    JOIN purchase_orders po ON po.id = pol.po_id
    JOIN products p ON p.id = pol.product_id
    WHERE po.is_deleted = false
    GROUP BY po.branch_id, pol.product_id
  ) pt ON pt.branch_id = b.id AND pt.product_id = p.id
  LEFT JOIN (
    SELECT t.branch_id, tl.product_id,
      SUM(CASE 
        WHEN tl.uom_id = p.selling_uom_id AND p.base_uom_id != p.selling_uom_id AND p.conversion_factor > 0
        THEN tl.quantity / p.conversion_factor
        ELSE tl.quantity
      END) as total_sold_base_units
    FROM transaction_lines tl
    JOIN transactions t ON t.id = tl.transaction_id
    JOIN products p ON p.id = tl.product_id
    WHERE t.transaction_type = 'sale' AND t.is_deleted = false
    GROUP BY t.branch_id, tl.product_id
  ) st ON st.branch_id = b.id AND st.product_id = p.id
  LEFT JOIN branch_inventory bi ON bi.branch_id = b.id AND bi.product_id = p.id
  WHERE p.is_active = true
    AND (pt.total_purchased IS NOT NULL OR bi.id IS NOT NULL)
    AND COALESCE(bi.quantity_on_hand, 0) != (COALESCE(pt.total_purchased, 0) - COALESCE(st.total_sold_base_units, 0))
) discrepancies;
