# Product Price Update Instructions

## Overview
This updates all 184 products in the Supabase `products` table with pricing data from `SYD_Materials_2026-02-08.csv`.

## Files Created
1. `update-prices.sql` - Part 1 (First 117 products)
2. `update-prices-part2.sql` - Part 2 (Remaining 67 products - Electrical, Adhesives, Hardware, Plumbing)

## How to Run

### Option 1: Supabase SQL Editor (Recommended)
1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project: "hllwppmhursjljnxaise"
3. Click on "SQL Editor" in the left sidebar
4. Click "New Query"
5. Copy and paste the contents of `update-prices.sql`
6. Click "Run" button
7. Repeat steps 4-6 for `update-prices-part2.sql`

### Option 2: Run via Supabase CLI (if installed)
```bash
cd /Users/eyorsogood/Sites/syd/syd-pos
supabase db execute --file scripts/update-prices.sql
supabase db execute --file scripts/update-prices-part2.sql
```

## What Gets Updated
Each UPDATE statement modifies the following columns:
- `latest_cogs` - Latest cost of goods sold (from CSV "Cost Price")
- `markup_percentage` - Markup percentage (from CSV "Markup %")
- `current_selling_price` - Current selling price (from CSV "Selling Price")
- `updated_at` - Timestamp of update

## Product Identification
Products are matched by the `code` column (e.g., 'GI-24X8', 'CN-2', 'PLY-ORD-14')

## Verification
After running both SQL files, you can verify the updates:

```sql
-- Check total updated products
SELECT COUNT(*) as updated_products 
FROM products 
WHERE latest_cogs > 0;

-- View sample of updated products
SELECT code, name, latest_cogs, markup_percentage, current_selling_price 
FROM products 
WHERE latest_cogs > 0 
ORDER BY code 
LIMIT 20;

-- Find any products that weren't updated (if codes don't match)
SELECT code, name 
FROM products 
WHERE latest_cogs = 0 OR latest_cogs IS NULL;
```

## Note
- If a product code in the CSV doesn't exist in your database, that UPDATE statement will simply skip it (no error)
- The script updates `updated_at` timestamp automatically
- All 184 products from the CSV are included

## Summary
- Total products to update: 184
- Part 1: 117 products (Roofing, Nails, Steel, Wood, Cement, PVC basics)
- Part 2: 67 products (Electrical, Adhesives, Hardware, Plumbing)
