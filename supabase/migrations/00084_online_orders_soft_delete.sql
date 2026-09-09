-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00084: Soft delete for online orders
--
-- Staff need to be able to remove an online order from view (e.g. test
-- orders, duplicates, spam) without permanently losing the record —
-- online orders can carry payment references, staff logs, and customer
-- history that shouldn't be hard-deleted. Sets deleted_at instead of
-- DELETE; the list/banner/badge queries exclude rows where it's set,
-- but the row (and its lines) stay in the database and can be restored.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
