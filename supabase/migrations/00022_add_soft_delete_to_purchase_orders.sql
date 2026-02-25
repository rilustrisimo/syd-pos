-- Add soft delete to purchase_orders
-- Replaces hard delete so that accidentally created duplicate POs can be
-- removed without permanently losing audit history.

ALTER TABLE purchase_orders
  ADD COLUMN is_deleted  BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN deleted_at  TIMESTAMPTZ,
  ADD COLUMN deleted_by  UUID REFERENCES users(id);

CREATE INDEX idx_purchase_orders_is_deleted ON purchase_orders(is_deleted);

COMMENT ON COLUMN purchase_orders.is_deleted IS 'Soft-delete flag. Deleted POs are hidden from all views but kept for audit purposes.';
COMMENT ON COLUMN purchase_orders.deleted_at IS 'Timestamp when the PO was soft-deleted.';
COMMENT ON COLUMN purchase_orders.deleted_by IS 'User who soft-deleted the PO.';

-- ── RLS: regular users only see non-deleted POs ──────────────────────────────
-- Drop the existing permissive select policy and replace with filtered one.
-- (Policy names may vary; adjust if your project uses different names.)

-- Allow all authenticated users to see non-deleted POs
DROP POLICY IF EXISTS "Users can view purchase orders" ON purchase_orders;
CREATE POLICY "Users can view purchase orders"
  ON purchase_orders FOR SELECT
  TO authenticated
  USING (is_deleted = FALSE);

-- Allow admins / managers to also view deleted POs
CREATE POLICY "Admins can view deleted purchase orders"
  ON purchase_orders FOR SELECT
  TO authenticated
  USING (
    is_deleted = TRUE
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'manager')
    )
  );

-- Allow admins / managers to soft-delete (update is_deleted)
-- The existing update policy should already cover this since it allows
-- admins/managers to update purchase_orders. No change needed for UPDATE RLS.
