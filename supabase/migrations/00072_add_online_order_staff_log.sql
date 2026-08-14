-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00072: Staff audit log on online_orders
--
-- Staff edits to online_order_lines (qty change, line removal) before
-- converting an order to a sale were previously silent. Add an append-only
-- text log so the order detail page can show what staff changed and when.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS staff_log TEXT;
