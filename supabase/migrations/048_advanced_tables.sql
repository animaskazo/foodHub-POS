-- migration 048_advanced_tables.sql

-- 1. Create table_zones
CREATE TABLE IF NOT EXISTS table_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_table_zones_branch_id ON table_zones(branch_id);

ALTER TABLE table_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all operations for all users table_zones" ON table_zones;
CREATE POLICY "Enable all operations for all users table_zones" ON table_zones FOR ALL USING (true) WITH CHECK (true);

-- Add missing policy for restaurant_tables
DROP POLICY IF EXISTS "Enable all operations for all users restaurant_tables" ON restaurant_tables;
CREATE POLICY "Enable all operations for all users restaurant_tables" ON restaurant_tables FOR ALL USING (true) WITH CHECK (true);

-- 2. Modify restaurant_tables
ALTER TABLE restaurant_tables 
  ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES table_zones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pos_x NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pos_y NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS width NUMERIC(8,2) DEFAULT 100,
  ADD COLUMN IF NOT EXISTS height NUMERIC(8,2) DEFAULT 100,
  ADD COLUMN IF NOT EXISTS shape TEXT DEFAULT 'square' CHECK (shape IN ('square', 'round', 'rectangle')),
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'free' CHECK (status IN ('free', 'occupied', 'cleaning', 'reserved')),
  ADD COLUMN IF NOT EXISTS qr_token UUID DEFAULT gen_random_uuid() UNIQUE;

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_zone_id ON restaurant_tables(zone_id);

-- 3. Backfill existing records
UPDATE restaurant_tables SET status = 'free' WHERE status IS NULL;
UPDATE restaurant_tables SET qr_token = gen_random_uuid() WHERE qr_token IS NULL;
