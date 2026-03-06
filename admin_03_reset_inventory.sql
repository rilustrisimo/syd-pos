-- ============================================================================
-- ADMIN STEP 3: Reset Inventory to Zero (Clean Slate)
-- ============================================================================
-- Run this AFTER:
--   ✅ admin_01_backup.sql has been run (backups exist)
--   ✅ All PO lines have been corrected via admin_02_view_pos_to_fix.sql
--
-- This script:
--   1. Deletes ALL inventory movements
--   2. Zeros out all branch_inventory quantities
--
-- After this, run admin_04_rebuild_inventory.sql to recalculate from scratch.
-- ============================================================================

-- Safety check: confirm backups exist before proceeding
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '_bak_inventory_movements') THEN
        RAISE EXCEPTION 'Backup tables not found. Run admin_01_backup.sql first!';
    END IF;
    RAISE NOTICE 'Backup tables confirmed. Proceeding with reset...';
END $$;


-- ── Step 1: Delete all inventory movements ───────────────────────────────────
DELETE FROM inventory_movements;

SELECT 'inventory_movements cleared' AS status, 0 AS remaining_rows;


-- ── Step 2: Zero out all branch inventory ─────────────────────────────────────
UPDATE branch_inventory
SET
    quantity_on_hand = 0,
    last_movement_at = NOW();

SELECT
    'branch_inventory zeroed' AS status,
    COUNT(*)                  AS products_zeroed
FROM branch_inventory;


-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT
    b.name      AS branch,
    p.code      AS product_code,
    p.name      AS product_name,
    bi.quantity_on_hand,
    uom.code    AS base_uom
FROM branch_inventory bi
JOIN products p     ON p.id  = bi.product_id
JOIN branches b     ON b.id  = bi.branch_id
LEFT JOIN units_of_measure uom ON uom.id = p.base_uom_id
ORDER BY b.name, p.code
LIMIT 50;

-- Expected: all rows show quantity_on_hand = 0
-- inventory_movements should return 0 rows:
SELECT COUNT(*) AS movement_rows_should_be_zero FROM inventory_movements;
