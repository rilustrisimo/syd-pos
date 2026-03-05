# Inventory Management Flow Documentation

## Table of Contents
1. [Purchase Order (PO) Process](#purchase-order-po-process)
2. [Sales Transaction Process](#sales-transaction-process)
3. [Deleting Sales Records](#deleting-sales-records)
4. [Product Returns Process](#product-returns-process)
5. [Inventory Adjustment Process](#inventory-adjustment-process)
6. [Unit Conversion System](#unit-conversion-system)
7. [Critical Rules & Safeguards](#critical-rules--safeguards)

---

## Purchase Order (PO) Process

### Flow Overview
```
Create PO → Review/Approve → Receive Items → Update Inventory
```

### Detailed Steps

#### 1. Create Purchase Order
**Tables Affected:**
- `purchase_orders` (insert)
- `purchase_order_lines` (insert)

**Data Captured:**
```sql
purchase_orders:
  - id (UUID)
  - po_number (unique)
  - supplier_id
  - branch_id
  - order_date
  - expected_date
  - status ('draft', 'pending', 'approved', 'received', 'cancelled')
  - total_amount
  - is_deleted (false)

purchase_order_lines:
  - id (UUID)
  - po_id
  - product_id
  - variant_id (optional)
  - quantity_ordered (DECIMAL to support conversions)
  - quantity_received (DECIMAL, initially 0)
  - uom_id (unit of measure ordered in)
  - unit_cost
  - line_total
```

**Inventory Impact:** NONE (inventory not affected until items are received)

---

#### 2. Receive Purchase Order Items
**Trigger:** User marks items as received (full or partial)

**Tables Affected:**
- `purchase_order_lines` (update quantity_received)
- `purchase_orders` (update status if fully received)
- `branch_inventory` (update or insert)
- `inventory_movements` (insert audit trail)

**Process:**
```javascript
FOR EACH line in PO:
  1. Get ordered unit (uom_id) and received quantity
  2. Convert to BASE UNIT:
     
     // Check if using multi-unit selling system
     IF product_selling_units exists for (product_id, uom_id):
       base_quantity = quantity_received / conversion_factor
     
     // Fallback to product-level conversion
     ELSE IF uom_id == product.selling_uom_id:
       base_quantity = quantity_received / product.conversion_factor
     
     // Already in base unit
     ELSE IF uom_id == product.base_uom_id:
       base_quantity = quantity_received
     
     // ERROR: Unknown conversion
     ELSE:
       THROW ERROR "Cannot convert from {uom} to base unit"
  
  3. Update or Create branch_inventory:
     
     SELECT * FROM branch_inventory 
     WHERE branch_id = {branch_id}
       AND product_id = {product_id}
       AND variant_id = {variant_id}
     
     IF EXISTS:
       UPDATE quantity_on_hand = quantity_on_hand + base_quantity
       UPDATE last_movement_at = NOW()
     ELSE:
       INSERT new record with quantity_on_hand = base_quantity
  
  4. Record movement in inventory_movements:
     
     INSERT INTO inventory_movements (
       branch_id,
       product_id,
       variant_id,
       movement_type: 'purchase',
       quantity_change: +base_quantity,
       quantity_before: old_quantity,
       quantity_after: new_quantity,
       reference_type: 'purchase_order',
       reference_id: po_id,
       po_line_id: po_line_id,
       uom_id: received_uom_id,
       created_by: user_id
     )
  
  5. Update PO line:
     UPDATE purchase_order_lines
     SET quantity_received = quantity_received + received_qty
```

**Example:**
```
Product: "Cement"
Base Unit: BOX (base_uom_id = uuid-box)
Selling Unit: PC (selling_uom_id = uuid-pc)
Conversion: 1 BOX = 44 PC (conversion_factor = 44)

PO receives: 88 PC
Calculation: 88 / 44 = 2.0 BOX
Inventory Update: +2.0 BOX
```

**Loophole Prevention:**
- ✅ Always use transaction to prevent partial updates
- ✅ Validate conversion_factor > 0 before division
- ✅ Record original UOM in inventory_movements for audit
- ✅ Check product.is_active before receiving
- ✅ Prevent receiving more than ordered

---

## Sales Transaction Process

### Flow Overview
```
Create Sale → Select Products → Calculate Totals → Payment → Update Inventory
```

### Detailed Steps

#### 1. Create Sale Transaction
**Tables Affected:**
- `transactions` (insert)
- `transaction_lines` (insert)
- `transaction_payments` (insert)
- `branch_inventory` (update - DECREASE)
- `inventory_movements` (insert audit trail)

**Process:**
```javascript
TRANSACTION START:

1. Insert into transactions:
   - transaction_number (auto-generated)
   - branch_id
   - customer_id
   - transaction_type: 'sale'
   - transaction_date
   - subtotal (sum of line_totals)
   - discount_amount (transaction-level)
   - tax_amount
   - delivery_fee
   - other_fees
   - total_amount
   - payment_status
   - is_deleted: false

2. FOR EACH product sold:
   
   a. Insert transaction_line:
      - transaction_id
      - product_id
      - variant_id
      - quantity (in selling unit, DECIMAL)
      - uom_id (unit sold in)
      - unit_price
      - cogs_per_unit (cost of goods sold)
      - discount_amount (line-level)
      - line_total (COMPUTED: quantity * unit_price - discount_amount)
   
   b. Convert quantity to BASE UNIT:
      
      // Multi-unit system
      IF product_selling_units exists for (product_id, uom_id):
        base_quantity = quantity / conversion_factor
      
      // Product-level conversion
      ELSE IF uom_id == product.selling_uom_id:
        base_quantity = quantity / product.conversion_factor
      
      // Already base unit
      ELSE IF uom_id == product.base_uom_id:
        base_quantity = quantity
      
      ELSE:
        THROW ERROR "Invalid UOM for product"
   
   c. Decrease inventory:
      
      UPDATE branch_inventory
      SET quantity_on_hand = quantity_on_hand - base_quantity,
          last_movement_at = NOW()
      WHERE branch_id = {branch_id}
        AND product_id = {product_id}
        AND variant_id = {variant_id}
      
      // CRITICAL: Check if enough stock
      IF new_quantity_on_hand < 0:
        ROLLBACK TRANSACTION
        THROW ERROR "Insufficient stock"
   
   d. Record movement:
      
      INSERT INTO inventory_movements (
        movement_type: 'sale',
        quantity_change: -base_quantity,
        reference_type: 'transaction',
        reference_id: transaction_id,
        transaction_line_id: line_id,
        uom_id: sold_uom_id
      )

3. Record payments

TRANSACTION COMMIT
```

**Example:**
```
Product: "Cement"
Base Unit: BOX
Conversion: 1 BOX = 44 PC

Sale: 22 PC @ ₱15/PC
Calculation: 22 / 44 = 0.5 BOX
Inventory Update: -0.5 BOX

Current Inventory: 10.5 BOX
After Sale: 10.0 BOX
```

**Loophole Prevention:**
- ✅ Use database transaction (atomic operation)
- ✅ Check stock BEFORE committing sale
- ✅ Validate uom_id is valid for product
- ✅ Prevent negative inventory (configurable per product)
- ✅ Lock inventory row during update (SELECT FOR UPDATE)
- ✅ Record both sold quantity AND base quantity

---

## Deleting Sales Records

### Flow Overview
```
Mark Transaction as Deleted → Restore Inventory → Create Reversal Movement
```

### Critical Rules
**⚠️ NEVER physically delete transactions** - Use soft delete (is_deleted = true)

### Process

#### Soft Delete Implementation
```javascript
TRANSACTION START:

1. Mark transaction as deleted:
   
   UPDATE transactions
   SET is_deleted = true,
       updated_at = NOW()
   WHERE id = {transaction_id}

2. FOR EACH line in transaction_lines:
   
   a. Get original sold quantity and convert to base unit:
      
      // Same conversion logic as sale
      base_quantity = convert_to_base_unit(
        quantity, 
        uom_id, 
        product_id
      )
   
   b. RESTORE inventory (ADD BACK):
      
      UPDATE branch_inventory
      SET quantity_on_hand = quantity_on_hand + base_quantity,
          last_movement_at = NOW()
      WHERE branch_id = {branch_id}
        AND product_id = {product_id}
        AND variant_id = {variant_id}
   
   c. Record reversal movement:
      
      INSERT INTO inventory_movements (
        movement_type: 'sale_reversal',
        quantity_change: +base_quantity,  // POSITIVE
        reference_type: 'transaction_deletion',
        reference_id: transaction_id,
        notes: 'Inventory restored from deleted transaction {txn_number}'
      )

TRANSACTION COMMIT
```

**Why Soft Delete?**
- ✅ Maintains audit trail
- ✅ Can generate accurate historical reports
- ✅ Prevents data integrity issues
- ✅ Reversible if mistake
- ✅ Helps with accounting reconciliation

**Loophole Prevention:**
- ✅ Require authorization for deletion
- ✅ Must specify reason for deletion
- ✅ Cannot delete transactions older than X days (configurable)
- ✅ Log who deleted and when
- ✅ Create offsetting inventory movement (not just UPDATE)
- ✅ Check fiscal period not closed

**Filtering in Reports:**
```sql
-- All active transactions
SELECT * FROM transactions 
WHERE is_deleted = false

-- Include deleted for audit
SELECT * FROM transactions 
-- no filter on is_deleted
```

---

## Product Returns Process

### Flow Overview
```
Customer Returns Item → Create Return Transaction → Add Back to Inventory
```

### Process

#### Return Transaction Creation
```javascript
TRANSACTION START:

1. Create return transaction:
   
   INSERT INTO transactions (
     transaction_type: 'return',
     branch_id,
     customer_id,
     original_transaction_id,  // Link to original sale
     transaction_date,
     is_deleted: false
   )

2. FOR EACH returned item:
   
   a. Insert return line:
      
      INSERT INTO transaction_lines (
        transaction_id: return_txn_id,
        product_id,
        variant_id,
        quantity: returned_qty,  // In selling unit
        uom_id,
        unit_price,  // Original sale price
        cogs_per_unit
      )
   
   b. Convert to base unit:
      
      base_quantity = convert_to_base_unit(
        quantity,
        uom_id,
        product_id
      )
   
   c. ADD inventory back:
      
      UPDATE branch_inventory
      SET quantity_on_hand = quantity_on_hand + base_quantity,
          last_movement_at = NOW()
      WHERE branch_id = {branch_id}
        AND product_id = {product_id}
        AND variant_id = {variant_id}
   
   d. Record movement:
      
      INSERT INTO inventory_movements (
        movement_type: 'return',
        quantity_change: +base_quantity,  // POSITIVE
        reference_type: 'transaction',
        reference_id: return_transaction_id,
        notes: 'Product returned from {original_txn_number}'
      )

3. Update customer account if credit customer

TRANSACTION COMMIT
```

**Return Types:**
1. **Full Return** - All items returned
2. **Partial Return** - Some items returned
3. **Damaged Return** - Mark as damaged, may not restock
4. **Exchange** - Return + New Sale (2 transactions)

**Conditional Restocking:**
```javascript
// Option to NOT add back to inventory for damaged items
IF return_reason == 'damaged':
  // Still create return transaction
  // But insert movement with movement_type: 'damaged_return'
  // Do NOT update branch_inventory
  
  INSERT INTO inventory_movements (
    movement_type: 'damaged_return',
    quantity_change: 0,  // No inventory change
    notes: 'Damaged return - not restocked'
  )
```

**Loophole Prevention:**
- ✅ Validate return quantity ≤ original quantity sold
- ✅ Check return within allowed period
- ✅ Link to original transaction (traceability)
- ✅ Cannot return same item twice
- ✅ Damaged items tracked separately
- ✅ Require reason for return

---

## Inventory Adjustment Process

### Flow Overview
```
Stocktake/Audit → Identify Discrepancy → Create Adjustment → Update Inventory
```

### Process

#### Manual Adjustment
```javascript
TRANSACTION START:

1. User provides adjustment data:
   - product_id
   - variant_id
   - branch_id
   - adjustment_type: 'add' | 'subtract'
   - quantity_change (in base unit OR specify uom_id)
   - reason
   - notes

2. Convert to base unit if needed:
   
   IF uom_id provided AND uom_id != base_uom_id:
     base_quantity = quantity / conversion_factor
   ELSE:
     base_quantity = quantity_change

3. Apply adjustment:
   
   a. Get current inventory:
      SELECT quantity_on_hand FROM branch_inventory
      WHERE branch_id = {branch_id}
        AND product_id = {product_id}
        AND variant_id = {variant_id}
   
   b. Calculate new quantity:
      IF adjustment_type == 'add':
        new_quantity = quantity_on_hand + base_quantity
      ELSE:
        new_quantity = quantity_on_hand - base_quantity
      
      // Prevent negative inventory
      IF new_quantity < 0:
        THROW ERROR "Adjustment would result in negative inventory"
   
   c. Update inventory:
      UPDATE branch_inventory
      SET quantity_on_hand = new_quantity,
          last_movement_at = NOW()
   
   d. Record movement:
      INSERT INTO inventory_movements (
        movement_type: 'adjustment',
        quantity_change: adjustment_type == 'add' ? 
                         +base_quantity : -base_quantity,
        quantity_before: old_quantity,
        quantity_after: new_quantity,
        reference_type: 'inventory_adjustment',
        created_by: user_id,
        reason: reason,
        notes: notes
      )

TRANSACTION COMMIT
```

**Adjustment Reasons:**
- `stocktake` - Physical count differs from system
- `damage` - Products damaged/expired
- `theft` - Stock loss due to theft
- `correction` - Fix data entry error
- `transfer` - Moving between branches (2 adjustments)
- `other` - Other reason (requires notes)

**Authorization Levels:**
```javascript
// Require manager/admin approval for large adjustments
IF ABS(base_quantity) > threshold:
  adjustment_status = 'pending_approval'
  // Require approval before applying
ELSE:
  adjustment_status = 'approved'
  // Apply immediately
```

**Loophole Prevention:**
- ✅ Require authorization (role check)
- ✅ Mandatory reason selection
- ✅ Large adjustments need approval
- ✅ Cannot adjust negative beyond zero
- ✅ Record who, when, why, how much
- ✅ Separate movement type for audit trail
- ✅ Consider enabling/disabling per product

---

## Unit Conversion System

### Multi-Level Conversion Hierarchy

```
Priority 1: product_selling_units (multi-unit system)
  └─ Specific conversions per UOM
  
Priority 2: products.conversion_factor
  └─ Single selling UOM conversion
  
Priority 3: No conversion (1:1)
  └─ Assumes same unit
```

### Conversion Function (Universal)
```javascript
function convertToBaseUnit(quantity, uom_id, product_id) {
  // 1. Get product details
  const product = SELECT * FROM products WHERE id = product_id;
  
  // 2. Already in base unit?
  if (uom_id === product.base_uom_id) {
    return quantity;
  }
  
  // 3. Check multi-unit selling system
  const sellingUnit = SELECT * FROM product_selling_units
                      WHERE product_id = product_id
                        AND uom_id = uom_id
                        AND is_active = true;
  
  if (sellingUnit && sellingUnit.conversion_factor > 0) {
    return quantity / sellingUnit.conversion_factor;
  }
  
  // 4. Check product-level conversion (legacy/simple products)
  if (uom_id === product.selling_uom_id && 
      product.conversion_factor > 0) {
    return quantity / product.conversion_factor;
  }
  
  // 5. Unknown conversion - ERROR
  throw new Error(
    `Cannot convert ${uom_id} to base unit for product ${product_id}. ` +
    `No conversion factor defined.`
  );
}
```

### Decimal Precision

**Database Schema:**
```sql
-- All quantity columns use DECIMAL(12, 4)
-- Supports up to 99,999,999.9999

branch_inventory.quantity_on_hand     DECIMAL(12, 4)
transaction_lines.quantity            DECIMAL(12, 4)
purchase_order_lines.quantity_ordered DECIMAL(12, 4)
inventory_movements.quantity_change   DECIMAL(12, 4)
```

**Why 4 Decimal Places?**
- Handles fine conversions: 1÷44 = 0.0227
- Supports fractional units: 0.5 BOX
- Prevents rounding errors in reports
- Standard for inventory systems

**Example Conversions:**
```
Cement: 1 BOX = 44 PC

Sell 1 PC:
  1 / 44 = 0.0227 BOX (stored exactly)

Sell 22 PC:
  22 / 44 = 0.5 BOX (stored exactly)

Purchase 132 PC:
  132 / 44 = 3.0 BOX (stored exactly)
```

---

## Critical Rules & Safeguards

### 1. Transaction Atomicity
**Rule:** All inventory operations MUST use database transactions
```sql
BEGIN;
  -- Update inventory
  -- Insert movement
  -- Update related tables
COMMIT;
-- If ANY step fails, ALL steps rollback
```

### 2. Never Skip Inventory Movements
**Rule:** Every inventory change MUST have a corresponding movement record
```sql
-- ❌ WRONG
UPDATE branch_inventory SET quantity_on_hand = 100;

-- ✅ CORRECT
UPDATE branch_inventory SET quantity_on_hand = 100;
INSERT INTO inventory_movements (...);
```

### 3. Always Convert to Base Unit
**Rule:** Inventory is ALWAYS stored in base_uom_id
```javascript
// ❌ WRONG
inventory.quantity += sold_quantity;  // What unit?

// ✅ CORRECT
base_qty = convertToBaseUnit(sold_qty, uom_id, product_id);
inventory.quantity += base_qty;
```

### 4. Use Soft Deletes for Transactions
**Rule:** NEVER physically delete financial/inventory transactions
```sql
-- ❌ WRONG
DELETE FROM transactions WHERE id = ?;

-- ✅ CORRECT
UPDATE transactions SET is_deleted = true WHERE id = ?;
-- THEN reverse inventory
```

### 5. Validate Before Commit
**Checklist before committing any inventory change:**
- [ ] Conversion factor validated (> 0)
- [ ] UOM exists and is valid for product
- [ ] Sufficient stock for deductions
- [ ] User has permission
- [ ] Product is active
- [ ] Inventory movement created
- [ ] Quantities are positive (or negative for deductions)

### 6. Prevent Race Conditions
**Use row-level locking for concurrent updates:**
```sql
-- Lock inventory row during update
SELECT * FROM branch_inventory
WHERE branch_id = ? AND product_id = ?
FOR UPDATE;  -- Lock this row

-- Now safe to update
UPDATE branch_inventory SET ...;
```

### 7. Audit Trail Requirements
**Every operation must be traceable:**
- Who: `created_by` (user_id)
- When: `created_at` (timestamp)
- What: `quantity_change`, `movement_type`
- Why: `reason`, `notes`
- Reference: `reference_type`, `reference_id`

### 8. Reconciliation Process
**Weekly/Monthly reconciliation:**
```sql
-- Verify: Sum of movements = Current inventory
WITH movement_sum AS (
  SELECT 
    branch_id, 
    product_id,
    SUM(quantity_change) as total_movements
  FROM inventory_movements
  WHERE movement_type NOT IN ('stocktake_correction')
  GROUP BY branch_id, product_id
)
SELECT 
  bi.product_id,
  bi.quantity_on_hand as system_qty,
  ms.total_movements as calculated_qty,
  bi.quantity_on_hand - ms.total_movements as discrepancy
FROM branch_inventory bi
LEFT JOIN movement_sum ms USING (branch_id, product_id)
WHERE ABS(bi.quantity_on_hand - ms.total_movements) > 0.01;
```

---

## Common Pitfalls & How to Avoid

### ❌ Pitfall 1: Forgetting Unit Conversion
**Problem:** Adding/subtracting quantities directly without conversion
```javascript
// WRONG
inventory.quantity -= transaction_line.quantity;
```
**Solution:** Always use conversion function
```javascript
// CORRECT
const baseQty = convertToBaseUnit(
  transaction_line.quantity,
  transaction_line.uom_id,
  transaction_line.product_id
);
inventory.quantity -= baseQty;
```

### ❌ Pitfall 2: Manual Inventory Updates
**Problem:** Updating inventory without creating movement record
```sql
-- WRONG - No audit trail
UPDATE branch_inventory SET quantity_on_hand = 50;
```
**Solution:** Always create movement
```sql
-- CORRECT
INSERT INTO inventory_movements (...);
UPDATE branch_inventory SET quantity_on_hand = 50;
```

### ❌ Pitfall 3: Not Using Transactions
**Problem:** Partial updates when error occurs
```javascript
// WRONG - Can leave inconsistent state
updateInventory();  // Succeeds
createMovement();   // Fails - inventory updated but no record!
```
**Solution:** Wrap in database transaction
```javascript
// CORRECT
await db.transaction(async (trx) => {
  await updateInventory(trx);
  await createMovement(trx);
});
// Both succeed or both rollback
```

### ❌ Pitfall 4: Ignoring is_deleted Flag
**Problem:** Counting deleted transactions in inventory calculations
```sql
-- WRONG - Includes deleted sales
SELECT SUM(quantity) FROM transaction_lines;
```
**Solution:** Always filter deleted
```sql
-- CORRECT
SELECT SUM(tl.quantity) 
FROM transaction_lines tl
JOIN transactions t ON t.id = tl.transaction_id
WHERE t.is_deleted = false;
```

### ❌ Pitfall 5: Division by Zero
**Problem:** conversion_factor set to 0 or NULL
```javascript
// WRONG - Can cause crash
const base_qty = quantity / conversion_factor;
```
**Solution:** Validate before division
```javascript
// CORRECT
if (!conversion_factor || conversion_factor <= 0) {
  throw new Error('Invalid conversion factor');
}
const base_qty = quantity / conversion_factor;
```

---

## Integration Checkpoints

### When Creating New Features
Before implementing any feature that affects inventory:

1. **Identify All Inventory Touchpoints**
   - Which tables are affected?
   - Does it add, subtract, or adjust inventory?
   - What unit is the user working in?

2. **Design the Flow**
   - Draw the complete process flow
   - Identify all database operations
   - List all validations needed

3. **Implement with Safeguards**
   - Use database transactions
   - Add unit conversion
   - Create inventory movements
   - Add authorization checks
   - Validate all inputs

4. **Test Edge Cases**
   - Try with different units
   - Test with decimal quantities
   - Try with 0 conversion factor
   - Test concurrent updates
   - Test rollback scenarios

5. **Document**
   - Add to this document
   - Include in code comments
   - Update API documentation

---

## Summary Checklist

For EVERY inventory operation, verify:

- [ ] ✅ Uses database transaction (BEGIN...COMMIT)
- [ ] ✅ Converts quantity to base unit correctly
- [ ] ✅ Validates conversion_factor > 0
- [ ] ✅ Creates inventory_movements record
- [ ] ✅ Checks sufficient stock (for deductions)
- [ ] ✅ Uses soft delete (is_deleted flag)
- [ ] ✅ Has authorization check
- [ ] ✅ Supports DECIMAL quantities
- [ ] ✅ Locks row during update (FOR UPDATE)
- [ ] ✅ Has audit information (who/when/why)
- [ ] ✅ Handles errors gracefully (rollback)
- [ ] ✅ Filters deleted records in reports

---

**Last Updated:** March 3, 2026  
**Maintained By:** Development Team  
**Review Frequency:** After any inventory-related changes
