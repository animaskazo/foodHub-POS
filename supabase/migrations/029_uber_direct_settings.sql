ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS delivery_mode TEXT DEFAULT 'own',
ADD COLUMN IF NOT EXISTS uber_client_id TEXT,
ADD COLUMN IF NOT EXISTS uber_client_secret TEXT,
ADD COLUMN IF NOT EXISTS uber_customer_id TEXT;
