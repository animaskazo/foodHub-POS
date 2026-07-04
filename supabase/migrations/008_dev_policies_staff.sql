-- ============================================================
-- Políticas temporales de Desarrollo (Staff)
-- ============================================================
-- Permite insertar, actualizar y leer de la tabla de staff.
-- IMPORTANTE: Esto es solo para la fase de desarrollo para permitir
-- que el Signup desde el Frontend pueda registrar organizaciones y usuarios.

DROP POLICY IF EXISTS "dev_public_read_staff" ON staff;
DROP POLICY IF EXISTS "dev_public_all_staff" ON staff;
CREATE POLICY "dev_public_all_staff" ON staff FOR ALL USING (true) WITH CHECK (true);
