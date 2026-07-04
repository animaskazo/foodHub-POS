-- ============================================================
-- Super Admins Table
-- ============================================================
-- Esta tabla almacena los IDs de los usuarios que son super administradores.
-- El acceso a la vista /superadmin estará restringido a quienes estén aquí.

CREATE TABLE IF NOT EXISTS super_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Política de desarrollo para que el frontend pueda leer esta tabla sin RLS estricto
DROP POLICY IF EXISTS "dev_public_read_super_admins" ON super_admins;
CREATE POLICY "dev_public_read_super_admins" ON super_admins FOR SELECT USING (true);
