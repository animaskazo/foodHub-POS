-- 058: Soporte multi-método de delivery (Pickup / Propio / Uber Direct simultáneos)
-- Fuente de verdad nueva: organizations.delivery_modes (array).
-- Pedidos: orders.delivery_provider distingue propio vs Uber (NULL = pickup).

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS delivery_modes TEXT[] DEFAULT NULL;

UPDATE organizations
SET delivery_modes = ARRAY[COALESCE(delivery_mode, 'own')]
WHERE delivery_modes IS NULL;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_provider TEXT DEFAULT NULL
  CHECK (delivery_provider IS NULL OR delivery_provider IN ('own', 'uber_direct'));

-- Backfill determinista: Uber si tiene uber_delivery_id, propio si es delivery sin Uber
UPDATE orders SET delivery_provider = 'uber_direct'
WHERE delivery_type = 'delivery'
  AND uber_delivery_id IS NOT NULL
  AND delivery_provider IS NULL;

UPDATE orders SET delivery_provider = 'own'
WHERE delivery_type = 'delivery'
  AND delivery_provider IS NULL;

-- pickup queda con delivery_provider NULL

CREATE INDEX IF NOT EXISTS idx_orders_delivery_provider ON orders(delivery_provider);
