-- Añadir campos de delivery a organizations
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS store_lat NUMERIC,
ADD COLUMN IF NOT EXISTS store_lng NUMERIC,
ADD COLUMN IF NOT EXISTS delivery_radius_km NUMERIC DEFAULT 5,
ADD COLUMN IF NOT EXISTS delivery_polygon JSONB,
ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS delivery_min_order NUMERIC DEFAULT 0;

-- Añadir campos de delivery a orders
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS delivery_type TEXT DEFAULT 'pickup',
ADD COLUMN IF NOT EXISTS delivery_address TEXT,
ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC DEFAULT 0;
