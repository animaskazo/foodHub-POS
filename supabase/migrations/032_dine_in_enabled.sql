-- Add dine_in_enabled feature toggle to organizations
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS dine_in_enabled BOOLEAN DEFAULT false;
