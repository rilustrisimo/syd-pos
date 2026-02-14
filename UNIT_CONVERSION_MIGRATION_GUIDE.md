# Unit Conversion Factor Migration Guide

## Overview
This migration adds automatic unit conversion support to products. Now when you buy products in bulk (e.g., boxes) but sell them in smaller units (e.g., kg), the system automatically calculates the correct COGS per selling unit.

## Example Scenario
- **Purchase**: 1 Box of nails for ₱1,100
- **Package**: Each box contains 20kg
- **Sell**: Per kilogram (kg)
- **Auto-calculated COGS**: ₱1,100 ÷ 20 = ₱55 per kg

## Database Changes

### What This Migration Does
1. Adds `conversion_factor` column to the `products` table
2. Updates the purchase receiving trigger to automatically calculate COGS using the conversion factor
3. Sets default conversion_factor = 1 for existing products

### Migration File
`supabase/migrations/00015_add_unit_conversion_factor.sql`

## How to Apply

### Via Supabase Dashboard (Recommended)

1. **Login to Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project

2. **Open SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "+ New query"

3. **Copy and Execute Migration**
   - Open the file: `supabase/migrations/00015_add_unit_conversion_factor.sql`
   - Copy the entire contents
   - Paste into the SQL Editor
   - Click "Run" button

4. **Verify Success**
   - Check for success message: "Success. No rows returned"
   - If errors appear, DO NOT proceed and contact support

### Via Supabase CLI

```bash
# Make sure you're in the syd-pos directory
cd /Users/eyorsogood/Sites/syd/syd-pos

# Apply the migration
supabase db push
```

## How It Works

### 1. Product Setup
When creating/editing a product:
- If **Base Unit** = **Selling Unit**: conversion_factor = 1 (no conversion needed)
- If **Base Unit** ≠ **Selling Unit**: enter the conversion factor
  - Example: Base = Box, Selling = kg, 1 box = 20kg → enter 20

### 2. Automatic COGS Calculation
When receiving a purchase:
- System checks if base_uom_id ≠ selling_uom_id
- If different: **COGS = Purchase Unit Cost ÷ Conversion Factor**
- If same: **COGS = Purchase Unit Cost** (unchanged)

### Example Flow
```
Purchase Order:
- Product: Nails
- Base Unit: Box
- Selling Unit: kg
- Conversion Factor: 20 (1 box = 20kg)
- Unit Cost: ₱1,100 (per box)

When Purchase is Received:
✓ System calculates: ₱1,100 ÷ 20 = ₱55
✓ Updates latest_cogs = ₱55 (per kg)
✓ If markup = 30%: Selling Price = ₱55 × 1.30 = ₱71.50 per kg
```

## UI Changes

### Product Form - New Field
When **Base Unit** ≠ **Selling Unit**, a new field appears:

**Unit Conversion Factor***
How many [selling units] are in 1 [base unit]?
(e.g., 1 box = 20 kg → enter 20)

### Product Form - Updated COGS Description
- When units are different: "Cost per [selling unit] (auto-calculated from purchase)"
- When units are same: "Cost of goods sold"

## Testing Checklist

After applying the migration:

- [ ] Create a new product with Base Unit = Selling Unit
  - ✓ Conversion factor field should NOT appear
  - ✓ COGS should work as before

- [ ] Create a new product with different units (e.g., Box → kg)
  - ✓ Conversion factor field should appear
  - ✓ Enter conversion factor (e.g., 20)
  - ✓ Save successfully

- [ ] Create a Purchase Order for the product
  - ✓ Enter unit cost for base unit (e.g., ₱1,100 per box)
  - ✓ Receive the PO

- [ ] Verify Auto-calculation
  - ✓ Check product's latest_cogs
  - ✓ Should equal: unit_cost ÷ conversion_factor
  - ✓ Example: ₱1,100 ÷ 20 = ₱55

## Rollback Plan

If you need to rollback this migration:

```sql
-- Remove conversion_factor column
ALTER TABLE products DROP COLUMN IF EXISTS conversion_factor;

-- Restore old trigger (without conversion)
CREATE OR REPLACE FUNCTION update_product_pricing_on_receive()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.quantity_received > OLD.quantity_received THEN
        UPDATE products
        SET
            latest_cogs = NEW.unit_cost,
            current_selling_price = NEW.unit_cost * (1 + markup_percentage / 100),
            updated_at = NOW()
        WHERE id = NEW.product_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Support

If you encounter any issues:
1. Check error messages in Supabase dashboard
2. Verify the migration file is complete and unmodified
3. Ensure you have admin access to the database
4. Contact the development team if problems persist

## Related Files Modified
- `supabase/migrations/00015_add_unit_conversion_factor.sql` - Database migration
- `src/types/database.ts` - Added conversion_factor to ProductRow
- `src/components/forms/product-form.tsx` - Added conversion factor field
- `UNIT_CONVERSION_MIGRATION_GUIDE.md` - This file
