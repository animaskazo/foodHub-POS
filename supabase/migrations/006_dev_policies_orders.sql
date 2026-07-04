-- ============================================================
-- Políticas temporales de Desarrollo (Habilitar Escritura en Órdenes)
-- ============================================================
-- Permite acceso total para desarrollo a las tablas relacionadas con transacciones

CREATE POLICY "dev_public_all_orders" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_public_all_order_items" ON order_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_public_all_payments" ON payments FOR ALL USING (true) WITH CHECK (true);
