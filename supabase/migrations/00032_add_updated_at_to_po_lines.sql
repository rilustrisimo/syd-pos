-- ============================================================================
-- Migration 00032: Add updated_at column to purchase_order_lines
-- ============================================================================
-- The receive_po_atomic RPC (00030) tries to update the updated_at column
-- but it doesn't exist in the original schema. This migration adds it.
-- ============================================================================

-- Add updated_at column to purchase_order_lines
ALTER TABLE purchase_order_lines
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_po_lines_updated_at ON purchase_order_lines(updated_at);

-- Add trigger to auto-update updated_at on changes
CREATE OR REPLACE FUNCTION update_po_lines_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_po_lines_updated_at ON purchase_order_lines;
CREATE TRIGGER trigger_update_po_lines_updated_at
    BEFORE UPDATE ON purchase_order_lines
    FOR EACH ROW
    EXECUTE FUNCTION update_po_lines_updated_at();

COMMENT ON COLUMN purchase_order_lines.updated_at IS 'Timestamp of last update to this PO line (auto-updated by trigger)';
