-- ============================================================
-- Migración 024: Migración a Precios Brutos (Gross-First Pricing)
-- ============================================================

BEGIN;

-- Multiplicar base_price en products
UPDATE products
SET 
  base_price = ROUND(base_price * 1.19);

-- Multiplicar price_override en product_branches
UPDATE product_branches
SET 
  price_override = CASE WHEN price_override IS NOT NULL THEN ROUND(price_override * 1.19) ELSE NULL END;

-- Multiplicar price_modifier y cost_modifier en variant_options
UPDATE variant_options
SET 
  price_modifier = ROUND(price_modifier * 1.19),
  cost_modifier = ROUND(cost_modifier * 1.19);

-- Multiplicar price en modifiers (ingredientes extra)
UPDATE modifiers
SET 
  price = ROUND(price * 1.19);

-- Multiplicar price_modifier en bundle_slot_options
UPDATE bundle_slot_options
SET 
  price_modifier = ROUND(price_modifier * 1.19);

COMMIT;
