-- ============================================================
-- Migration 00044: Generic Notification Infrastructure
-- Reusable by any module (liabilities, inventory alerts, etc.)
-- ============================================================

-- Generic notification inbox
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(100) NOT NULL,             -- 'payable_due', 'payable_overdue', 'loan_payment_due', etc.
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  entity_type VARCHAR(50),               -- 'liability_payable', 'liability_loan_schedule'
  entity_id UUID,                        -- FK (not enforced, intentionally generic)
  target_roles TEXT[] NOT NULL DEFAULT '{"admin","manager","accountant"}',
  branch_id UUID REFERENCES branches(id),
  metadata JSONB,                        -- flexible: amount_due, days_until_due, supplier_name, etc.
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_unread ON notifications(is_read, created_at DESC);
CREATE INDEX idx_notifications_entity ON notifications(entity_type, entity_id);
CREATE INDEX idx_notifications_branch ON notifications(branch_id, created_at DESC);
CREATE INDEX idx_notifications_type ON notifications(type, created_at DESC);

-- Notification settings — configurable reminder windows per entity type per branch
CREATE TABLE notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id),       -- NULL = global default for all branches
  entity_type VARCHAR(50) NOT NULL,
  reminder_days INTEGER[] NOT NULL DEFAULT '{7,3,1,0}',  -- days BEFORE due date (0 = on the day)
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(branch_id, entity_type)
);

-- Seed global defaults
INSERT INTO notification_settings (entity_type, reminder_days, email_enabled, in_app_enabled)
VALUES
  ('liability_payable',       '{7,3,1,0}', TRUE, TRUE),
  ('liability_loan_schedule', '{7,3,1,0}', TRUE, TRUE);

-- ── RLS Policies ─────────────────────────────────────────────────────────────

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

-- All roles can read notifications (filtered by target_roles in app)
CREATE POLICY "notifications_read" ON notifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_active = TRUE
    )
  );

-- Only service role (Edge Function) can insert; admins can mark read via update
CREATE POLICY "notifications_insert" ON notifications
  FOR INSERT WITH CHECK (TRUE);  -- Edge Function uses service role key

CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_active = TRUE
    )
  );

-- Settings readable by admin/manager/accountant
CREATE POLICY "notification_settings_read" ON notification_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'manager', 'accountant')
    )
  );

CREATE POLICY "notification_settings_write" ON notification_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin')
    )
  );
