# Multi-Unit Selling Feature

## Overview
This feature allows products to be sold in multiple units with different pricing for each unit. For example, sand can be sold both by cubic meter and by sack, with different prices for each.

## Use Case Example: Screen Sand

**Purchase:**
- Buy from supplier: 10 cubic meters @ ₱500/m³  
- Inventory tracked: 10 m³ (always in base unit)

**Sell:**
- Option 1: ₱550/m³ (cubic meter) - 10% markup
- Option 2: ₱30/sack (20 sacks per m³) - 20% markup
- Option 3: ₱3/kg (1000 kg per m³) - 25% markup

**When customer buys:**
- Customer buys 5 sacks → Deducts 0.25 m³ from inventory (5 ÷ 20 = 0.25)
- Customer buys 2 m³ → Deducts 2 m³ from inventory
- All units automatically convert to base unit for inventory tracking

## Database Schema

### New Table: `product_selling_units`
```sql
CREATE TABLE product_selling_units (
  id uuid PRIMARY KEY,
  product_id uuid REFERENCES products(id), product_id uuid REFERENCES products(id),
  uom_id uuid REFERENCES units_of_measure(id),
  conversion_factor numeric(12, 4),  -- How many units per 1 base unit
  markup_percentage numeric(5, 2),
  selling_price numeric(12, 2),
  is_primary boolean DEFAULT false,   -- Default unit shown in POS
  is_active boolean DEFAULT true,
  created_at timestamptz,
  updated_at timestamptz
);
```

### Conversion Factor Calculation

**Important:** The conversion factor is "units per base unit", not "base units per unit"

**Example 1: Sand (Cubic Meter → Sacks)**
- Base Unit: 1 cubic meter (m³)
- Selling Unit: Sack
- Relationship: 1 m³ = 20 sacks
- `conversion_factor`: **20** (20 sacks per 1 m³)
- When selling 5 sacks: Deduct 5 ÷ 20 = 0.25 m³

**Example 2: Sand (Cubic Meter → Kilograms)**
- Base Unit: 1 cubic meter (m³)
- Selling Unit: Kilogram (kg)
- Relationship: 1 m³ = 1000 kg
- `conversion_factor`: **1000** (1000 kg per 1 m³)
- When selling 250 kg: Deduct 250 ÷ 1000 = 0.25 m³

## How to Use

### 1. Create/Setup Product
1. Go to Products → Add Product (or Edit existing)
2. Set **Base Unit** (used for inventory & purchases)
   - Example: Cubic Meter
3. Set **Selling Unit** (primary selling unit)
   - Example: Sack
4. Set **Conversion Factor** if Base ≠ Selling
   - Example: 20 (if 1 m³ = 20 sacks)
5. Set initial pricing
6. **Save the product first**

### 2. Add Additional Selling Units (Edit Mode Only)
After saving the product:
1. Scroll to **Multiple Selling Units** section
2. Click **Add Selling Unit**
3. Fill in the dialog:
   - **Unit**: Select from available units (e.g., Kilogram)
   - **Conversion Factor**: How many of this unit per 1 base unit (e.g., 1000 for kg)
   - **Markup %**: Profit margin for this unit (e.g., 25%)
   - **Selling Price**: Auto-calculated, but can be edited
4. Click **Add**

### 3. Manage Selling Units
- **Edit**: Click pencil icon to modify price/markup
- **Delete**: Click trash icon to remove (soft delete)
- **Set Primary**: Click star icon to make it the default POS unit
- View conversion formula and pricing in table

## Pricing Calculation

### Auto-Calculation Formula
```
Unit Cost = Product COGS × Conversion Factor
Selling Price = Unit Cost × (1 + Markup% / 100)
```

**Example: Sand Product**
- Product COGS: ₱500/m³ (from latest purchase)
- Selling Unit: Sack
- Conversion: 20 sacks per m³
- Markup: 20%

**Calculation:**
```
Unit Cost = ₱500 ÷ 20 = ₱25 per sack
Selling Price = ₱25 × (1 + 20/100) = ₱25 ×1.20 = ₱30 per sack
```

### Manual Override
You can manually edit the selling price after calculation. The system will use your custom price.

