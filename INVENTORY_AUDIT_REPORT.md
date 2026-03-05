# Inventory System Audit Report

**Date:** March 3, 2026  
**Auditor:** Development Team  
**Scope:** Complete inventory management system review  
**Reference:** INVENTORY_FLOW_DOCUMENTATION.md

---

## Executive Summary

This audit evaluated the current implementation against the documented inventory flow processes. The system uses a **dual implementation approach**: database triggers for automation and TypeScript functions for business logic. While the core unit conversion logic is sound, several critical issues were identified that could lead to data inconsistencies, race conditions, and inventory inaccuracies.

### Overall Assessment:  🟡 MEDIUM RISK
- ✅ Unit conversion logic is correct and comprehensive
- ✅ Soft delete implementation working properly
- ✅ Audit trail (inventory_movements) is comprehensive
- ⚠️ **CRITICAL:** Web POS lacks atomic transaction wrapping
- ⚠️ **HIGH:** No stock validation before sale
- ⚠️ **MEDIUM:** Race condition vulnerabilities
- ⚠️ **MEDIUM:** Manual adjustments lack unit conversion

---

## Critical Issues (Immediate Action Required)

### 🔴 ISSUE #1: Non-Atomic Transaction Creation (WEB POS)

**Location:** `src/lib/supabase/queries/transactions.ts:269-380`

**Problem:**
The `createTransaction()` function performs multiple sequential database operations WITHOUT wrapping them in an explicit transaction:

```typescript
// Current implementation (WRONG)
export async function createTransaction(...) {
  // 1. Insert transaction
  const { data: transaction } = await supabase
    .from('transactions')
    .insert({...})
    .single()
  
  // 2. Insert lines (loop with multiple awaits)
  for (let i = 0; i < lines.length; i++) {
    await supabase.from('transaction_lines').insert({...})
  }
  
  // 3. Insert payments (loop with multiple awaits)
  for (const payment of payments) {
    await supabase.from('transaction_payments').insert({...})
  }
  
  // Inventory updated by trigger AFTER transaction is committed
}
```

**Risk Scenarios:**
1. **Partial transaction creation:** If line insertion fails midway, transaction exists but is incomplete
2. **Orphaned transactions:** If payment insertion fails, transaction exists without payment records
3. **Inventory inconsistency:** Trigger fires before all lines are inserted, may process incomplete data
4. **No rollback:** If any step fails, previous steps remain committed

**Evidence:**
- Migration 00026 was created specifically to solve this for mobile POS
- Migration comment states: "The web POS continues to use its existing code path (unmodified)"
- Mobile POS uses `create_transaction_atomic()` RPC which wraps everything in implicit transaction

**Impact:** **HIGH** - Can create corrupted transaction records and inventory mismatches

**Recommendation:**
```typescript
// SOLUTION 1: Create similar RPC for web POS
export async function createTransaction(...) {
  const { data, error } = await supabase.rpc('create_transaction_atomic', {
    p_branch_id: input.branch_id,
    p_customer_id: input.customer_id,
    // ... all parameters
    p_lines: lines,
    p_payments: payments
  })
  if (error) throw error
  return data
}

// SOLUTION 2: Use Supabase transaction (if supported)
// Note: Supabase client doesn't support explicit transactions
// Use RPC approach instead
```

**Action Items:**
- [ ] Use `create_transaction_atomic()` RPC for web POS
- [ ] Remove manual inventory update functions (rely on trigger)
- [ ] Add integration tests for failure scenarios
- [ ] Document that all transaction creation must use RPC

---

### 🔴 ISSUE #2: No Inventory Validation Before Sale

**Location:** 
- Trigger: `supabase/migrations/00021_fix_multi_unit_inventory_triggers.sql:103-170`
- RPC: `supabase/migrations/00026_fix_inventory_trigger_and_atomic_create.sql:170-200`

**Problem:**
Neither the database trigger nor the RPC function checks if sufficient inventory exists BEFORE deducting stock. They blindly subtract the quantity without validation.

