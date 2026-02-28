-- Check if purchase receipts are also logged in inventory_movements
SELECT 
  movement_type,
  COUNT(*) as count,
  SUM(quantity_change) as net_change
FROM inventory_movements
WHERE movement_type != 'sale'
GROUP BY movement_type;

-- Check for 'purchase' or 'receive' movement types
SELECT 
  movement_type,
  reference_type,
  COUNT(*) as count
FROM inventory_movements
WHERE movement_type IN ('purchase', 'receive', 'receipt', 'adjustment')
   OR reference_type IN ('purchase_order', 'po')
GROUP BY movement_type, reference_type;

-- Get all distinct movement types
SELECT DISTINCT movement_type 
FROM inventory_movements
ORDER BY movement_type;
