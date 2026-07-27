-- Add settings column to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

-- Create shifts table
CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'open', -- 'open', 'closed'
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  starting_balance NUMERIC NOT NULL DEFAULT 0,
  ending_balance NUMERIC,
  reported_balance NUMERIC,
  total_sales NUMERIC DEFAULT 0,
  opened_by UUID REFERENCES auth.users(id),
  closed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for shifts
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shifts are viewable by organization users"
ON shifts FOR SELECT
USING (organization_id IN (
    SELECT organization_id FROM staff WHERE id = auth.uid()
));

CREATE POLICY "Shifts can be created by organization admins"
ON shifts FOR INSERT
WITH CHECK (organization_id IN (
    SELECT organization_id FROM staff WHERE id = auth.uid() AND role IN ('owner', 'admin', 'manager')
));

CREATE POLICY "Shifts can be updated by organization admins"
ON shifts FOR UPDATE
USING (organization_id IN (
    SELECT organization_id FROM staff WHERE id = auth.uid() AND role IN ('owner', 'admin', 'manager')
));

