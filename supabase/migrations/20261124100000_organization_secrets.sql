-- ============================================================
-- Fase 1 de seguridad · Paso 1/2: mover credenciales de terceros
-- fuera de `organizations` (legible públicamente) a una tabla privada.
--
-- Este script NO borra nada: copia las credenciales y deja las columnas
-- viejas intactas para que la app actual siga funcionando. Las columnas
-- se eliminan en 20261124100100_drop_org_secret_columns.sql, después de
-- desplegar las Edge Functions y el frontend nuevos.
-- ============================================================

CREATE TABLE IF NOT EXISTS organization_secrets (
  organization_id     UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  klap_api_key        TEXT,
  uber_client_id      TEXT,
  uber_client_secret  TEXT,
  uber_customer_id    TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by          UUID REFERENCES auth.users(id)
);

-- Sin políticas: ningún cliente (anon ni authenticated) puede leer ni escribir.
-- Solo la service role (Edge Functions) y las funciones SECURITY DEFINER de abajo.
ALTER TABLE organization_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON organization_secrets FROM anon, authenticated;

-- Copia inicial desde organizations.
INSERT INTO organization_secrets (organization_id, klap_api_key, uber_client_id, uber_client_secret, uber_customer_id)
SELECT id,
       NULLIF(klap_api_key, ''),
       NULLIF(uber_client_id, ''),
       NULLIF(uber_client_secret, ''),
       NULLIF(uber_customer_id, '')
FROM organizations
WHERE COALESCE(klap_api_key, uber_client_id, uber_client_secret, uber_customer_id) IS NOT NULL
ON CONFLICT (organization_id) DO NOTHING;

-- ¿El usuario actual administra esta organización (owner/admin/manager) o es super-admin?
CREATE OR REPLACE FUNCTION can_manage_org_secrets(p_organization_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
      OR EXISTS (
           SELECT 1 FROM staff
           WHERE id = auth.uid()
             AND organization_id = p_organization_id
             AND role IN ('owner', 'admin', 'manager')
         );
$$;

-- Estado de las integraciones, sin exponer valores. Para pantallas de ajustes.
CREATE OR REPLACE FUNCTION get_org_secrets_status(p_organization_id UUID)
RETURNS TABLE (
  has_klap_api_key   boolean,
  has_uber_credentials boolean,
  uber_client_id_hint  text,
  uber_customer_id_hint text,
  updated_at         timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT can_manage_org_secrets(p_organization_id) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.klap_api_key IS NOT NULL,
         (s.uber_client_id IS NOT NULL AND s.uber_client_secret IS NOT NULL AND s.uber_customer_id IS NOT NULL),
         CASE WHEN s.uber_client_id IS NULL THEN NULL ELSE '••••' || RIGHT(s.uber_client_id, 4) END,
         CASE WHEN s.uber_customer_id IS NULL THEN NULL ELSE '••••' || RIGHT(s.uber_customer_id, 4) END,
         s.updated_at
  FROM (SELECT 1) AS one
  LEFT JOIN organization_secrets s ON s.organization_id = p_organization_id;
END;
$$;

-- Guarda credenciales. Semántica por parámetro:
--   NULL  → no cambia el valor guardado
--   ''    → borra el valor guardado
--   texto → reemplaza el valor guardado
CREATE OR REPLACE FUNCTION set_org_secrets(
  p_organization_id    UUID,
  p_klap_api_key       TEXT DEFAULT NULL,
  p_uber_client_id     TEXT DEFAULT NULL,
  p_uber_client_secret TEXT DEFAULT NULL,
  p_uber_customer_id   TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT can_manage_org_secrets(p_organization_id) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  INSERT INTO organization_secrets (organization_id) VALUES (p_organization_id)
  ON CONFLICT (organization_id) DO NOTHING;

  UPDATE organization_secrets SET
    klap_api_key       = CASE WHEN p_klap_api_key       IS NULL THEN klap_api_key       ELSE NULLIF(TRIM(p_klap_api_key), '') END,
    uber_client_id     = CASE WHEN p_uber_client_id     IS NULL THEN uber_client_id     ELSE NULLIF(TRIM(p_uber_client_id), '') END,
    uber_client_secret = CASE WHEN p_uber_client_secret IS NULL THEN uber_client_secret ELSE NULLIF(TRIM(p_uber_client_secret), '') END,
    uber_customer_id   = CASE WHEN p_uber_customer_id   IS NULL THEN uber_customer_id   ELSE NULLIF(TRIM(p_uber_customer_id), '') END,
    updated_at = NOW(),
    updated_by = auth.uid()
  WHERE organization_id = p_organization_id;
END;
$$;

REVOKE ALL ON FUNCTION can_manage_org_secrets(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_org_secrets_status(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION set_org_secrets(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION can_manage_org_secrets(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_org_secrets_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION set_org_secrets(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
