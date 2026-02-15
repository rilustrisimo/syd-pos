-- Add soft delete columns to transactions table
ALTER TABLE transactions
ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN deleted_at TIMESTAMPTZ,
ADD COLUMN deleted_by UUID REFERENCES users(id);

-- Create index for soft delete queries
CREATE INDEX idx_transactions_is_deleted ON transactions(is_deleted);

-- Update RLS policies to exclude deleted transactions from normal queries
DROP POLICY IF EXISTS "Authenticated users can view transactions" ON transactions;
CREATE POLICY "Authenticated users can view active transactions"
    ON transactions FOR SELECT
    TO authenticated
    USING (is_deleted = FALSE);

-- Add policy for admins to view deleted transactions
CREATE POLICY "Admins can view deleted transactions"
    ON transactions FOR SELECT
    TO authenticated
    USING (
        is_deleted = TRUE
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Update delete policy for managers and admins
CREATE POLICY "Managers and admins can soft delete transactions"
    ON transactions FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager')
        )
    );
