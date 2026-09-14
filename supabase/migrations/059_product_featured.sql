-- 059: Producto destacado
-- Agrega columna is_featured para marcar productos destacados con icono especial.

ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false;
