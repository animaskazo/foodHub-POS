-- ============================================================
-- Políticas temporales de Desarrollo (Habilitar Escritura)
-- ============================================================
-- Como aún no hemos implementado el Login de usuarios (Supabase Auth), 
-- la base de datos bloquea por seguridad cualquier intento de inserción o 
-- edición desde el anonimato.
-- Este script permite permisos totales a nivel público temporalmente 
-- para poder probar los formularios de creación de productos y categorías.

-- 1. Eliminar las políticas de solo lectura anteriores (si existen)
DROP POLICY IF EXISTS "dev_public_read_orgs" ON organizations;
DROP POLICY IF EXISTS "dev_public_read_branches" ON branches;
DROP POLICY IF EXISTS "dev_public_read_categories" ON categories;
DROP POLICY IF EXISTS "dev_public_read_products" ON products;

-- 2. Crear políticas totales (Lectura y Escritura) para desarrollo
CREATE POLICY "dev_public_all_orgs" ON organizations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_public_all_branches" ON branches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_public_all_categories" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_public_all_products" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_public_all_product_categories" ON product_categories FOR ALL USING (true) WITH CHECK (true);
