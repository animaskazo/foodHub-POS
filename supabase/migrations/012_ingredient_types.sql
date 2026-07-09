-- 012_ingredient_types.sql

-- Add columns to distinguish base ingredients from extra options
ALTER TABLE product_ingredients ADD COLUMN IF NOT EXISTS is_base boolean DEFAULT false;
ALTER TABLE product_ingredients ADD COLUMN IF NOT EXISTS is_extra boolean DEFAULT false;

-- Update existing records to be base ingredients by default to preserve current behavior
UPDATE product_ingredients SET is_base = true WHERE is_base = false AND is_extra = false;
