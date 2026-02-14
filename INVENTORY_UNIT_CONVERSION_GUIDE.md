# Inventory Unit Conversion System - Implementation Guide

## Overview
The inventory system now properly handles unit conversions. Inventory is **always tracked in BASE units**, while sales can happen in either base or selling units. The system automatically converts selling units to base units before deducting from inventory.

## How It Works

### Example Scenario
**Product: Nails**
- Base Unit: Box
- Selling Unit: Kilogram (kg)
- Conversion: 1 box = 20 kg
- Purchase: Buy 10 boxes for ₱11,000 (₱1,100 per box)
- Inventory: 10 boxes in stock

**Sales Process:**
1. Customer buys 15 kg of nails
2. System converts: 15 kg ÷ 20 = 0.75 boxes
3. Inventory deducted: 0.75 boxes
4. Remaining inventory: 9.25 boxes

**When to Reorder:**
- Reorder Point: 2 boxes
- When inventory falls below 2 boxes → alert
- System checks: 9.25 boxes > 2 boxes → no alert yet

### Inventory Tracking Rules

1. **All inventory quantities are in BASE units**
   - Stock on hand: base units
   - Quantity reserved: base units
   - Inventory movements: base units
   - Reorder points: base units

2. **Automatic Conversion on Sales**
   - Sell in kg → converts to boxes
   - Sell in pieces → converts to boxes
   - Sell in base unit → no conversion needed

3. **Purchase Orders**
   - Always in base units
   - Example: Order 10 boxes → receive 10 boxes → add 10 to inventory

## Database Changes

### Migration File: `00016_update_inventory_with_unit_conversion.sql`

**What it does:**

1. **Updates `process_transaction_inventory()` function**
   - Checks the unit used in the transaction
   - If selling unit ≠ base unit, converts quantity
   - Deducts converted quantity from inventory
   - Records notes about the conversion

2. **Updates `update_inventory_on_receive()` function**
   - Ensures purchase receipts add inventory in base units
   - Handles edge cases where PO might use different units

3. **Adds database comments**
   - Clarifies that inventory is tracked in base units
   - Documents the conversion system

### Conversion Logic

```sql
-- Get product's unit configuration
SELECT base_uom_id, selling_uom_id, conversion_factor
FROM products
WHERE id = product_id;

-- Convert selling units to base units
IF transaction_uom = selling_uom AND base_uom ≠ selling_uom THEN
    base_unit_qty = transaction_qty / conversion_factor
ELSE
    base_unit_qty = transaction_qty
END IF

-- Deduct base units from inventory
UPDATE branch_inventory
SET quantity_on_hand = quantity_on_hand - base_unit_qty
```

## UI Changes

### Product Form - Inventory Settings

**Before:**
- Reorder Point: 10
- Reorder Quantity: 50

**After:**
- Reorder Point (Box): 10
  - Description: "Alert when stock falls below this quantity (inventory tracked in Boxes)"
- Reorder Quantity (Box): 50
  - Description: "Suggested quantity to reorder (in Boxes)"

The unit name is **dynamic** - shows whatever base unit you selected.

## Examples

### Example 1: Simple Same-Unit Product
**Product: Cement Bags**
- Base Unit: Bag
- Selling Unit: Bag
- Conversion Factor: 1 (no conversion needed)
- Inventory: 100 bags

**Sale: 25 bags**
- Deduct: 25 bags (no conversion)
- New inventory: 75 bags

### Example 2: Multi-Unit Product
**Product: Steel Bars**
- Base Unit: Bundle
- Selling Unit: Piece (pc)
- Conversion Factor: 50 (1 bundle = 50 pieces)
- Inventory: 20 bundles
- Reorder Point: 5 bundles

**Sale 1: Customer buys 100 pieces**
- Convert: 100 ÷ 50 = 2 bundles
- Deduct: 2 bundles
- New inventory: 18 bundles
- Status: 18 > 5 → OK

**Sale 2: Customer buys 400 pieces**
- Convert: 400 ÷ 50 = 8 bundles
- Deduct: 8 bundles
- New inventory: 10 bundles
- Status: 10 > 5 → OK

**Sale 3: Customer buys 300 pieces**
- Convert: 300 ÷ 50 = 6 bundles
- Deduct: 6 bundles
- New inventory: 4 bundles
- Status: 4 < 5 → **REORDER ALERT**

### Example 3: Fractional Inventory
**Product: Paint**
- Base Unit: Gallon
- Selling Unit: Liter (L)
- Conversion Factor: 3.785 (1 gallon = 3.785 liters)
- Inventory: 50 gallons
- Reorder Point: 10 gallons

**Sale: Customer buys 20 liters**
- Convert: 20 ÷ 3.785 = 5.286 gallons
- Deduct: 5.286 gallons
- New inventory: 44.714 gallons
- Status: 44.714 > 10 → OK

## Migration Instructions

### Step 1: Apply SQL Migration

1. **Login to Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project

2. **Open SQL Editor**
   - Click "SQL Editor" in sidebar
   - Click "+ New query"

3. **Copy and Run Migration**
   - Open: `supabase/migrations/00016_update_inventory_with_unit_conversion.sql`
   - Copy entire contents
   - Paste into SQL Editor
   - Click "Run"

