-- ============================================================
-- Migración 017: Estructura de Paquetes / Combos
-- ============================================================

-- 1. Crear la tabla de Slots (Grupos de elección de un combo)
CREATE TABLE IF NOT EXISTS bundle_slots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  min_selections  INT NOT NULL DEFAULT 1,
  max_selections  INT NOT NULL DEFAULT 1,
  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bundle_slots_bundle_id ON bundle_slots(bundle_id);

-- 2. Crear la tabla de Opciones por Slot
CREATE TABLE IF NOT EXISTS bundle_slot_options (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_slot_id  UUID NOT NULL REFERENCES bundle_slots(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id      UUID REFERENCES variant_options(id) ON DELETE SET NULL,
  price_modifier  NUMERIC(12,2) DEFAULT 0.00,
  is_default      BOOLEAN DEFAULT false,
  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bundle_slot_options_slot_id ON bundle_slot_options(bundle_slot_id);
CREATE INDEX IF NOT EXISTS idx_bundle_slot_options_product_id ON bundle_slot_options(product_id);

-- 3. Modificar order_items para soportar jerarquía de combos
ALTER TABLE order_items 
  ADD COLUMN IF NOT EXISTS parent_item_id UUID REFERENCES order_items(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_order_items_parent_item_id ON order_items(parent_item_id);

-- 4. Habilitar Seguridad a Nivel de Fila (RLS)
ALTER TABLE bundle_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bundle_slot_options ENABLE ROW LEVEL SECURITY;

-- 5. Crear políticas de desarrollo (permisivas para facilitar pruebas en local/dev)
CREATE POLICY "dev_public_all_bundle_slots" ON bundle_slots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_public_all_bundle_slot_options" ON bundle_slot_options FOR ALL USING (true) WITH CHECK (true);