## Inventory Impact

### How Inventory is Deducted
All inventory is tracked in **BASE UNITS** only. When selling in different units, the system automatically converts:

**Sales Example:**
1. Customer buys 10 sacks of sand
2. System looks up conversion: 20 sacks per m³
3. Converts to base: 10 ÷ 20 = 0.5 m³
4. Dedects 0.5 m³ from inventory
5. Logs movement with notes about the conversion

**Purchase Example:**
1. Receive 5 m³ of sand @ ₱500/m³
2. Adds 5 m³ to inventory (no conversion needed - already in base unit)
3. Updates COGS: ₱500/m³
4. All selling units' prices auto-calculate from this COGS

## POS Integration

### Product Selection (To Be Implemented)
When adding a product with multiple selling units to cart:
1. Product card shows all available units
2. User selects desired unit from dropdown
3. Price updates based on selected unit
4. Quantity entered in that unit
5. On save: Auto-converts to base unit for inventory

### Display Example:
```
Screen Sand
Units: [Cubic Meter ▼] [Sack] [Kilogram]

Cubic Meter: ₱550/m³
Sack: ₱30/sack (20 per m³)
Kilogram: ₱3/kg (1000 per m³)
```

## Migration & Backward Compatibility

### Automatic Migration
When you run the migration (`00019_add_product_selling_units.sql`):
- Existing products automatically get their `selling_uom_id` added as a selling unit
- This becomes the PRIMARY selling unit
- Existing `current_selling_price` is preserved
- No data loss or changes to existing products

### Existing System Behavior
Products without additional selling units:
- Work exactly as before
- Use `products.selling_uom_id` and `products.current_selling_price`
- No changes needed to existing code

Products with additional selling units:
- POS shows unit selector
- Pricing varies by selected unit
- Inventory still tracked in base unit

## Files Created/Modified

### Database
- `supabase/migrations/00019_add_product_selling_units.sql` - Migration

### Types
- `src/types/database.ts` - Added `ProductSellingUnitRow`

### Queries/Hooks
- `src/lib/supabase/queries/product-selling-units.ts` - CRUD operations
- `src/hooks/useProductSellingUnits.ts` - React hooks

### Components
- `src/components/products/product-selling-units-manager.tsx` - UI component
- `src/components/forms/product-form.tsx` - Integrated manager

## Testing Checklist

- [ ] Run migration in Supabase SQL Editor
- [ ] Verify existing products still work
- [ ] Create new product with base unit only (no additional units)
- [ ] Edit product and add 2-3 selling units
- [ ] Verify price calculations are correct
- [ ] Set different unit as primary
- [ ] Edit selling unit markup/price
- [ ] Delete a selling unit
- [ ] Test POS with multi-unit product (after POS integration)
- [ ] Verify inventory deduction with different units
- [ ] Check inventory movements logging

## Next Steps

1. **Run Migration**:
   ```sql
   -- In Supabase SQL Editor
   \i supabase/migrations/00019_add_product_selling_units.sql
   ```

2. **Test in Product Form**:
   - Edit an existing product
   - Add multiple selling units
   - Verify calculations

3. **POS Integration** (Future):
   - Add unit selector to product cards
   - Update cart logic to handle selected unit
   - Ensure inventory conversion on checkout

4. **Reports** (Future):
   - Sales by unit analysis
   - Unit preference trends
   - Pricing optimization

## Technical Notes

### Why Conversion Factor is "Per Base Unit"
- Makes inventory calculations consistent
- Easier to understand: "20 sacks per 1 m³"
- Formula: `base_qty = selling_qty ÷ conversion_factor`
- Avoids decimal errors in common scenarios

### Primary Unit
- Only ONE unit can be primary per product
- Primary unit is default in POS
- Customers can switch to other units if needed
- Database trigger ensures only one primary

### Soft Delete
- Deleting a selling unit sets `is_active = false`
- Historical transactions still reference the unit
- Can be reactivated if needed
- Maintains data integrity

## Support

For questions or issues:
1. Check this documentation
2. Review the migration SQL comments
3. Test in development environment first
4. Check Supabase logs for errors