```sql
-- Current trigger logic
UPDATE branch_inventory
SET quantity_on_hand = quantity_on_hand - base_unit_qty,  -- Can go negative!
    last_movement_at = NOW()
WHERE id = inv_id;
```

**No CHECK constraint exists:**
```sql
-- From 00009_create_inventory.sql
CREATE TABLE branch_inventory (
    quantity_on_hand DECIMAL(12, 4) NOT NULL DEFAULT 0,
    -- NO CHECK constraint preventing negative values!
);
```

**Risk Scenarios:**
1. **Overselling:** Can sell more than available stock
2. **Negative inventory:** Inventory goes negative, causing cascading errors in reports
3. **No user feedback:** POS completes sale successfully even with insufficient stock
4. **Accounting issues:** COGS calculations incorrect when inventory negative

**Impact:** **CRITICAL** - Core business logic failure, allows impossible inventory states

**Recommendation:**

**Option A: Add CHECK constraint (PREVENTS negative inventory)**
```sql
-- Migration: Add constraint to prevent negative inventory
ALTER TABLE branch_inventory 
ADD CONSTRAINT quantity_on_hand_non_negative 
CHECK (quantity_on_hand >= 0);

-- NOTE: This will BLOCK sales when stock insufficient
-- Transaction will fail with constraint violation
```

**Option B: Add validation in RPC (ALLOWS override)**
```sql
CREATE OR REPLACE FUNCTION create_transaction_atomic(...) AS $$
BEGIN
  -- ... existing code ...
  
  -- BEFORE updating inventory, check stock
  IF p_transaction_type = 'sale' THEN
    IF current_qty < base_unit_qty THEN
      -- Option 1: Raise exception (strict)
      RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Requested: %', 
        v_prod_id, current_qty, base_unit_qty;
      
      -- Option 2: Allow but log warning (permissive)
      -- INSERT INTO inventory_warnings (...);
      -- Continue with negative inventory
    END IF;
  END IF;
  
  -- ... continue with UPDATE ...
END;
$$;
```

**Option C: Frontend validation (SOFT check)**
```typescript
// In POS, check before creating transaction
const { data: inventory } = await supabase
  .from('branch_inventory')
  .select('quantity_on_hand')
  .eq('product_id', productId)
  .eq('branch_id', branchId)
  .single()

if (inventory.quantity_on_hand < requiredQty) {
  // Show warning, allow override with permission
  const confirmed = await confirmOverride()
  if (!confirmed) return
}

await createTransaction(...)
```

**Recommended Approach:** 
**Combination of B + C**
- Frontend validation for user experience
- RPC validation as backstop
- Allow manager override for special cases
- NO hard constraint (too restrictive for adjustments)

**Action Items:**
- [ ] Add stock validation to `create_transaction_atomic()` RPC
- [ ] Add frontend validation in POS with configurable behavior
- [ ] Create `allow_negative_inventory` setting per product
- [ ] Add permission check for selling beyond stock
- [ ] Log all negative inventory events for review

---

### 🟡 ISSUE #3: Race Conditions in Concurrent Sales

**Location:** All inventory update operations

**Problem:**
No row-level locking is used when updating inventory, creating race conditions with concurrent transactions.

**Scenario:**
```
Time  | User A (POS 1)              | User B (POS 2)              | Inventory
------|-----------------------------|-----------------------------|----------
T0    | Start sale (10 units)       |                             | 15 units
T1    | Read inventory: 15          |                             | 15 units
T2    |                             | Start sale (10 units)       | 15 units
T3    |                             | Read inventory: 15          | 15 units
T4    | UPDATE SET qty = 15-10 = 5  |                             | 5 units
T5    |                             | UPDATE SET qty = 15-10 = 5  | 5 units (WRONG!)
------|-----------------------------|-----------------------------|----------
Result: Sold 20 units total, but inventory only decreased by 10
```

**Current Code:**
```sql
-- No SELECT FOR UPDATE locking
SELECT id, quantity_on_hand INTO inv_id, current_qty
FROM branch_inventory
WHERE branch_id = p_branch_id
  AND product_id = v_prod_id;

-- Race window here! Another transaction can read same value

UPDATE branch_inventory
SET quantity_on_hand = quantity_on_hand - base_unit_qty
WHERE id = inv_id;
```

