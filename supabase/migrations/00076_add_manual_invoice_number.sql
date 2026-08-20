-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00076: Manual Invoice/OR number cross-reference
--
-- The POS no longer prints anything that functions as a customer receipt
-- (see the removal of the thermal "official receipt" and related templates
-- in this same change). The actual legal proof-of-sale is now a hand-
-- written Invoice/OR from a BIR-registered paper booklet. This column lets
-- staff optionally record which paper document was issued for a given
-- system transaction, so the two stay cross-referenced. Not required —
-- populated via a follow-up UPDATE after transaction creation, not part of
-- the create_transaction_atomic RPC (no inventory/atomicity implications).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS manual_invoice_number TEXT;

COMMENT ON COLUMN transactions.manual_invoice_number IS
  'Optional cross-reference to the hand-written Invoice/OR number from the BIR-registered paper booklet actually issued to the customer. Not a system-generated legal document number.';
