-- ============================================================================
-- EMERGENCY FIX: Correct Common Nails Inventory Discrepancies
-- ============================================================================
-- This script fixes the rounding errors for Common Nails products
-- Run this in Supabase SQL Editor
-- ============================================================================

DO $$
DECLARE
    v_product_id UUID;
    v_branch_id UUID;
    v_current_qty DECIMAL(12, 4);
    v_correct_qty DECIMAL(12, 4);
    v_adjustment DECIMAL(12, 4);
    v_system_user_id UUID;
    v_product_name TEXT;
    v_branch_name TEXT;
BEGIN
    -- Get system user (first admin)
    SELECT id INTO v_system_user_id
    FROM users
    WHERE role = 'admin'
    ORDER BY created_at
    LIMIT 1;
    
    IF v_system_user_id IS NULL THEN
        RAISE EXCEPTION 'No admin user found';
    END IF;
    
    -- Fix Common Nails #1 ½ (CN-1.5)
    SELECT p.id, p.name INTO v_product_id, v_product_name
    FROM products p
    WHERE p.code = 'CN-1.5';
    
    IF v_product_id IS NOT NULL THEN
        -- Get all branches with this product
        FOR v_branch_id, v_branch_name, v_current_qty IN
            SELECT bi.branch_id, b.name, bi.quantity_on_hand
            FROM branch_inventory bi
            JOIN branches b ON b.id = bi.branch_id
            WHERE bi.product_id = v_product_id
        LOOP
            -- Round to nearest 0.25 to fix precision errors
            v_correct_qty := ROUND(v_current_qty * 4) / 4;
            v_adjustment := v_correct_qty - v_current_qty;
            
            IF ABS(v_adjustment) > 0.001 THEN
                -- Update inventory
                UPDATE branch_inventory
                SET quantity_on_hand = v_correct_qty,
                    last_movement_at = NOW()
                WHERE branch_id = v_branch_id
                  AND product_id = v_product_id;
                
                -- Record adjustment
                INSERT INTO inventory_movements (
                    branch_id, product_id, variant_id, movement_type,
                    quantity_change, quantity_before, quantity_after,
                    reference_type, created_by, notes
                ) VALUES (
                    v_branch_id, v_product_id, NULL, 'adjustment',
                    v_adjustment, v_current_qty, v_correct_qty,
                    'inventory_correction', v_system_user_id,
                    'Fixed rounding error for ' || v_product_name || 
                    ' at ' || v_branch_name || 
                    '. Adjusted from ' || v_current_qty || ' to ' || v_correct_qty
                );
                
                RAISE NOTICE 'Fixed % at %: % → %', 
                    v_product_name, v_branch_name, v_current_qty, v_correct_qty;
            END IF;
        END LOOP;
    END IF;
    
    -- Fix other Common Nails products if needed
    FOR v_product_id, v_product_name IN
        SELECT p.id, p.name
        FROM products p
        WHERE p.code LIKE 'CN-%'
          AND p.code != 'CN-1.5'
    LOOP
        FOR v_branch_id, v_branch_name, v_current_qty IN
            SELECT bi.branch_id, b.name, bi.quantity_on_hand
            FROM branch_inventory bi
            JOIN branches b ON b.id = bi.branch_id
            WHERE bi.product_id = v_product_id
        LOOP
            v_correct_qty := ROUND(v_current_qty * 4) / 4;
            v_adjustment := v_correct_qty - v_current_qty;
            
            IF ABS(v_adjustment) > 0.001 THEN
                UPDATE branch_inventory
                SET quantity_on_hand = v_correct_qty,
                    last_movement_at = NOW()
                WHERE branch_id = v_branch_id
                  AND product_id = v_product_id;
                
                INSERT INTO inventory_movements (
                    branch_id, product_id, variant_id, movement_type,
                    quantity_change, quantity_before, quantity_after,
                    reference_type, created_by, notes
                ) VALUES (
                    v_branch_id, v_product_id, NULL, 'adjustment',
                    v_adjustment, v_current_qty, v_correct_qty,
                    'inventory_correction', v_system_user_id,
                    'Fixed rounding error for ' || v_product_name || 
                    ' at ' || v_branch_name
                );
                
                RAISE NOTICE 'Fixed % at %: % → %', 
                    v_product_name, v_branch_name, v_current_qty, v_correct_qty;
            END IF;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'Inventory corrections completed';
END $$;

-- Verify the fix
SELECT 
    p.code,
    p.name,
    b.name as branch,
    bi.quantity_on_hand
FROM branch_inventory bi
JOIN products p ON p.id = bi.product_id
JOIN branches b ON b.id = bi.branch_id
WHERE p.code LIKE 'CN-%'
ORDER BY p.code, b.name;