**Impact:** **HIGH** - Inventory can become inaccurate under moderate load

**Recommendation:**
```sql
-- SOLUTION: Add row-level locking
SELECT id, quantity_on_hand INTO inv_id, current_qty
FROM branch_inventory
WHERE branch_id = p_branch_id
  AND product_id = v_prod_id
  AND (variant_id = v_variant_id OR ...)
FOR UPDATE;  -- ← Lock this row until transaction completes

-- Now safe to update
UPDATE branch_inventory
SET quantity_on_hand = quantity_on_hand - base_unit_qty
WHERE id = inv_id;
```

**Action Items:**
- [ ] Add `FOR UPDATE` to all inventory SELECT statements
- [ ] Update `create_transaction_atomic()` RPC
- [ ] Update `update_inventory_on_receive()` trigger
- [ ] Update `reverse_transaction_inventory()` trigger
- [ ] Update `adjustInventory()` TypeScript function (migrate to RPC)
- [ ] Add load testing to verify fix

---

### 🟡 ISSUE #4: Manual Adjustment Lacks Unit Conversion

**Location:** `src/lib/supabase/queries/inventory.ts:281-360`

**Problem:**
The `adjustInventory()` function doesn't support unit conversion. It assumes the `quantityChange` is already in base units.

```typescript
export async function adjustInventory(params: {
  branchId: string
  productId: string
  quantityChange: number  // ← Assumes base units!
  notes: string
  userId: string
  // Missing: uomId parameter
  // Missing: variantId parameter
}) {
  // No conversion logic
  const newQuantity = currentQuantity + quantityChange
  
  // Updates directly without conversion
  await supabase
    .from('branch_inventory')
    .update({ quantity_on_hand: newQuantity })
}
```

**Risk Scenarios:**
1. **User confusion:** "I'm adjusting by 10 PC" but system adds 10 BOX
2. **Incorrect adjustments:** Manual stocktakes entered in wrong units
3. **Inconsistent with other operations:** PO receiving and sales handle conversion, adjustments don't

**Impact:** **MEDIUM** - Can cause inventory inaccuracies, but less frequent operation

**Recommendation:**
```typescript
// Enhanced function signature
export async function adjustInventory(params: {
  branchId: string
  productId: string
  variantId?: string | null
  quantityChange: number
  uomId: string  // ← Add unit specification
  notes: string
  userId: string
  reason?: string  // ← Add reason code
}) {
  const supabase = createClient()
  
  // 1. Get product for conversion
  const { data: product } = await supabase
    .from('products')
    .select('base_uom_id, selling_uom_id, conversion_factor')
    .eq('id', params.productId)
    .single()
  
  // 2. Convert to base units
  let baseUnitChange = params.quantityChange
  
  if (params.uomId !== product.base_uom_id) {
    const { data: sellingUnit } = await supabase
      .from('product_selling_units')
      .select('conversion_factor')
      .eq('product_id', params.productId)
      .eq('uom_id', params.uomId)
      .eq('is_active', true)
      .maybeSingle()
    
    if (sellingUnit?.conversion_factor) {
      baseUnitChange = params.quantityChange / sellingUnit.conversion_factor
    } else if (params.uomId === product.selling_uom_id) {
      baseUnitChange = params.quantityChange / product.conversion_factor
    } else {
      throw new Error('Invalid UOM for this product')
    }
  }
  
  // 3. Update inventory in base units
  // ... rest of logic ...
}
```

**Better Solution: Create RPC**
```sql
CREATE OR REPLACE FUNCTION adjust_inventory_atomic(
  p_branch_id UUID,
  p_product_id UUID,
  p_variant_id UUID,
  p_quantity_change DECIMAL,
  p_uom_id UUID,
  p_reason TEXT,
  p_notes TEXT,
  p_user_id UUID
) RETURNS JSONB AS $$
  -- Implement conversion logic
  -- Lock row with FOR UPDATE
  -- Validate non-negative result
  -- Record movement
  -- Return updated inventory
$$;
```

