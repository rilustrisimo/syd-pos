-- Fix RLS policies to avoid infinite recursion
-- The issue is that policies on other tables query the users table,
-- but the users table itself has RLS that tries to query users again.

-- Create a helper function that bypasses RLS to get the current user's role
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS user_role AS $$
DECLARE
    current_role user_role;
BEGIN
    SELECT role INTO current_role
    FROM public.users
    WHERE id = auth.uid();

    RETURN current_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated;

-- Drop existing problematic policies on users table
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can manage users" ON users;
DROP POLICY IF EXISTS "Users can view their own profile" ON users;

-- Recreate users policies using the helper function (no recursion)
CREATE POLICY "Users can view own profile"
    ON users FOR SELECT
    TO authenticated
    USING (id = auth.uid());

CREATE POLICY "Admins can view all users"
    ON users FOR SELECT
    TO authenticated
    USING (public.get_current_user_role() = 'admin');

CREATE POLICY "Admins can manage all users"
    ON users FOR ALL
    TO authenticated
    USING (public.get_current_user_role() = 'admin');

-- Fix product_categories policies
DROP POLICY IF EXISTS "Anyone can view active categories" ON product_categories;
DROP POLICY IF EXISTS "Managers and admins can manage categories" ON product_categories;

CREATE POLICY "Authenticated users can view active categories"
    ON product_categories FOR SELECT
    TO authenticated
    USING (is_active = TRUE);

CREATE POLICY "Managers and admins can manage categories"
    ON product_categories FOR ALL
    TO authenticated
    USING (public.get_current_user_role() IN ('admin', 'manager'));

-- Fix product_subcategories policies
DROP POLICY IF EXISTS "Anyone can view active subcategories" ON product_subcategories;
DROP POLICY IF EXISTS "Managers and admins can manage subcategories" ON product_subcategories;

CREATE POLICY "Authenticated users can view active subcategories"
    ON product_subcategories FOR SELECT
    TO authenticated
    USING (is_active = TRUE);

CREATE POLICY "Managers and admins can manage subcategories"
    ON product_subcategories FOR ALL
    TO authenticated
    USING (public.get_current_user_role() IN ('admin', 'manager'));

-- Fix products policies
DROP POLICY IF EXISTS "Anyone can view active products" ON products;
DROP POLICY IF EXISTS "Managers, inventory staff, and admins can manage products" ON products;

CREATE POLICY "Authenticated users can view active products"
    ON products FOR SELECT
    TO authenticated
    USING (is_active = TRUE);

CREATE POLICY "Managers inventory staff and admins can manage products"
    ON products FOR ALL
    TO authenticated
    USING (public.get_current_user_role() IN ('admin', 'manager', 'inventory_staff'));

-- Fix product_variants policies
DROP POLICY IF EXISTS "Anyone can view active variants" ON product_variants;
DROP POLICY IF EXISTS "Managers, inventory staff, and admins can manage variants" ON product_variants;

CREATE POLICY "Authenticated users can view active variants"
    ON product_variants FOR SELECT
    TO authenticated
    USING (is_active = TRUE);

CREATE POLICY "Managers inventory staff and admins can manage variants"
    ON product_variants FOR ALL
    TO authenticated
    USING (public.get_current_user_role() IN ('admin', 'manager', 'inventory_staff'));

-- Fix product_images policies
DROP POLICY IF EXISTS "Anyone can view product images" ON product_images;
DROP POLICY IF EXISTS "Managers, inventory staff, and admins can manage images" ON product_images;

CREATE POLICY "Authenticated users can view product images"
    ON product_images FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Managers inventory staff and admins can manage images"
    ON product_images FOR ALL
    TO authenticated
    USING (public.get_current_user_role() IN ('admin', 'manager', 'inventory_staff'));

-- Fix unit_conversions policies
DROP POLICY IF EXISTS "Anyone can view unit conversions" ON unit_conversions;
DROP POLICY IF EXISTS "Managers, inventory staff, and admins can manage conversions" ON unit_conversions;

CREATE POLICY "Authenticated users can view unit conversions"
    ON unit_conversions FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Managers inventory staff and admins can manage conversions"
    ON unit_conversions FOR ALL
    TO authenticated
    USING (public.get_current_user_role() IN ('admin', 'manager', 'inventory_staff'));

-- Fix branches policies
DROP POLICY IF EXISTS "Authenticated users can view branches" ON branches;
DROP POLICY IF EXISTS "Admins can manage branches" ON branches;

CREATE POLICY "Authenticated users can view branches"
    ON branches FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Admins can manage branches"
    ON branches FOR ALL
    TO authenticated
    USING (public.get_current_user_role() = 'admin');

-- Fix units_of_measure policies (if they exist)
DROP POLICY IF EXISTS "Anyone can view units" ON units_of_measure;
DROP POLICY IF EXISTS "Admins can manage units" ON units_of_measure;

CREATE POLICY "Authenticated users can view units"
    ON units_of_measure FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Admins can manage units"
    ON units_of_measure FOR ALL
    TO authenticated
    USING (public.get_current_user_role() = 'admin');

