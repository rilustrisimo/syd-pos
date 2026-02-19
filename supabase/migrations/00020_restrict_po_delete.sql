-- Restrict purchase order deletion to admins and managers only
-- Inventory staff can still create/update, but not delete

DROP POLICY IF EXISTS "Inventory staff, managers, and admins can manage POs" ON purchase_orders;

CREATE POLICY "Inventory staff, managers, and admins can insert POs"
    ON purchase_orders FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager', 'inventory_staff')
        )
    );

CREATE POLICY "Inventory staff, managers, and admins can update POs"
    ON purchase_orders FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager', 'inventory_staff')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager', 'inventory_staff')
        )
    );

CREATE POLICY "Admins and managers can delete POs"
    ON purchase_orders FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager')
        )
    );

DROP POLICY IF EXISTS "Inventory staff, managers, and admins can manage PO lines" ON purchase_order_lines;

CREATE POLICY "Inventory staff, managers, and admins can insert PO lines"
    ON purchase_order_lines FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager', 'inventory_staff')
        )
    );

CREATE POLICY "Inventory staff, managers, and admins can update PO lines"
    ON purchase_order_lines FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager', 'inventory_staff')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager', 'inventory_staff')
        )
    );

CREATE POLICY "Admins and managers can delete PO lines"
    ON purchase_order_lines FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'manager')
        )
    );
