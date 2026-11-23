-- ============================================================
-- Fase 1 de seguridad · Paso 2/2: eliminar las credenciales de `organizations`.
--
-- ⚠ Aplicar SOLO después de:
--   1. Desplegar las Edge Functions nuevas (uber-direct-proxy, klap-*).
--   2. Aplicar 20261124100000_organization_secrets.sql.
--   3. Desplegar el frontend nuevo y probar un pedido con Uber y un pago Klap.
-- ============================================================

-- Por si alguien guardó credenciales con el frontend viejo después del paso 1.
INSERT INTO organization_secrets (organization_id, klap_api_key, uber_client_id, uber_client_secret, uber_customer_id)
SELECT id, NULLIF(klap_api_key, ''), NULLIF(uber_client_id, ''), NULLIF(uber_client_secret, ''), NULLIF(uber_customer_id, '')
FROM organizations
WHERE COALESCE(klap_api_key, uber_client_id, uber_client_secret, uber_customer_id) IS NOT NULL
ON CONFLICT (organization_id) DO UPDATE SET
  klap_api_key       = COALESCE(organization_secrets.klap_api_key,       EXCLUDED.klap_api_key),
  uber_client_id     = COALESCE(organization_secrets.uber_client_id,     EXCLUDED.uber_client_id),
  uber_client_secret = COALESCE(organization_secrets.uber_client_secret, EXCLUDED.uber_client_secret),
  uber_customer_id   = COALESCE(organization_secrets.uber_customer_id,   EXCLUDED.uber_customer_id);

ALTER TABLE organizations
  DROP COLUMN IF EXISTS klap_api_key,
  DROP COLUMN IF EXISTS uber_client_id,
  DROP COLUMN IF EXISTS uber_client_secret,
  DROP COLUMN IF EXISTS uber_customer_id;
