-- Branches table (multi-branch ready)
CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    address TEXT,
    phone VARCHAR(20),
    email VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index
CREATE INDEX idx_branches_code ON branches(code);
CREATE INDEX idx_branches_is_active ON branches(is_active);

-- Enable RLS
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

-- Basic RLS policy (admin policy added after users table is created)
CREATE POLICY "Authenticated users can view active branches"
    ON branches FOR SELECT
    TO authenticated
    USING (is_active = TRUE);

-- Insert default branch
INSERT INTO branches (code, name, address)
VALUES ('MAIN', 'SYD Construction Supplies - Main', 'Main Branch Address');
