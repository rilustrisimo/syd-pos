# Inventory, Sales & P&L Flow

How products, purchase orders, stock, sales, returns and the P&L actually work in syd-pos. Every rule here was taken from the code that runs today. Where the code behaves in a way that looks wrong, it is described as-is and listed under [Known gaps](#9-known-gaps); nothing in this document is aspirational.

**Last updated:** November 23, 2026. Verified against migrations up to `00109` and the production schema.

## Contents
1. [Overview](#1-overview)
2. [Units and cost](#2-units-and-cost)
3. [Purchase orders](#3-purchase-orders)
4. [Sales](#4-sales)
5. [Returns](#5-returns)
6. [Deleting a sale or return](#6-deleting-a-sale-or-return)
7. [Inventory adjustments](#7-inventory-adjustments)
8. [P&L report](#8-pl-report)
9. [Known gaps](#9-known-gaps)
10. [Function index](#10-function-index)
11. [Stock lots](#11-stock-lots)
12. [Investments](#12-investments)

---

## 1. Overview

```
 Purchase order ──receive──▶ stock +   (purchase movement)
                             product cost = latest PO price (+ delivery share)

 Sale ────────────────────▶ stock −   (sale movement)
                             each line stores its cost at that moment (cogs_per_unit)
   └─ government sale ──deliver──▶ stock −   (only when marked delivered)

 Return ──────────────────▶ stock +   (return movement), or no change if damaged
 Delete sale / return ────▶ stock reversed (adjustment movement)
 Manual adjustment ───────▶ stock ± (adjustment movement)

 P&L = revenue − COGS (from the stored line costs) − expenses
```

**Every stock change goes through one database function** (or one trigger, for deletes). It locks the `branch_inventory` row (`SELECT … FOR UPDATE`), changes `quantity_on_hand`, and writes an `inventory_movements` row with before/after quantities. The app (web POS, frontline, mobile package) only *reads* `branch_inventory`. It never writes it directly.

Stock is tracked **per product per branch** (`branch_inventory`, one row per branch + product + variant).

---

## 2. Units and cost

| Field | Meaning |
|---|---|
| `products.base_uom_id` | The unit stock is stored in. POs are always created in this unit. |
| `products.selling_uom_id` | The product's main selling unit (often the same as base). |
| `products.conversion_factor` | Selling units per base unit, for the main selling unit. Fallback only. |
| `product_selling_units.conversion_factor` | Selling units per base unit, for each extra selling unit (e.g. 1 box = 44 PC → 44). Checked first. |
| `products.latest_cogs` | **Cost of one base unit**: the price on the most recently received PO, including its share of the delivery charge. |
| `products.base_unit_cost` | `latest_cogs × products.conversion_factor`. Shown only on the product form and in exports. |
| `products.current_selling_price` | Main selling price. Never changed automatically. |

**Converting a quantity to base units** (sales, PO receive, adjustments, delete reversal):
1. Unit is the base unit → no conversion.
2. Active `product_selling_units` row for that unit → `quantity ÷ its conversion_factor`.
3. Unit is the product's `selling_uom_id` and `products.conversion_factor > 0` → `quantity ÷ conversion_factor`.
4. Otherwise: PO receive and adjustments **raise an error**; sales and delete reversals **treat it as 1:1**. Returns use different logic (see [Returns](#5-returns)).

**Cost method: last cost.** There is no weighted average. Each received PO overwrites `latest_cogs`. All stock on hand is then valued at the new cost; sales already made keep the cost stored on their lines.

---

## 3. Purchase orders

### Create
`src/app/(dashboard)/purchases/new/page.tsx` (and the reorder page)
- Each line is in the product's **base unit**; the unit cost is pre-filled from `latest_cogs` and can be edited.
- An optional `delivery_charge` is set on the PO.
- **No effect on stock or cost.**

### Receive: `receive_purchase_order_atomic` (migration 00056)
Called with the PO, the lines and quantities received, and an optional delivery date. Full or partial. For each line:
1. **Checks:**
   - The PO exists, isn't deleted, and isn't cancelled.
   - The quantity is > 0.
   - Received so far + this delivery ≤ ordered. Otherwise the error "Cannot receive more than ordered".
   - The product is active.
2. Converts to base units (an unknown unit is an **error**).
3. Adds `quantity_received` to the PO line.
4. Adds the base quantity to `branch_inventory` (creates the row if missing) and writes a **`purchase`** movement.
5. **Sets the product cost:**
   ```
   effective cost = unit_cost × (1 + delivery_charge ÷ PO merchandise total)
   latest_cogs    = effective cost
   base_unit_cost = effective cost × products.conversion_factor
   ```
   The merchandise total is Σ `quantity_ordered × unit_cost` over all PO lines.

After all lines:
- If every line is fully received → status `received`, and `actual_delivery_date` = the date given (or today).
- Otherwise → status `partially_received`.

**The selling price is not touched.** Staff review it in the price review dialog (see `PRICING_POLICY.md`). Because the cost changed, the markup triggers from migration 00036 recalculate `markup_percentage`, keeping the prices as they are:
- `trg_recalculate_product_markup` on the product.
- `trg_sync_psu_markup_on_cogs_change` on each of its selling units.

Older triggers that also changed stock or cost on PO lines (`on_po_line_inventory_update`, `on_po_line_received`) were dropped in migrations 00034 and 00056, so receiving happens in exactly one place.

---

## 4. Sales

### Create: `create_transaction_atomic` (migration 00063)
Used by the web POS, the frontline screen, government sales and the mobile package (`packages/api`). In one database transaction:
1. Inserts the `transactions` header: subtotal, discount amount and percentage, tax, delivery fee, other fees, total, payment status, and government fields.
2. Inserts each `transaction_lines` row with `quantity`, `uom_id`, `unit_price`, `cogs_per_unit` and `discount_amount`.
3. For `sale` and `return` types, **unless it's a government sale**:
   - Converts to base units (an unknown unit falls back to **1:1**, no error).
   - Locks the stock row.
   - **Sale:** if stock < quantity and the product doesn't allow negative stock (`allow_negative_inventory = false`) → error "Insufficient stock". Otherwise subtracts and writes a **`sale`** movement.
   - **Return** (when created through this function): adds back and writes a `return` movement.
4. Inserts `transaction_payments`.

### Item cost (`cogs_per_unit`)
Set by the **client** when the item is added to the cart, then stored on the line and never recalculated:
- `product.cogs` = `latest_cogs` (`searchProductsForPOS` in `src/lib/supabase/queries/transactions.ts`).
- Sold in a unit from `product_selling_units` that isn't the base unit → `latest_cogs ÷ that unit's conversion_factor`.
- Sold in the base unit, or in the product's main selling unit without a selling-unit row → `latest_cogs` as-is.

See `src/app/(frontline)/frontline/page.tsx` (cart add logic) and `src/app/(dashboard)/government/sales/new/page.tsx`.

### Government sales
- Created with `is_government_sale = true`: the lines and cost are saved, but **no stock moves**.
- `deliver_government_sale` (00063) marks it delivered (`is_delivered`, `delivered_at`). It then deducts stock with the same conversion and stock check, writing `sale` movements. Delivering twice is blocked.

### The old sale trigger
`on_transaction_inventory_update` (00029) is still installed. It runs after the header insert, before any lines exist, so it finds no lines and does nothing.

---

## 5. Returns

### Create: `create_return_transaction_atomic` (migrations 00035/00036)
1. **Checks** only that the original sale exists and isn't deleted.
2. Creates a `return` transaction numbered `RTN-YYYYMMDD-…`, linked by `original_transaction_id`. Subtotal and refund come from the client.
3. Each line keeps the client-sent `unit_price` and `cogs_per_unit` and gets a `return_reason`.
4. **Restock rule:**
   - Reason `damaged`, `expired`, `defective` or `quality_issue` → **not restocked**. A `damaged_return` movement with 0 change is written. The `set_restock_flag` trigger (00029) enforces the same rule.
   - Otherwise: restocked unless the client sends `should_restock = false`.
5. **Conversion for restocking:**
   - Base unit → as-is.
   - Selling-unit row → `quantity × conversion_factor`.
   - Otherwise → `quantity × products.conversion_factor` (or × 1).

   This **multiplies**, the opposite of sales (see [Known gaps](#9-known-gaps)).
6. Restocked lines add to stock and write a `return` movement.

---

## 6. Deleting a sale or return

Transactions are never hard-deleted. Deleting sets `is_deleted = true` (with `deleted_by`), and two triggers run:

- **`check_sale_has_no_returns`** (00040): blocks deleting a sale that still has non-deleted returns. Delete the returns first.
- **`reverse_transaction_inventory`** (00062):
  - **Undelivered government sale** → nothing to reverse (stock never moved).
  - **Sale** → adds each line's base quantity back. Writes an `adjustment` movement, reference type `transaction_reversal`.
  - **Return** → subtracts each line's base quantity. Same `adjustment` movement.
  - Converts using the sales rules (divide; unknown unit = 1:1).

Deleted transactions are excluded from every P&L query (`is_deleted = false`).

---

## 7. Inventory adjustments

### `adjust_inventory_atomic` (migration 00028)
- A **reason is required**; the product must be active.
- The quantity change can be in any unit with a conversion. An unknown unit is an **error**.
- Locks the row (creates it at 0 if missing). If the result would be negative and the product doesn't allow negative stock → error.
- Writes an `adjustment` movement. If a conversion was used, it is noted in the movement notes.
- There is no approval step and no size threshold.

### `bulk_adjust_inventory` (00028)
Applies one reason to a list of adjustments by calling `adjust_inventory_atomic` for each.

Both are called from `src/lib/supabase/queries/inventory.ts`.

---

## 8. P&L report

Reports → P&L calls `getPLReport` (`src/lib/supabase/queries/dashboard.ts`), which combines four database functions plus loan interest. All dates are **Manila dates** (`AT TIME ZONE 'Asia/Manila'`), and deleted records are excluded.

| Line | Source | Formula |
|---|---|---|
| **Revenue** | `get_pl_revenue_cogs_daily` (00055) | Per transaction: `subtotal + delivery_fee + other_fees − discount_amount + Σ line discounts`. Sales count +, returns count −. By `transaction_date`. |
| **COGS** | same function | Σ `quantity × cogs_per_unit` over the lines. Sales +, returns −. |
| **Gross profit** | `getPLReport` | Revenue − COGS. Gross margin = gross profit ÷ revenue. |
| **Expenses** | `get_pl_expenses` (00055) | Σ `expenses.amount` by `expense_date`, grouped by category. Includes the payroll expense (see below). |
| **Interest expense** | `getPLReport` | For each `liability_loan_payments` row in range: `amount ÷ scheduled_amount × interest_portion`. Added to the expense total as "Interest Expense". |
| **Net profit** | `getPLReport` | Gross profit − expenses (including interest). Net margin = net profit ÷ revenue. |
| **Purchases** *(info only)* | `get_pl_purchases_daily` (00064) | Σ `quantity_received × unit_cost` for received and partially received POs, plus `delivery_charge` for fully received POs. Dated by `actual_delivery_date` (else `po_date`). **Doesn't affect profit.** |
| **Collections** *(info only)* | `get_pl_collections` (00077) | Σ `min(amount_paid, total_amount)`. Sales +, returns −. **Doesn't affect profit.** |

The P&L is **accrual-based**: profit uses the cost of what was sold (the stored line costs), not what was bought in the period.

**Payroll:** paying a payroll run (`payPayrollRun`) creates one expense in the "Salaries & Wages" category. The amount is the run's **`total_net`**, dated at the period end (`src/lib/supabase/queries/employees.ts`).

**Inventory summary:** `get_inventory_summary` (00064), active products only.
- **Value** = Σ `quantity_on_hand × latest_cogs`.
- **Potential profit** = Σ `quantity_on_hand × (current_selling_price − latest_cogs)`, for stock > 0.
- **Low stock**: quantity > 0 and ≤ `reorder_point`.
- **Out of stock**: quantity ≤ 0.

---

## 9. Known gaps

Current behaviour that can make stock or profit figures drift. None of these are fixed yet.

| # | Gap | Effect | Where |
|---|---|---|---|
| 1 | A product whose main selling unit differs from its base unit, with only `products.conversion_factor` set (no selling-unit row), records `cogs_per_unit = latest_cogs` (a whole base unit's cost) on each selling unit sold. | COGS too high, profit too low for those products. | `frontline/page.tsx` cart add; `searchProductsForPOS` |
| 2 | An unknown unit on a sale or delete reversal is treated as 1:1; on PO receive and adjustments it's an error. | Stock can change by the wrong amount without any warning. | 00063 `create_transaction_atomic`; 00062 |
| 3 | ~~Returns convert by multiplying by the conversion factor; sales divide.~~ **Fixed in 00106**: returns now divide, like sales. Returns made before 00106 in a non-base unit may have over-restocked (diagnostic query at the end of 00106). | — | 00106 |
| 4 | ~~Deleting a return reversed with a different conversion than the return used.~~ **Fixed in 00106** (both now divide). | — | 00106 |
| 5 | ~~Deleting a damaged return subtracted stock that was never added.~~ **Fixed in 00106**: lines with `should_restock = false` are skipped. Also fixed: the `damaged_return` movement type was missing in production, so damaged/expired/defective returns failed outright. | — | 00106 |
| 6 | Returns aren't checked against the quantity on the original sale. | More can be returned than was sold. | 00036 |
| 7 | Damaged returns keep their `cogs_per_unit`, so they reduce COGS even though the item isn't back in stock. | The loss on damaged goods doesn't show in the P&L. | 00036; 00055 |
| 8 | Government sales count in revenue and COGS on the sale date, but stock leaves on delivery. | Stock on hand looks higher than reality until delivery. | 00063 |
| 9 | Payroll posts net pay, not gross pay plus employer contributions. | Labour cost understated unless SSS/PhilHealth/Pag-IBIG employer shares are entered as separate expenses. | `employees.ts` |
| 10 | The daily trend's net profit is gross profit − daily expenses, without loan interest; the total includes interest. | Daily net profits don't add up to the total when there's interest. | `getPLReport` |
| 11 | Last-cost valuation: each received PO revalues all stock on hand. | Inventory value swings with the latest price; past sales are unaffected. | 00056; 00064 |
| 12 | `base_unit_cost = latest_cogs × conversion_factor`, though `latest_cogs` is already per base unit. | `base_unit_cost` is wrong for products with a conversion ≠ 1 (display and export only). | 00056 |

---

## 10. Function index

| Area | Function / code | Defined in (latest) |
|---|---|---|
| PO receive | `receive_purchase_order_atomic` | `supabase/migrations/00056_fix_po_receive_issues.sql` |
| PO receiving status | `get_po_receiving_status` | `00030_create_receive_po_atomic_rpc.sql` |
| Sale (all channels) | `create_transaction_atomic` | `00063_government_delivery_rpc.sql` |
| Government delivery | `deliver_government_sale` | `00063_government_delivery_rpc.sql` |
| Return | `create_return_transaction_atomic` | `00036_fix_return_reason_type_cast.sql` |
| Return restock flag | `set_restock_flag_from_reason` (trigger `set_restock_flag`) | `00029_add_conditional_restocking.sql` |
| Delete reversal | `reverse_transaction_inventory` (trigger `on_transaction_soft_delete_reverse_inventory`) | `00062_government_delivery_flow.sql` |
| Delete guard | `check_sale_has_no_returns` (trigger `prevent_deleting_sales_with_returns`) | `00040_prevent_deleting_sales_with_returns.sql` |
| Adjustments | `adjust_inventory_atomic`, `bulk_adjust_inventory` | `00028_create_adjust_inventory_rpc.sql` |
| Inert sale trigger | `process_transaction_inventory` (trigger `on_transaction_inventory_update`) | `00029_add_conditional_restocking.sql` |
| Markup recalculation | `recalculate_product_markup`, `sync_psu_markup_on_cogs_change`, `recalculate_psu_markup` | `00036_auto_recalculate_markup.sql` |
| P&L revenue & COGS | `get_pl_revenue_cogs_daily` | `00055_fix_discount_double_subtraction.sql` |
| P&L expenses | `get_pl_expenses` | `00055_fix_discount_double_subtraction.sql` |
| P&L purchases | `get_pl_purchases_daily` | `00064_add_pl_purchases_and_inventory_summary_rpc.sql` |
| P&L collections | `get_pl_collections` | `00077_fix_pl_collections_returns_sign.sql` |
| Inventory summary | `get_inventory_summary` | `00064_add_pl_purchases_and_inventory_summary_rpc.sql` |
| P&L assembly | `getPLReport` | `src/lib/supabase/queries/dashboard.ts` |
| Item cost at sale | cart add logic; `searchProductsForPOS` | `src/app/(frontline)/frontline/page.tsx`; `src/lib/supabase/queries/transactions.ts` |
| PO create | line defaults (base unit, cost = `latest_cogs`) | `src/app/(dashboard)/purchases/new/page.tsx` |
| Payroll expense | `payPayrollRun` → "Salaries & Wages" expense | `src/lib/supabase/queries/employees.ts` |

When an inventory or P&L function changes, update this document and the "Last updated" line.

---

## 11. Stock lots

Migrations 00107–00109. Every delivery is a **lot** (`inventory_lots`): branch, product, base-unit cost including the delivery-charge share, quantity received and remaining. Stock that existed when lots were introduced became one `opening` lot per product (store-owned, at `latest_cogs`).

Rule: Σ lot `qty_remaining` = on-hand stock (or 0 when stock is negative). The view `lot_stock_mismatch` lists any product/branch where that isn't true; it should always be empty.

| Event | Lots |
|---|---|
| PO receive | New `po` lot. Cost per base unit = effective PO cost × received qty ÷ base qty. |
| Sale / government delivery | `lots_private.consume`: oldest lot first. Within a lot, investor shares in tag order, then the store. Each piece is a `lot_consumptions` row. Selling below zero stock records a lot-less (store) consumption at `latest_cogs`. |
| Return | `lots_private.return_restore`: matched to the original sale's latest consumptions. Restocked units go back to the same lot/owner; damaged ones don't. |
| Deleted sale / return | `reverse_sale` / `reverse_return` undo the above. |
| Adjustment + | New store-owned `adjustment` lot at `latest_cogs`. |
| Adjustment − | `lots_private.trim`: store-owned units first (newest lot first), then investor units (recorded in `lot_writeoffs` as a buy-back at cost). |

The `lots_private` schema isn't exposed through the API; only the stock functions call it.

## 12. Investments

Admin only (RLS + checks in each function). Screens: **Investments** (sidebar), the investment detail page (statement PDF), and **Tag to Investment** on a received PO.

- An investment has a fixed **profit share %** and a fixed **reinvest / payout** mode (both apply to all its past sales, so they can't be changed later).
- **Tagging** (`tag_investment`): part of a lot is assigned to an investment (`investment_lot_shares`). Only units still unsold and untagged can be tagged, so tagging later never claims past sales. The cost (qty × lot cost) must fit the investment's available amount. Untagging (`untag_investment`) works for unsold units only.
- **What the investor earns** per unit sold = cost + % × (selling price − cost), times the share of the sale the customer has paid. Below-cost sales reduce it by the same %. Selling price = line total minus its share of the order discount; fees stay the store's.
- **Losses**: damaged returns and stock losses are taken from store stock first; any investor unit lost is bought back at cost.
- **Figures** (`get_investment_figures`, all computed, nothing stored):
  - Available = capital + top-ups − withdrawals − tagged cost + capital returned + buy-backs (+ profit − payouts in reinvest mode).
  - Owed to investor = profit earned − payouts (payout mode).
- **P&L**: "Investor profit share (collected)" for sales in the period, then "Net Profit after Investors" (`get_investor_profit_share`).
