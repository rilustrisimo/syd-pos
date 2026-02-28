-- Check if the triggers are using the correct logic
-- Run this to verify migration 00021 was applied correctly

-- 1. Check the update_inventory_on_receive function source
SELECT prosrc 
FROM pg_proc 
WHERE proname = 'update_inventory_on_receive';

-- 2. Check the process_transaction_inventory function source
SELECT prosrc 
FROM pg_proc 
WHERE proname = 'process_transaction_inventory';

-- 3. Check recent inventory movements for battery
SELECT 
    im.created_at,
    im.movement_type,
    im.quantity_change,
    im.quantity_before,
    im.quantity_after,
    im.notes,
    im.reference_type
FROM inventory_movements im
JOIN products p ON p.id = im.product_id
WHERE p.name ILIKE '%battery%'
ORDER BY im.created_at DESC
LIMIT 20;

-- 4. Check battery product configuration
SELECT 
    p.code,
    p.name,
    base_uom.code as base_unit,
    sell_uom.code as selling_unit,
    p.conversion_factor as product_conversion_factor
FROM products p
JOIN units_of_measure base_uom ON base_uom.id = p.base_uom_id
JOIN units_of_measure sell_uom ON sell_uom.id = p.selling_uom_id
WHERE p.name ILIKE '%battery%';

-- 5. Check battery selling units
SELECT 
    psu.uom_id,
    uom.code as unit,
    psu.conversion_factor,
    psu.selling_price,
    psu.is_primary,
    psu.is_active
FROM product_selling_units psu
JOIN units_of_measure uom ON uom.id = psu.uom_id
JOIN products p ON p.id = psu.product_id
WHERE p.name ILIKE '%battery%'
ORDER BY psu.is_primary DESC, psu.conversion_factor;

-- 6. Check current battery inventory
SELECT 
    b.name as branch,
    p.name as product,
    bi.quantity_on_hand,
    base_uom.code as unit
FROM branch_inventory bi
JOIN products p ON p.id = bi.product_id
JOIN branches b ON b.id = bi.branch_id
JOIN units_of_measure base_uom ON base_uom.id = p.base_uom_id
WHERE p.name ILIKE '%battery%';
