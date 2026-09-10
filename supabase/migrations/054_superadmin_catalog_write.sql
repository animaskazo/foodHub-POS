-- ============================================================
-- Super Admin: escritura total en catálogo
-- ============================================================
-- Permite al super-admin abrir la interfaz completa de productos
-- (CreateProductView) para CUALQUIER negocio: leer y escribir
-- productos, categorías, ingredientes, variantes, combos y recetas,
-- sin quedar limitado por el tenant (current_org_id()).
--
-- Las políticas son aditivas (OR), así que complementan a las
-- tenant_isolation y a las dev_public_* sin romperlas.

-- Helper reutilizable
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
$$;

-- ── Lectura global (por si las dev policies se retiran) ──
DROP POLICY IF EXISTS "Super admins can view all categories" ON categories;
CREATE POLICY "Super admins can view all categories"
ON categories FOR SELECT USING (is_super_admin());

DROP POLICY IF EXISTS "Super admins can view all product images" ON product_images;
CREATE POLICY "Super admins can view all product images"
ON product_images FOR SELECT USING (is_super_admin());

DROP POLICY IF EXISTS "Super admins can view all product categories" ON product_categories;
CREATE POLICY "Super admins can view all product categories"
ON product_categories FOR SELECT USING (is_super_admin());

DROP POLICY IF EXISTS "Super admins can view all variant groups" ON variant_groups;
CREATE POLICY "Super admins can view all variant groups"
ON variant_groups FOR SELECT USING (is_super_admin());

DROP POLICY IF EXISTS "Super admins can view all variant options" ON variant_options;
CREATE POLICY "Super admins can view all variant options"
ON variant_options FOR SELECT USING (is_super_admin());

DROP POLICY IF EXISTS "Super admins can view all ingredients" ON ingredients;
CREATE POLICY "Super admins can view all ingredients"
ON ingredients FOR SELECT USING (is_super_admin());

DROP POLICY IF EXISTS "Super admins can view all product ingredients" ON product_ingredients;
CREATE POLICY "Super admins can view all product ingredients"
ON product_ingredients FOR SELECT USING (is_super_admin());

DROP POLICY IF EXISTS "Super admins can view all inventory items" ON inventory_items;
CREATE POLICY "Super admins can view all inventory items"
ON inventory_items FOR SELECT USING (is_super_admin());

DROP POLICY IF EXISTS "Super admins can view all product recipes" ON product_recipes;
CREATE POLICY "Super admins can view all product recipes"
ON product_recipes FOR SELECT USING (is_super_admin());

DROP POLICY IF EXISTS "Super admins can view all bundle slots" ON bundle_slots;
CREATE POLICY "Super admins can view all bundle slots"
ON bundle_slots FOR SELECT USING (is_super_admin());

DROP POLICY IF EXISTS "Super admins can view all bundle slot options" ON bundle_slot_options;
CREATE POLICY "Super admins can view all bundle slot options"
ON bundle_slot_options FOR SELECT USING (is_super_admin());

-- ── Escritura global del catálogo ──
DROP POLICY IF EXISTS "Super admins full access products" ON products;
CREATE POLICY "Super admins full access products"
ON products FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Super admins full access categories" ON categories;
CREATE POLICY "Super admins full access categories"
ON categories FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Super admins full access product images" ON product_images;
CREATE POLICY "Super admins full access product images"
ON product_images FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Super admins full access product categories" ON product_categories;
CREATE POLICY "Super admins full access product categories"
ON product_categories FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Super admins full access variant groups" ON variant_groups;
CREATE POLICY "Super admins full access variant groups"
ON variant_groups FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Super admins full access variant options" ON variant_options;
CREATE POLICY "Super admins full access variant options"
ON variant_options FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Super admins full access ingredients" ON ingredients;
CREATE POLICY "Super admins full access ingredients"
ON ingredients FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Super admins full access product ingredients" ON product_ingredients;
CREATE POLICY "Super admins full access product ingredients"
ON product_ingredients FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Super admins full access inventory items" ON inventory_items;
CREATE POLICY "Super admins full access inventory items"
ON inventory_items FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Super admins full access product recipes" ON product_recipes;
CREATE POLICY "Super admins full access product recipes"
ON product_recipes FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Super admins full access bundle slots" ON bundle_slots;
CREATE POLICY "Super admins full access bundle slots"
ON bundle_slots FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Super admins full access bundle slot options" ON bundle_slot_options;
CREATE POLICY "Super admins full access bundle slot options"
ON bundle_slot_options FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());
