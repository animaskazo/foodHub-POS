-- ============================================================
-- Eliminar datos de prueba del catálogo (Productos y Categorías)
-- ============================================================

-- Esto eliminará los productos, categorías, variantes y modificadores
-- asociados a la organización de prueba, pero mantendrá la Organización 
-- y la Sucursal intactas para que el sistema siga funcionando.

TRUNCATE products CASCADE;
TRUNCATE categories CASCADE;

-- (Opcional) Reiniciar las secuencias si hubiera (no hay en uuid)
