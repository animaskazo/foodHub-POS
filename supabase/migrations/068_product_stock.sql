-- 068: Stock directo por producto
-- Permite al administrador definir un número de stock en el producto
-- (ej. bebidas, envasados) sin depender de receta/ingredientes.
-- Si stock_quantity es NULL => sin control directo (se usa ingredientes/status).
-- Si track_inventory = true y stock_quantity <= 0 => sin stock (también
-- bloquea solo esa opción cuando el producto va dentro de un combo).

ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity numeric(12,3);
ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold numeric(12,3);

-- track_inventory ya existe en el schema inicial; asegurar default.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'track_inventory'
  ) THEN
    ALTER TABLE products ALTER COLUMN track_inventory SET DEFAULT false;
  ELSE
    ALTER TABLE products ADD COLUMN track_inventory boolean DEFAULT false;
  END IF;
END $$;
