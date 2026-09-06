-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00081: Record which specific QR code a customer paid with
--
-- The shop's "QR Code" payment method now offers several QR codes (GCash,
-- BDO, BPI, GoTyme - see shop_qr_codes from migration 00080) as separate
-- selectable buttons rather than one generic option. online_orders still
-- stores payment_method = 'qr' (keeps the existing CHECK constraint from
-- 00065 intact), but now also snapshots the label of the QR the customer
-- selected, the same way order lines snapshot product_name instead of
-- relying on a live join - so the order stays legible even if that QR
-- code is later renamed or deleted from shop_qr_codes.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS payment_qr_label TEXT;
