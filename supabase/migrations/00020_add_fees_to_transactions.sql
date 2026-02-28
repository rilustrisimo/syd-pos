-- Add delivery fee and other fees to transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS delivery_fee DECIMAL(12, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS other_fees DECIMAL(12, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS other_fees_notes TEXT;

-- Add comment for documentation
COMMENT ON COLUMN transactions.delivery_fee IS 'Delivery fee charged for delivery orders';
COMMENT ON COLUMN transactions.other_fees IS 'Other additional fees (service charge, processing fee, etc.)';
COMMENT ON COLUMN transactions.other_fees_notes IS 'Description of other fees';
