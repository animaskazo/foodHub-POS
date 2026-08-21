-- Agregar campo para API key de Klap por organización
-- NULL = usa la key global (KLAP_API_KEY env var)
-- Con valor = usa la key propia de la organización
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS klap_api_key TEXT;
