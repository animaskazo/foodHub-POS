-- Permitir al rol 'cashier' (Vendedor) abrir y cerrar turnos de caja.
-- Antes las policies de INSERT/UPDATE en `shifts` solo permitían a
-- owner/admin/manager, por lo que un vendedor podía ver el estado de caja
-- pero nunca crear el turno; el POS quedaba bloqueado permanentemente.

DROP POLICY IF EXISTS "Shifts can be created by organization admins" ON shifts;

CREATE POLICY "Shifts can be created by organization staff"
ON shifts FOR INSERT
WITH CHECK (organization_id IN (
    SELECT organization_id FROM staff
    WHERE id = auth.uid() AND role IN ('owner', 'admin', 'manager', 'cashier')
));

DROP POLICY IF EXISTS "Shifts can be updated by organization admins" ON shifts;

CREATE POLICY "Shifts can be updated by organization staff"
ON shifts FOR UPDATE
USING (organization_id IN (
    SELECT organization_id FROM staff
    WHERE id = auth.uid() AND role IN ('owner', 'admin', 'manager', 'cashier')
));
