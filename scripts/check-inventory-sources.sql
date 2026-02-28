-- ============================================================================
-- CHECK INVENTORY SOURCES
-- ============================================================================
-- This script helps identify all sources of inventory changes
-- Run this to understand what we're missing in reconciliation
-- ============================================================================

-- 1. Check if there are any inventory movements
SELECT 
  'Inventory Movements' as source,
  COUNT(*) as record_count,
  SUM(ABS(quantity_change)) as total_quantity
FROM inventory_movements;

-- 2. Check movement types
SELECT 
  movement_type,
  COUNT(*) as count,
  SUM(quantity_change) as net_change,
  SUM(CASE WHEN quantity_change > 0 THEN quantity_change ELSE 0 END) as additions,
  SUM(CASE WHEN quantity_change < 0 THEN ABS(quantity_change) ELSE 0 END) as subtractions
FROM inventory_movements
GROUP BY movement_type
ORDER BY count DESC;

-- 3. Check transaction types
SELECT 
  transaction_type,
  COUNT(*) as transaction_count,
  COUNT(DISTINCT id) as unique_transactions
FROM transactions
WHERE is_deleted = false
GROUP BY transaction_type;

-- 4. Sample of inventory movements
SELECT 
  movement_type,
  quantity_change,
  quantity_before,
  quantity_after,
  reference_type,
  created_at
FROM inventory_movements
ORDER BY created_at DESC
LIMIT 10;