**Action Items:**
- [ ] Create `adjust_inventory_atomic()` RPC
- [ ] Add `uom_id` parameter
- [ ] Add `variant_id` parameter
- [ ] Add `reason` enumeration
- [ ] Require manager approval for large adjustments
- [ ] Update frontend adjustment form to include UOM selector

---

## Medium Issues (Should Fix Soon)

### 🟡 ISSUE #5: Conditional Restocking Not Implemented

**Location:** `src/lib/supabase/queries/transactions.ts:812`

**Problem:**
Returns always restock inventory regardless of reason. No option to mark items as damaged/unsellable.

```typescript
// TODO comment in code:
// TODO: If conditional restocking is needed, add a 'restock' column 
// to transaction_lines and update the trigger to check it before 
// updating inventory
```

**Current Behavior:**
- All returns add inventory back
- No distinction between good/damaged/expired returns
- Can't mark items as "do not restock"

**Impact:** **MEDIUM** - Inventory overstated if damaged items returned

**Recommendation:**
```sql
-- 1. Add column to transaction_lines
ALTER TABLE transaction_lines 
ADD COLUMN should_restock BOOLEAN DEFAULT true;

-- 2. Update return trigger
CREATE OR REPLACE FUNCTION process_transaction_inventory() AS $$
BEGIN
  FOR line IN ... LOOP
    IF line.transaction_type = 'return' THEN
      -- Check if should restock
      IF line.should_restock = true THEN
        UPDATE branch_inventory
        SET quantity_on_hand = quantity_on_hand + base_unit_qty
        WHERE id = inv_id;
        
        INSERT INTO inventory_movements (movement_type) 
        VALUES ('return');
      ELSE
        -- Don't restock, but still record movement
        INSERT INTO inventory_movements (
          movement_type, 
          quantity_change,  -- 0 change
          notes
        ) VALUES (
          'damaged_return',
          0,
          'Not restocked: ' || line.notes
        );
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- 3. Add reason codes to returns
CREATE TYPE return_reason AS ENUM (
  'customer_request',
  'wrong_item',
  'defective',
  'damaged',
  'expired',
  'other'
);

ALTER TABLE transaction_lines 
ADD COLUMN return_reason return_reason;

-- 4. Auto-detect non-restockable reasons
CREATE OR REPLACE FUNCTION before_insert_return_line() AS $$
BEGIN
  IF NEW.return_reason IN ('damaged', 'expired', 'defective') THEN
    NEW.should_restock := false;
  END IF;
  RETURN NEW;
END;
$$;
```

**Action Items:**
- [ ] Add `should_restock` column to transaction_lines
- [ ] Add `return_reason` enum and column
- [ ] Update return creation UI to include reason
- [ ] Update trigger to respect should_restock flag
- [ ] Add separate "Damaged Inventory" tracking
- [ ] Create disposal workflow for non-restockable items

---

### 🟡 ISSUE #6: Missing Variant Support in Manual Adjustments

**Location:** `src/lib/supabase/queries/inventory.ts:281`

**Problem:**
The `adjustInventory` function doesn't include `variant_id` parameter, so can't adjust variant-specific inventory.

```typescript
export async function adjustInventory(params: {
  branchId: string
  productId: string
  // Missing: variantId
  quantityChange: number
  notes: string
  userId: string
})
```

**Impact:** **MEDIUM** - Can't manually adjust variant inventory (only affecting products with variants)

**Recommendation:**
Add `variantId?: string | null` parameter and include in all queries.

**Action Items:**
- [ ] Add `variantId` parameter to function
- [ ] Update all queries to filter by variant
- [ ] Update frontend adjustment form

---

### 🟡 ISSUE #7: Purchase Order Not Using RPC

**Location:** Purchase order receiving logic uses similar non-atomic pattern

**Problem:**
While purchase order receiving is handled by trigger, the trigger fires on UPDATE of `purchase_order_lines`, which may have similar atomicity issues if multiple lines are updated in sequence.

