-- ============================================================================
-- PREVENT DELETING SALES WITH EXISTING RETURNS
-- ============================================================================
-- This migration prevents the critical inventory integrity bug where deleting
-- a sale transaction that has associated returns would double-count the
-- inventory reversal.
--
-- Scenario that this fixes:
--   1. Sale: -5 units
--   2. Return 2 units: +2 units (net: -3 units)
--   3. Delete sale: +5 units (WRONG! Should only add back 3)
--   Result: +2 units net gain instead of 0
--
-- Solution: Prevent deletion of sales that have associated return transactions.
-- User must delete returns first, which will then allow deleting the sale.
-- ============================================================================

-- Create function to check for existing returns before allowing sale deletion
CREATE OR REPLACE FUNCTION check_sale_has_no_returns()
RETURNS TRIGGER AS $$
DECLARE
    return_count INTEGER;
    return_txn_numbers TEXT;
BEGIN
    -- Only check when trying to mark a SALE transaction as deleted
    IF NEW.is_deleted = true 
       AND OLD.is_deleted = false 
       AND NEW.transaction_type = 'sale' THEN
        
        -- Check if there are any return transactions linked to this sale
        SELECT COUNT(*), STRING_AGG(transaction_number, ', ')
        INTO return_count, return_txn_numbers
        FROM transactions
        WHERE original_transaction_id = NEW.id
          AND transaction_type = 'return'
          AND is_deleted = false;
        
        -- If returns exist, prevent deletion
        IF return_count > 0 THEN
            RAISE EXCEPTION 
                'Cannot delete sale transaction %. This transaction has % associated return(s): %. Please delete the return transactions first to maintain inventory integrity.',
                NEW.transaction_number,
                return_count,
                return_txn_numbers
                USING HINT = 'Delete return transactions first, then delete the original sale.';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to run before soft delete
CREATE TRIGGER prevent_deleting_sales_with_returns
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION check_sale_has_no_returns();

COMMENT ON FUNCTION check_sale_has_no_returns() IS 
    'Prevents deletion of sale transactions that have associated returns to avoid inventory double-counting. Returns must be deleted first.';

COMMENT ON TRIGGER prevent_deleting_sales_with_returns ON transactions IS
    'Ensures data integrity by preventing deletion of sales with returns. This avoids inventory discrepancies where deleted sale adds back full quantity while returns have already added back partial quantities.';
