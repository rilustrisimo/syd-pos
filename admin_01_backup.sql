-- ============================================================================
-- ADMIN STEP 1: Backup Current Data Before Any Modifications
-- ============================================================================
-- Run this FIRST before touching anything.
-- Creates backup copies of all key tables with a _bak suffix.
-- To restore a table: INSERT INTO <table> SELECT * FROM <table>_bak;
-- ============================================================================

-- Drop old backups if they exist (so we get a fresh snapshot each time)
DROP TABLE IF EXISTS _bak_purchase_orders;
DROP TABLE IF EXISTS _bak_purchase_order_lines;
DROP TABLE IF EXISTS _bak_branch_inventory;
DROP TABLE IF EXISTS _bak_inventory_movements;
DROP TABLE IF EXISTS _bak_transactions;
DROP TABLE IF EXISTS _bak_transaction_lines;

-- Snapshot purchase orders
CREATE TABLE _bak_purchase_orders AS SELECT * FROM purchase_orders;
CREATE TABLE _bak_purchase_order_lines AS SELECT * FROM purchase_order_lines;

-- Snapshot inventory
CREATE TABLE _bak_branch_inventory AS SELECT * FROM branch_inventory;
CREATE TABLE _bak_inventory_movements AS SELECT * FROM inventory_movements;

-- Snapshot sales
CREATE TABLE _bak_transactions AS SELECT * FROM transactions;
CREATE TABLE _bak_transaction_lines AS SELECT * FROM transaction_lines;

-- ── Verify ──────────────────────────────────────────────────────────────────
SELECT 'purchase_orders'        AS table_name, COUNT(*) FROM _bak_purchase_orders
UNION ALL
SELECT 'purchase_order_lines',                  COUNT(*) FROM _bak_purchase_order_lines
UNION ALL
SELECT 'branch_inventory',                       COUNT(*) FROM _bak_branch_inventory
UNION ALL
SELECT 'inventory_movements',                    COUNT(*) FROM _bak_inventory_movements
UNION ALL
SELECT 'transactions',                           COUNT(*) FROM _bak_transactions
UNION ALL
SELECT 'transaction_lines',                      COUNT(*) FROM _bak_transaction_lines
ORDER BY table_name;
