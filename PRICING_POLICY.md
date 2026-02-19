# Automatic Pricing Policy

## Overview
The system automatically updates product costs and selling prices when purchase orders are received. This document explains the pricing rules and behavior.

## Pricing Update Rules

### ✅ When Prices Are Automatically Adjusted

**Trigger Event:** When items from a Purchase Order are received

**What Updates:**
1. **Cost of Goods Sold (COGS)** - Always updated to reflect the latest purchase cost
2. **Selling Price** - Only updated if it would **increase**

### 🔒 Upward-Only Price Adjustment

**Key Rule:** Selling prices can only be automatically increased, never decreased.

**Example Scenarios:**

#### Scenario 1: Price Increase (Auto-Applied)
- Current COGS: ₱50.00
- Current Selling Price: ₱65.00 (30% markup)
- **New PO:** Unit cost is ₱60.00
- **Result:**
  - ✅ COGS updated to ₱60.00
  - ✅ Selling Price updated to ₱78.00 (₱60 × 1.30)

#### Scenario 2: Price Decrease (NOT Auto-Applied)
- Current COGS: ₱50.00
- Current Selling Price: ₱65.00 (30% markup)
- **New PO:** Unit cost is ₱40.00 (supplier discount)
- **Result:**
  - ✅ COGS updated to ₱40.00 (for accurate cost tracking)
  - ⛔ Selling Price remains ₱65.00 (manual adjustment required)
  - ⚠️ UI shows: "Price unchanged (would decrease to ₱52.00)"

#### Scenario 3: Same Price
- Current COGS: ₱50.00
- Current Selling Price: ₱65.00 (30% markup)
- **New PO:** Unit cost is ₱50.00
- **Result:**
  - ✅ COGS updated to ₱50.00
  - ➖ Selling Price remains ₱65.00 (no change needed)

## Why This Policy?

### Business Rationale

1. **Prevents Accidental Price Drops**
   - Protects profit margins from automatic erosion
   - Volume discounts from suppliers don't force price reductions
   - Short-term supplier promotions don't affect customer pricing

2. **Requires Conscious Decision for Price Reductions**
   - Price decreases are strategic decisions
   - Must be manually reviewed and approved
   - Ensures competitive pricing changes are intentional

3. **Inflation Protection**
   - Automatically keeps up with rising supplier costs
   - No lag time between cost increase and price update
   - Maintains consistent markup percentages

4. **Inventory Valuation**
   - COGS always reflects latest purchase cost
   - Accurate cost tracking even when prices don't change
   - Better inventory valuation for reporting

## Manual Price Adjustments

### When Manual Adjustment Is Needed

If you receive inventory at a lower cost and want to pass savings to customers:

1. Navigate to **Products** → Select the product
2. Click **Edit Product**
3. Manually adjust the **Selling Price**
4. System will recalculate the **Markup %** automatically
5. Save changes

### Recommended Review Process

When COGS decreases but prices don't auto-adjust:

1. Review competitive pricing in the market
2. Consider strategic pricing goals
3. Decide whether to:
   - Keep current price (higher margin)
   - Lower price (more competitive, volume increase)
   - Adjust partially (balance margin and competition)

## Unit Conversion Handling

For products with different buying and selling units:

**Example: Cement**
- Buy: 50kg bags at ₱250/bag
- Sell: Per kilogram
- Conversion Factor: 50

**Automatic Calculation:**
- COGS per kg = ₱250 ÷ 50 = ₱5.00
- If markup = 20%
- Selling Price = ₱5.00 × 1.20 = ₱6.00/kg

**With Price Increase:**
- New purchase: ₱300/bag
- New COGS per kg = ₱300 ÷ 50 = ₱6.00
- New Selling Price = ₱6.00 × 1.20 = ₱7.20/kg ✅ Auto-applied

**With Price Decrease:**
- New purchase: ₱200/bag
- New COGS per kg = ₱200 ÷ 50 = ₱4.00
- Calculated Price = ₱4.00 × 1.20 = ₱4.80/kg
- Current Price = ₱6.00/kg ⛔ Remains unchanged (manual review needed)

## UI Indicators

### Receive Dialog

The system shows a price preview before receiving items:

**Price Will Increase:**
```
Price update on receive:
₱65.00 → ₱78.00  [30% markup]
          ↑ Green (will be applied)
```

**Price Would Decrease:**
```
Price update on receive:
₱65.00 → ₱65.00  [30% markup]
          ↑ Gray (unchanged)
⚠️ Price unchanged (would decrease to ₱52.00)
```

## Technical Implementation

**Database Trigger:** `update_product_pricing_on_receive()`

**Location:** 
- `supabase/migrations/00019_update_pricing_trigger_upward_only.sql`

**Logic:**
```sql
IF v_new_selling_price > v_current_selling_price THEN
    -- Update both COGS and selling price
ELSE
    -- Only update COGS, keep current selling price
END IF
```

## Best Practices

### For Inventory Managers

1. ✅ **Review price change previews** before receiving items
2. ✅ **Note when prices don't auto-adjust** (indicates lower cost)
3. ✅ **Schedule periodic pricing reviews** for products with declining costs
4. ✅ **Document reasons** for manual price changes

### For Business Owners

1. ✅ **Monitor profit margins** using cost reports
2. ✅ **Set pricing strategy** for high-margin items
3. ✅ **Competitive analysis** for items with declining costs
4. ✅ **Train staff** on manual price adjustment procedures

## Future Enhancements

Potential features to consider:

- [ ] Price change approval workflow
- [ ] Price history tracking and reporting
- [ ] Alert notifications for significant cost changes
- [ ] Bulk price adjustment tools
- [ ] Competitive pricing intelligence
- [ ] Tiered pricing based on customer types
- [ ] Promotional pricing with expiration dates

---

**Last Updated:** February 19, 2026  
**Migration:** 00019_update_pricing_trigger_upward_only.sql
