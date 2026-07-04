-- Permitir el acceso temporal a product_images para el desarrollo
CREATE POLICY "dev_public_all_product_images" ON product_images FOR ALL USING (true) WITH CHECK (true);
