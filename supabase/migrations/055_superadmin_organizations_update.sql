-- ============================================================
-- 055_superadmin_organizations_update.sql
-- Permite a los super administradores actualizar cualquier
-- organización (horarios, perfil, integraciones, etc.).
-- Sin esta policy, el tab "Horarios" del SuperAdminView falla
-- con error RLS en entornos sin la policy dev abierta.
-- ============================================================

DROP POLICY IF EXISTS "Super admins can update organizations" ON organizations;

CREATE POLICY "Super admins can update organizations"
ON organizations
FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);
