-- Create custom enum types
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'cashier', 'inventory_staff', 'accountant');
CREATE TYPE customer_type AS ENUM ('cash', 'credit', 'wholesale', 'retail');
CREATE TYPE delivery_type AS ENUM ('pickup', 'delivery');
CREATE TYPE payment_method AS ENUM ('cash', 'gcash', 'maya', 'bank_transfer', 'credit');
CREATE TYPE payment_status AS ENUM ('unpaid', 'partial', 'paid');
CREATE TYPE po_status AS ENUM ('draft', 'sent', 'confirmed', 'partially_received', 'received', 'cancelled');
CREATE TYPE movement_type AS ENUM ('purchase', 'sale', 'adjustment', 'return', 'transfer');
CREATE TYPE transaction_type AS ENUM ('sale', 'return');
