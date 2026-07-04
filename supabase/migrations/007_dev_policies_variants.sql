-- ============================================================
-- Políticas temporales de Desarrollo para Variantes
-- ============================================================

CREATE POLICY "dev_public_all_variant_groups" ON variant_groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_public_all_variant_options" ON variant_options FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_public_all_order_item_variants" ON order_item_variants FOR ALL USING (true) WITH CHECK (true);