**Current Flow:**
```typescript
// Update PO line with quantity_received
await supabase
  .from('purchase_order_lines')
  .update({ quantity_received })
  .eq('id', lineId)

// Trigger fires AFTER UPDATE for each line
```

**Risk:**
If updating multiple PO lines and one fails midway, some inventory updated but not all.

**Recommendation:**
Create RPC for receiving full PO:

```sql
CREATE OR REPLACE FUNCTION receive_purchase_order_atomic(
  p_po_id UUID,
  p_lines JSONB,  -- [{ line_id, quantity_received }]
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_line JSONB;
BEGIN
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    -- Update line
    UPDATE purchase_order_lines
    SET quantity_received = quantity_received + (v_line->>'quantity_received')::DECIMAL
    WHERE id = (v_line->>'line_id')::UUID;
    
    -- Update inventory (with conversion and locking)
    -- ... same logic as trigger but with FOR UPDATE ...
  END LOOP;
  
  -- Update PO status if fully received
  -- ...
  
  RETURN (SELECT to_jsonb(po.*) FROM purchase_orders po WHERE po.id = p_po_id);
END;
$$;
```

**Action Items:**
- [ ] Create `receive_purchase_order_atomic()` RPC
- [ ] Add stock validation for POs
- [ ] Use RPC in web app
- [ ] Remove manual trigger, handle everything in RPC

---

## Low Priority Issues (Tech Debt)

### 🟢 ISSUE #8: Inconsistent Error Handling

**Problem:**
Some functions throw errors, others return error objects, no consistent pattern.

**Recommendation:**
Standardize on either:
- **RPCs return JSONB with `{success: boolean, error?: string, data?: object}`**
- **Or throw exceptions and handle at API boundary**

---

### 🟢 ISSUE #9: Missing Inverse Operations

**Problem:**
No built-in way to "undo" a transaction beyond soft delete.

**Recommendation:**
Add `reverseTransaction()` function that creates offsetting entries for complex scenarios like PO corrections.

---

### 🟢 ISSUE #10: Insufficient Logging

**Problem:**
Inventory movements track changes, but no log of failed operations, validation errors, or permission denials.

**Recommendation:**
```sql
CREATE TABLE inventory_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation TEXT NOT NULL,  -- 'sale', 'adjustment', etc.
  status TEXT NOT NULL,  -- 'success', 'failed', 'denied'
  error_message TEXT,
  user_id UUID REFERENCES users(id),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Positive Findings ✅

### What's Working Well:

1. **✅ Unit Conversion Logic is Correct**
   - Proper hierarchy: product_selling_units → product.conversion_factor → 1:1
   - Consistently applied in all triggers
   - DECIMAL(12, 4) provides adequate precision
   - Handles edge cases (missing conversion factors)

2. **✅ Soft Delete Implementation**
   - Trigger `reverse_transaction_inventory()` properly reverses inventory
   - Creates audit trail with reversal movements
   - Respects is_deleted flag in all queries
   - Handles both sales and returns

3. **✅ Comprehensive Audit Trail**
   - All movements tracked in `inventory_movements`
   - Includes before/after quantities
   - Records reference IDs and types
   - Captures conversion notes
   - Created_by tracking

4. **✅ Mobile POS Uses Atomic RPC**
   - `create_transaction_atomic()` properly wraps everything
   - Single database transaction ensures consistency
   - Includes inventory updates in same transaction

5. **✅ Database Triggers Handle Automation**
   - Purchase receiving automated
   - Transaction inventory automated  - Soft delete reversal automated
   - Reduces code duplication

6. **✅ Proper Foreign Key Constraints**
   - Referential integrity maintained
   - Cascade deletes where appropriate
   - Prevents orphaned records

---

## Recommendations Summary

### Immediate Actions (This Week):

1. **Migrate Web POS to use `create_transaction_atomic()` RPC**
   - Eliminates atomicity issue
   - Matches mobile POS behavior
   - Delete old `createTransaction()` TypeScript code

2. **Add Stock Validation to RPC**
   - Check `quantity_on_hand >= base_unit_qty` before sale
   - Raise exception if insufficient (can be caught and handled in UI)
   - Add `allow_negative_inventory` product flag for override

3. **Add Row-Level Locking (FOR UPDATE)**
   - Update all RPCs to use `SELECT FOR UPDATE`
   - Prevents race conditions
   - Test under concurrent load

### Short-Term (Next Sprint):

4. **Create `adjust_inventory_atomic()` RPC**
   - Add UOM conversion support
   - Add variant support
   - Require reason code
   - Implement approval workflow for large adjustments

5. **Implement Conditional Restocking**
   - Add `should_restock` and `return_reason` columns
   - Update return trigger
   - Add UI for damaged/defective returns

6. **Create `receive_purchase_order_atomic()` RPC**
   - Handle full PO receiving atomically
   - Add validation and locking

### Long-Term (Next Quarter):

7. **Add Comprehensive Stocktake Features**
   - Batch adjustment from CSV
   - Variance reporting
   - Discrepancy approval workflow

8. **Inventory Reservation System**
   - Reserve stock for pending orders
   - Auto-release on timeout
   - Update `quantity_reserved` correctly

9. **Advanced Auditing**
   - Failed operation logging
   - Performance monitoring
   - Anomaly detection

---

## Testing Recommendations

### Unit Tests Needed:

```typescript
describe('Unit Conversion', () => {
  it('converts selling units to base units correctly')
  it('handles product without conversion factor')
  it('uses product_selling_units over product.conversion_factor')
  it('prevents division by zero')
})