-- Fix suppliers policies
DROP POLICY IF EXISTS "Authenticated users can view active suppliers" ON suppliers;
DROP POLICY IF EXISTS "Managers, inventory staff, and admins can manage suppliers" ON suppliers;

CREATE POLICY "Authenticated users can view active suppliers"
    ON suppliers FOR SELECT
    TO authenticated
    USING (is_active = TRUE);

CREATE POLICY "Managers inventory staff and admins can manage suppliers"
    ON suppliers FOR ALL
    TO authenticated
    USING (public.get_current_user_role() IN ('admin', 'manager', 'inventory_staff'));

-- Fix customers policies
DROP POLICY IF EXISTS "Authenticated users can view customers" ON customers;
DROP POLICY IF EXISTS "Can manage customers" ON customers;

CREATE POLICY "Authenticated users can view customers"
    ON customers FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Staff can manage customers"
    ON customers FOR ALL
    TO authenticated
    USING (public.get_current_user_role() IN ('admin', 'manager', 'cashier'));

-- Fix branch_inventory policies
DROP POLICY IF EXISTS "Authenticated users can view inventory" ON branch_inventory;
DROP POLICY IF EXISTS "Inventory staff, managers, and admins can manage inventory" ON branch_inventory;

CREATE POLICY "Authenticated users can view inventory"
    ON branch_inventory FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Inventory staff managers and admins can manage inventory"
    ON branch_inventory FOR ALL
    TO authenticated
    USING (public.get_current_user_role() IN ('admin', 'manager', 'inventory_staff'));

-- Fix inventory_movements policies
DROP POLICY IF EXISTS "Authenticated users can view movements" ON inventory_movements;
DROP POLICY IF EXISTS "Inventory staff, managers, and admins can create movements" ON inventory_movements;

CREATE POLICY "Authenticated users can view movements"
    ON inventory_movements FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Inventory staff managers and admins can create movements"
    ON inventory_movements FOR INSERT
    TO authenticated
    WITH CHECK (public.get_current_user_role() IN ('admin', 'manager', 'inventory_staff', 'cashier'));

-- Fix purchase_orders policies
DROP POLICY IF EXISTS "Authenticated users can view purchase orders" ON purchase_orders;
DROP POLICY IF EXISTS "Inventory staff, managers, and admins can manage POs" ON purchase_orders;

CREATE POLICY "Authenticated users can view purchase orders"
    ON purchase_orders FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Inventory staff managers and admins can manage POs"
    ON purchase_orders FOR ALL
    TO authenticated
    USING (public.get_current_user_role() IN ('admin', 'manager', 'inventory_staff'));

-- Fix purchase_order_lines policies
DROP POLICY IF EXISTS "Authenticated users can view PO lines" ON purchase_order_lines;
DROP POLICY IF EXISTS "Inventory staff, managers, and admins can manage PO lines" ON purchase_order_lines;

CREATE POLICY "Authenticated users can view PO lines"
    ON purchase_order_lines FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Inventory staff managers and admins can manage PO lines"
    ON purchase_order_lines FOR ALL
    TO authenticated
    USING (public.get_current_user_role() IN ('admin', 'manager', 'inventory_staff'));

-- Fix transactions policies
DROP POLICY IF EXISTS "Authenticated users can view transactions" ON transactions;
DROP POLICY IF EXISTS "Cashiers, managers, and admins can create transactions" ON transactions;
DROP POLICY IF EXISTS "Managers and admins can update transactions" ON transactions;

CREATE POLICY "Authenticated users can view transactions"
    ON transactions FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Cashiers managers and admins can create transactions"
    ON transactions FOR INSERT
    TO authenticated
    WITH CHECK (public.get_current_user_role() IN ('admin', 'manager', 'cashier'));

CREATE POLICY "Managers and admins can update transactions"
    ON transactions FOR UPDATE
    TO authenticated
    USING (public.get_current_user_role() IN ('admin', 'manager'));

-- Fix transaction_lines policies
DROP POLICY IF EXISTS "Authenticated users can view transaction lines" ON transaction_lines;
DROP POLICY IF EXISTS "Cashiers, managers, and admins can create transaction lines" ON transaction_lines;

CREATE POLICY "Authenticated users can view transaction lines"
    ON transaction_lines FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Cashiers managers and admins can create transaction lines"
    ON transaction_lines FOR INSERT
    TO authenticated
    WITH CHECK (public.get_current_user_role() IN ('admin', 'manager', 'cashier'));

-- Fix transaction_payments policies
DROP POLICY IF EXISTS "Authenticated users can view payments" ON transaction_payments;
DROP POLICY IF EXISTS "Cashiers, managers, and admins can create payments" ON transaction_payments;

CREATE POLICY "Authenticated users can view payments"
    ON transaction_payments FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Cashiers managers and admins can create payments"
    ON transaction_payments FOR INSERT
    TO authenticated
    WITH CHECK (public.get_current_user_role() IN ('admin', 'manager', 'cashier'));
