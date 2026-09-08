-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00083: Discount support for online orders
--
-- Staff can now add products and apply discounts to an already-placed
-- online order (mirroring the discount modes already available in POS
-- checkout: None/Fixed/Percentage/Standard/At Cost). Fixed/Percentage
-- apply at the order level (like transactions.discount_amount/
-- discount_percentage); Standard/At Cost apply per line (like
-- transaction_lines.discount_amount).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE online_order_lines ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5,2) NOT NULL DEFAULT 0;
