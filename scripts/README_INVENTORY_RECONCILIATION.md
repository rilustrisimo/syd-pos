# Inventory Reconciliation Scripts

## Problem
The inventory double-counting bug caused existing inventory quantities to be incorrect. While the bug is now fixed in the code, historical data needs to be corrected.

## Solution: Dynamic Reconciliation

These scripts calculate the **correct inventory** for all products by:
1. ✅ Summing all purchases received (from `purchase_order_lines`)
2. ✅ Subtracting all sales (from `transaction_lines`, with unit conversion)
3. ✅ Comparing with current inventory
4. ✅ Fixing any discrepancies

---

## Scripts

### 1. Check Discrepancies (Read-Only)
**File**: `check-inventory-discrepancies.sql`

**Purpose**: See what's wrong before fixing anything.

**How to use**:
1. Open your Supabase Dashboard → SQL Editor
2. Copy and paste the contents of `check-inventory-discrepancies.sql`
3. Run it
4. Review the results:
   - Shows products with incorrect inventory
   - Displays: Purchased, Sold, Should Be, Current Qty, Difference
   - Summary shows total products affected

**Example output**:
```
Product Code    | Should Be | Current Qty | Difference | Status
VOSCH-EMETER    | 5         | 10          | -5         | ⚠ OVER
PRODUCT-XYZ     | 12        | 24          | -12        | ⚠ OVER
```

---

### 2. Fix All Inventory (Reconciliation)
**File**: `fix-inventory-double-counting.sql`

**Purpose**: Automatically correct all inventory to match purchases - sales.

**How to use**:
1. **First**, run `check-inventory-discrepancies.sql` to review what will change
2. Open `fix-inventory-double-counting.sql` in Supabase SQL Editor
3. **Review the script** - it's currently set to `ROLLBACK` (safe mode)
4. Run it to see what would change
5. If results look correct:
   - Change the last line from `ROLLBACK;` to `COMMIT;`
   - Run it again to apply the fixes
6. The script will:
   - Update all inventory quantities
   - Create inventory_movement records for audit trail
   - Show a summary of corrections made

---

## What the Scripts Do

### Calculation Logic

```
Correct Inventory = Total Purchases Received - Total Sales

For each product:
  Total Purchases = SUM(purchase_order_lines.quantity_received)
  
  Total Sales = SUM(transaction_lines.quantity) with unit conversion:
    - If selling_uom != base_uom:
        base_qty = quantity / conversion_factor
    - Otherwise:
        base_qty = quantity
  
  Correct Quantity = Total Purchases - Total Sales
```

### Safety Features

1. **Transaction-wrapped**: All changes in one atomic operation
2. **Audit trail**: Every correction logged in `inventory_movements`
3. **Review first**: Set to `ROLLBACK` by default
4. **Detailed notes**: Each movement includes calculation details

---

## Example Workflow

```bash
# Step 1: Check what's wrong
Run check-inventory-discrepancies.sql in Supabase
→ "Oh, VOSCH-EMETER should be 5 but is 10"

# Step 2: Review the fix script
Run fix-inventory-double-counting.sql (with ROLLBACK)
→ Shows: "Will update 15 products, adjust -50 total units"

# Step 3: Apply the fix
Change ROLLBACK to COMMIT in fix-inventory-double-counting.sql
Run it again
→ "✓ Updated 15 products, logged 15 movements"

# Step 4: Verify
Run check-inventory-discrepancies.sql again
→ "0 products with discrepancies"
```

---

## Expected Results

### Before Fix
```
Product Code    | Should Be | Current Qty | Difference
VOSCH-EMETER    | 5         | 10          | -5
CEMENT-50KG     | 8         | 16          | -8
REBAR-10MM      | 50        | 100         | -50
```

### After Fix
```
Product Code    | Should Be | Current Qty | Difference
(No rows - all correct!)
```

---

## Important Notes

⚠️ **Before Running the Fix**:
- Backup your database (Supabase has automatic backups, but be safe)
- Run the check script first to understand the scope
- Review the results carefully
- Make sure no one is actively receiving POs during the fix

✅ **After Running the Fix**:
- All new purchases will work correctly (bug is fixed in code)
- Historical data will be accurate
- Inventory movements will have full audit trail
- Product search in POS will show correct quantities

---

## Troubleshooting

**Q: Script shows VOSCH-EMETER should be 5 but current is still 10 after fix**  
A: Make sure you changed `ROLLBACK` to `COMMIT` in the fix script

**Q: Some products show negative "Should Be" quantity**  
A: This means more was sold than purchased - check if:
  - There were returns not accounted for
  - Manual adjustments were made
  - Opening inventory wasn't recorded

**Q: Can I run this multiple times?**  
A: Yes! The script is idempotent - it recalculates from source data each time, so running it multiple times with COMMIT will just create extra (identical) inventory_movements records.

---

## Support

If you need help or see unexpected results:
1. Check the `inventory_movements` table for detailed logs
2. Review the reconciliation notes in each movement record
3. Verify that purchases and sales are being recorded correctly