4. **Verify Success**
   - Should see: "Success. No rows returned"
   - If errors, DO NOT proceed - contact support

### Step 2: Test the System

1. **Create a test product with different units:**
   ```
   Name: Test Nails
   Base Unit: Box
   Selling Unit: Kilogram
   Conversion Factor: 20 (1 box = 20 kg)
   Base Unit Cost: 1100
   COGS: 55 (auto-calculated)
   Markup: 15%
   Selling Price: 63.25
   Reorder Point: 2 boxes
   ```

2. **Create a purchase order:**
   ```
   Product: Test Nails
   Quantity: 10 boxes
   Unit Cost: 1100 per box
   Receive: 10 boxes
   ```

3. **Check inventory:**
   - Should show: 10 boxes

4. **Create a sale:**
   ```
   Product: Test Nails
   Quantity: 15 kg
   Unit Price: 63.25 per kg
   ```

5. **Verify inventory:**
   - Should show: 9.25 boxes (10 - 0.75)
   - Inventory movement should note: "Sold 15 selling units, deducted 0.75 base units"

6. **Test reorder alert:**
   - Sell 150 kg (7.5 boxes)
   - Inventory: 1.75 boxes
   - Should trigger reorder alert (< 2 boxes)

## Important Notes

### For Users
- **Always check which unit you're viewing** - inventory reports show base units
- **Reorder points are in base units** - set them based on how you purchase
- **Sales can be in any unit** - system converts automatically
- **Inventory movements show both quantities** - original sale amount and converted base units

### For Developers
- **Never manually calculate base units in application code** - let the database handle it
- **Trust the database triggers** - they handle all conversions automatically
- **Inventory queries always return base units** - convert for display if needed
- **Transaction lines store the original UOM** - conversion happens during processing

## Troubleshooting

### Problem: Inventory showing negative
**Cause:** Selling more units than available
**Solution:** Check conversion factor - make sure 1 base unit actually contains the specified selling units

### Problem: Reorder alert not triggering
**Cause:** Reorder point might be in wrong unit
**Solution:** Remember - reorder points are in BASE units, not selling units

### Problem: Inventory movement shows unexpected quantity
**Cause:** Check the notes column - it shows the conversion
**Solution:** Verify conversion factor is correct (1 base = X selling)

## Rollback Plan

If you need to rollback:

```sql
-- Restore old process_transaction_inventory function
CREATE OR REPLACE FUNCTION process_transaction_inventory()
RETURNS TRIGGER AS $$
DECLARE
    line RECORD;
    inv_id UUID;
    current_qty DECIMAL(12, 4);
BEGIN
    FOR line IN
        SELECT tl.*, t.branch_id, t.transaction_type
        FROM transaction_lines tl
        JOIN transactions t ON t.id = tl.transaction_id
        WHERE tl.transaction_id = NEW.id
    LOOP
        -- Original logic without conversion
        SELECT id, quantity_on_hand INTO inv_id, current_qty
        FROM branch_inventory
        WHERE branch_id = line.branch_id
          AND product_id = line.product_id
          AND (variant_id = line.variant_id OR (variant_id IS NULL AND line.variant_id IS NULL));

        IF inv_id IS NULL THEN
            INSERT INTO branch_inventory (branch_id, product_id, variant_id, quantity_on_hand)
            VALUES (line.branch_id, line.product_id, line.variant_id, 0)
            RETURNING id, quantity_on_hand INTO inv_id, current_qty;
        END IF;

        IF line.transaction_type = 'sale' THEN
            UPDATE branch_inventory
            SET quantity_on_hand = quantity_on_hand - line.quantity,
                last_movement_at = NOW()
            WHERE id = inv_id;

            INSERT INTO inventory_movements (
                branch_id, product_id, variant_id, movement_type,
                quantity_change, quantity_before, quantity_after,
                reference_id, reference_type, created_by
            ) VALUES (
                line.branch_id, line.product_id, line.variant_id, 'sale',
                -line.quantity, current_qty, current_qty - line.quantity,
                NEW.id, 'transaction', NEW.created_by
            );
        ELSIF line.transaction_type = 'return' THEN
            UPDATE branch_inventory
            SET quantity_on_hand = quantity_on_hand + line.quantity,
                last_movement_at = NOW()
            WHERE id = inv_id;

            INSERT INTO inventory_movements (
                branch_id, product_id, variant_id, movement_type,
                quantity_change, quantity_before, quantity_after,
                reference_id, reference_type, created_by
            ) VALUES (
                line.branch_id, line.product_id, line.variant_id, 'return',
                line.quantity, current_qty, current_qty + line.quantity,
                NEW.id, 'transaction', NEW.created_by
            );
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Related Files
- `supabase/migrations/00015_add_unit_conversion_factor.sql` - Adds conversion_factor column
- `supabase/migrations/00016_update_inventory_with_unit_conversion.sql` - Updates inventory triggers
- `src/components/forms/product-form.tsx` - UI updates for clarity
- `UNIT_CONVERSION_MIGRATION_GUIDE.md` - Initial conversion factor guide
- `INVENTORY_UNIT_CONVERSION_GUIDE.md` - This comprehensive guide
