-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00082: Optional logo image per payment QR code
--
-- Each QR code is now its own payment method button in checkout (see
-- migration 00081), currently shown with a generic camera emoji. This
-- adds an optional logo (e.g. the GCash/BDO/BPI/GoTyme brand mark) so
-- staff can upload a recognizable icon per button instead.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE shop_qr_codes ADD COLUMN IF NOT EXISTS logo_url TEXT;
