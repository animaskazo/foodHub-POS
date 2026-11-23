// Credenciales de terceros por organización. Solo para Edge Functions (service role).
//
// Fuente: tabla privada `organization_secrets`. Mientras existan las columnas
// heredadas en `organizations` (antes de 20261124100100_drop_org_secret_columns),
// se usan como respaldo campo por campo, así el despliegue no depende del orden.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any

export interface OrgSecrets {
  klap_api_key: string | null
  uber_client_id: string | null
  uber_client_secret: string | null
  uber_customer_id: string | null
}

const FIELDS = 'klap_api_key, uber_client_id, uber_client_secret, uber_customer_id'
const EMPTY: OrgSecrets = { klap_api_key: null, uber_client_id: null, uber_client_secret: null, uber_customer_id: null }

const clean = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export async function getOrgSecrets(supabase: SupabaseClient, organizationId: string): Promise<OrgSecrets> {
  const result: OrgSecrets = { ...EMPTY }

  const { data: secrets } = await supabase
    .from('organization_secrets')
    .select(FIELDS)
    .eq('organization_id', organizationId)
    .maybeSingle()

  for (const key of Object.keys(EMPTY) as (keyof OrgSecrets)[]) {
    result[key] = clean(secrets?.[key])
  }

  if (Object.values(result).every((v) => v !== null)) return result

  // Respaldo heredado: falla en silencio cuando las columnas ya no existen.
  const { data: legacy, error } = await supabase
    .from('organizations')
    .select(FIELDS)
    .eq('id', organizationId)
    .maybeSingle()

  if (!error && legacy) {
    for (const key of Object.keys(EMPTY) as (keyof OrgSecrets)[]) {
      result[key] = result[key] ?? clean(legacy[key])
    }
  }
  return result
}
