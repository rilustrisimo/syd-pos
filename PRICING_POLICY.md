# Pricing Review Policy

## Overview
The system automatically updates product costs when purchase orders are received. Selling prices are proposed and approved per item. This document explains the pricing rules and behavior.

## Pricing Update Rules

### ✅ When Prices Are Reviewed

**Trigger Event:** When items from a Purchase Order are received

**What Updates Automatically:**
1. **Cost of Goods Sold (COGS)** - Always updated to reflect the latest purchase cost

**What Requires Approval:**
2. **Selling Price** - Proposed in a review screen and must be approved per item

### 🧾 Approval-Based Pricing Changes

**Key Rule:** Selling prices are never auto-applied. Each item is reviewed and approved.

**Available Actions per Item:**
- **Accept proposed price** (based on markup)
- **Retain current price**
- **Custom price** (system recalculates markup)
- **Custom markup** (system recalculates price)

**Example Scenarios:**

#### Scenario 1: Accept Proposed Price
- Current COGS: ₱50.00
- Current Selling Price: ₱65.00 (30% markup)
- **New PO:** Unit cost is ₱60.00
- **Result:**
   - ✅ COGS updated to ₱60.00
   - ✅ Proposed Price = ₱78.00 (₱60 × 1.30)
   - ✅ User accepts proposed price

#### Scenario 2: Retain Current Price
- Current COGS: ₱50.00
- Current Selling Price: ₱65.00 (30% markup)
- **New PO:** Unit cost is ₱40.00
- **Result:**
   - ✅ COGS updated to ₱40.00
   - ✅ Proposed Price = ₱52.00
   - ⛔ User retains current price at ₱65.00

#### Scenario 3: Custom Price
- Current COGS: ₱50.00
- Current Selling Price: ₱65.00 (30% markup)
- **New PO:** Unit cost is ₱60.00
- **Result:**
   - ✅ COGS updated to ₱60.00
   - ✅ Proposed Price = ₱78.00
   - ✏️ User enters ₱75.00; system recalculates markup

## Why This Policy?

### Business Rationale

1. **Deliberate Pricing Decisions**
   - Prevents unintentional price changes
   - Ensures pricing updates are approved by staff

2. **Flexible Pricing Control**
   - Choose between proposed, retained, or custom pricing
   - Supports strategic pricing decisions per item

3. **Accurate Cost Tracking**
   - COGS always reflects latest purchase cost
   - Inventory valuation stays accurate

## Manual Price Adjustments

### When Manual Adjustment Is Needed

If you want to change pricing outside the receive flow:

1. Navigate to **Products** → Select the product
2. Click **Edit Product**
3. Adjust the **Selling Price** or **Markup %**
4. System keeps values in sync
5. Save changes

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

**With Price Change:**
- New purchase: ₱300/bag
- New COGS per kg = ₱300 ÷ 50 = ₱6.00
- Proposed Price = ₱6.00 × 1.20 = ₱7.20/kg
- User decides to accept, retain, or customize

## UI Indicators

### Receive Dialog

The system shows a price preview before receiving items:

**Proposed Price (Requires Approval):**
```
Proposed price (requires approval):
₱65.00 → ₱78.00  [30% markup]
```

## Technical Implementation

**Database Trigger:** `update_product_pricing_on_receive()`

**Location:** 
- `supabase/migrations/00019_update_pricing_trigger_upward_only.sql`

**Logic:**
```sql
-- Update only COGS on receive
UPDATE products
SET latest_cogs = v_calculated_cogs
WHERE id = NEW.product_id;
```

## Best Practices

### For Inventory Managers

1. ✅ **Review proposed prices** after receiving items
2. ✅ **Retain or customize pricing** when needed
3. ✅ **Document reasons** for manual price changes

### For Business Owners

1. ✅ **Monitor profit margins** using cost reports
2. ✅ **Set pricing strategy** for high-margin items
3. ✅ **Competitive analysis** for items with declining costs
4. ✅ **Train staff** on manual price adjustment procedures

## Future Enhancements

Potential features to consider:

- [ ] Price history tracking and reporting
- [ ] Alert notifications for significant cost changes
- [ ] Bulk price adjustment tools
- [ ] Competitive pricing intelligence
- [ ] Tiered pricing based on customer types
- [ ] Promotional pricing with expiration dates

---

**Last Updated:** February 19, 2026  
**Migration:** 00019_update_pricing_trigger_upward_only.sql