describe('Transaction Creation', () => {
  it('creates transaction, lines, payments atomically')
  it('rolls back all changes if any operation fails')
  it('rejects sale when insufficient inventory')
  it('allows overselling with manager override')
  it('handles concurrent sales to same product')
})

describe('Inventory Adjustments', () => {
  it('converts adjustment quantity to base units')
  it('prevents negative inventory')
  it('requires approval for large adjustments')
  it('records movement with correct reference')
})

describe('Soft Deletes', () => {
  it('restores inventory when sale deleted')
  it('removes inventory when return deleted')
  it('creates reversal movement records')
  it('handles partial reversals')
})
```

### Integration Tests:

```typescript
describe('Concurrent Operations', () => {
  it('handles two simultaneous sales of same product')
  it('handles sale and adjustment at same time')
  it('handles PO receive and sale of same product')
})

describe('End-to-End Scenarios', () => {
  it('completes full purchase → sale → return → delete cycle')
  it('recalculates inventory from movements correctly')
  it('maintains inventory accuracy across branch transfers')
})
```

### Load Tests:

```typescript
describe('Performance Under Load', () => {
  it('handles 100 concurrent sales without race conditions')
  it('processes 1000 PO lines in reasonable time')
  it('maintains accuracy with 50 simultaneous adjustments')
})
```

---

## Migration Plan

### Phase 1: Fix Critical Issues (Week 1)

```sql
-- Migration 00027: Add stock validation and locking

-- 1. Update create_transaction_atomic to check stock
CREATE OR REPLACE FUNCTION create_transaction_atomic(...) AS $$
BEGIN
  -- Add FOR UPDATE locking
  SELECT id, quantity_on_hand INTO inv_id, current_qty
  FROM branch_inventory
  WHERE ...
  FOR UPDATE;  -- Lock row
  
  -- Add stock validation
  IF p_transaction_type = 'sale' AND current_qty < base_unit_qty THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %, Requested: %', current_qty, base_unit_qty
      USING ERRCODE = 'check_violation';
  END IF;
  
  -- Continue with update...
END;
$$;

-- 2. Update triggers to use FOR UPDATE
CREATE OR REPLACE FUNCTION update_inventory_on_receive() AS $$
BEGIN
  SELECT id, quantity_on_hand INTO inv_id, current_qty
  FROM branch_inventory
  WHERE ...
  FOR UPDATE;
  
  -- Continue...
END;
$$;

