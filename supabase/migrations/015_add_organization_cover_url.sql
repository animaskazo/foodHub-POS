-- Add description, business_hours and cover_url to organizations table
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS business_hours JSONB;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cover_url TEXT;
