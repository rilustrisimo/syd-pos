-- ============================================================================
-- Migration 00034: Drop redundant PO receive trigger
-- ============================================================================
-- PROBLEM: When a PO line is received, the app calls the atomic RPC
-- `receive_purchase_order_atomic` (migration 00030) which:
--   1. Updates purchase_order_lines.quantity_received
--   2. Updates branch_inventory (with FOR UPDATE lock)
--   3. Inserts an inventory_movements record
--
-- However, step 1 fires the `on_po_line_inventory_update` trigger, which
-- ALSO updates branch_inventory and inserts an inventory_movements record.
-- This causes every receive to create TWO identical inventory movements and
-- double the quantity_on_hand.
--
-- FIX: Drop the trigger and its function. The atomic RPC is the authoritative
-- receive path and handles everything correctly (including UOM conversion,
-- row-level locking, and proper created_by attribution via passed user_id).
-- The trigger used auth.uid() which returns NULL outside browser context anyway.
-- ============================================================================

-- Drop the trigger first, then the function
DROP TRIGGER IF EXISTS on_po_line_inventory_update ON purchase_order_lines;
DROP FUNCTION IF EXISTS update_inventory_on_receive();