-- 3. Same for reverse_transaction_inventory trigger
```

### Phase 2: Migrate Web POS (Week 1-2)

```typescript
// Update transactions.ts
export async function createTransaction(...) {
  const supabase = createClient()
  
  // Call RPC instead of manual inserts
  const { data, error } = await supabase.rpc('create_transaction_atomic', {
    p_branch_id: input.branch_id,
    p_customer_id: input.customer_id,
    p_transaction_type: input.transaction_type,
    p_lines: lines.map(l => ({
      product_id: l.product_id,
      variant_id: l.variant_id,
      quantity: l.quantity,
      uom_id: l.uom_id,
      unit_price: l.unit_price,
      cogs_per_unit: l.cogs_per_unit,
      discount_amount: l.discount_amount || 0
    })),
    p_payments: payments.map(p => ({
      payment_method: p.payment_method,
      amount: p.amount,
      reference_number: p.reference_number
    })),
    // ... other params
  })
  
  if (error) throw error
  return data
}

// Delete old helper functions (no longer needed):
// - updateInventoryForSale (handled by RPC)
// - updateCustomerBalance (move to trigger)
```

### Phase 3: Add Adjustment RPC (Week 2)

```sql
-- Migration 00028: Inventory adjustment RPC
CREATE OR REPLACE FUNCTION adjust_inventory_atomic(...) AS $$
-- Implementation as outlined above
$$;
```

### Phase 4: Conditional Restocking (Week 3)

```sql
-- Migration 00029: Conditional restocking
ALTER TABLE transaction_lines ADD COLUMN should_restock BOOLEAN DEFAULT true;
ALTER TABLE transaction_lines ADD COLUMN return_reason return_reason;

CREATE OR REPLACE FUNCTION process_transaction_inventory() AS $$
-- Updated implementation
$$;
```

---

## Monitoring & Alerts

### Metrics to Track:

1. **Negative Inventory Events**
   ```sql
   SELECT COUNT(*) 
   FROM branch_inventory 
   WHERE quantity_on_hand < 0
   ```
   **Alert if:** > 0 (should never happen with fixes)

2. **Inventory Discrepancies**
   ```sql
   WITH movement_sum AS (
     SELECT product_id, SUM(quantity_change) as total
     FROM inventory_movements
     GROUP BY product_id
   )
   SELECT * FROM movement_sum ms
   JOIN branch_inventory bi ON bi.product_id = ms.product_id
   WHERE ABS(bi.quantity_on_hand - ms.total) > 0.01
   ```
   **Alert if:** Any rows returned

3. **Failed Transaction Attempts**
   ```sql
   -- Track in audit log
   SELECT COUNT(*) 
   FROM inventory_audit_log 
   WHERE status = 'failed' 
     AND created_at > NOW() - INTERVAL '1 hour'
   ```
   **Alert if:** > 10 per hour

4. **Large Adjustments**
   ```sql
   SELECT * 
   FROM inventory_movements 
   WHERE movement_type = 'adjustment'
     AND ABS(quantity_change) > 100
     AND created_at > NOW() - INTERVAL '24 hours'
   ```
   **Review daily**

---

## Conclusion

The inventory system has a solid foundation with good unit conversion logic and comprehensive audit trails. However, the dual implementation (TypeScript + triggers) has created atomicity and consistency issues, particularly for the web POS.

**Priority fixes:**
1. ✅ Unit conversion: **Working correctly**
2. 🔴 Atomicity: **Critical issue - must fix**
3. 🔴 Stock validation: **Critical issue - must fix**
4. 🟡 Race conditions: **High priority - should fix**
5. 🟡 Manual adjustments: **Medium priority - improve UX**

By implementing the recommended RPC-based approach for all inventory operations, wrapping everything in database transactions, and adding proper locking and validation, the system will be robust and production-ready.

**Estimated effort:**
- Critical fixes (Phase 1-2): 3-5 days
- Medium priority (Phase 3-4): 3-5 days
- Testing & validation: 2-3 days
- **Total: 2 weeks for complete hardening**

---

**Reviewed By:** Development Team  
**Next Review:** After critical fixes implemented  
**Status:** 🟡 In Progress - Action Items Assigned
