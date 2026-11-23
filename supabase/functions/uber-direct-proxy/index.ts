import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"
import { getOrgSecrets } from "../_shared/orgSecrets.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UBER_AUTH_URL = 'https://auth.uber.com/oauth/v2/token'
const UBER_API_BASE = 'https://api.uber.com/v1/customers'

// Timeouts por operación (en ms). Conservadores pero prácticos.
const TIMEOUTS: Record<string, number> = {
  get_access_token: 10_000,
  create_quote:     15_000,
  create_delivery:  20_000,  // puede tardar más (asignación de repartidor)
  get_delivery:     10_000,
  cancel_delivery:  10_000,
  update_delivery:  15_000,
  test_credentials: 15_000,
}

// Permisos por acción cuando se usa `organization_id` (credenciales guardadas):
//  public → checkout anónimo (cotizar y crear el despacho de un pedido)
//  staff  → personal de la organización o super-admin
//  admin  → owner/admin/manager de la organización o super-admin
const ACCESS: Record<string, 'public' | 'staff' | 'admin'> = {
  create_quote: 'public',
  create_delivery: 'public',
  get_delivery: 'staff',
  cancel_delivery: 'staff',
  update_delivery: 'staff',
  test_credentials: 'admin',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

/** Fetch con timeout via AbortController. Lanza error claro si expira. */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`[Uber] ${label} timed out after ${timeoutMs / 1000}s`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Uber Direct puede devolver errores en distintos formatos:
 *   { message }  |  { error }  |  { code, message }  |  { errors: [{ message }] }
 * Esta función extrae siempre un string legible.
 */
function parseUberError(data: Record<string, unknown>): string {
  if (typeof data.message === 'string' && data.message) return data.message
  if (typeof data.error   === 'string' && data.error)   return data.error
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    const first = data.errors[0] as Record<string, unknown>
    if (typeof first.message === 'string') return first.message
  }
  if (data.code) return `Uber error code: ${data.code}`
  return JSON.stringify(data)
}

// ── Autorización ──────────────────────────────────────────────

async function getCallerId(req: Request): Promise<string | null> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return null
  const { data } = await supabase.auth.getUser(jwt)
  return data?.user?.id ?? null
}

async function assertAccess(req: Request, organizationId: string, level: 'public' | 'staff' | 'admin') {
  if (level === 'public') return
  const userId = await getCallerId(req)
  if (!userId) throw new HttpError(401, 'Debes iniciar sesión')

  const { data: superAdmin } = await supabase.from('super_admins').select('user_id').eq('user_id', userId).maybeSingle()
  if (superAdmin) return

  const { data: staff } = await supabase
    .from('staff')
    .select('role')
    .eq('id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!staff) throw new HttpError(403, 'No autorizado para esta organización')
  if (level === 'admin' && !['owner', 'admin', 'manager'].includes(staff.role)) {
    throw new HttpError(403, 'Solo un administrador puede hacer esto')
  }
}

// ── Credenciales y token (nunca salen del servidor) ───────────

interface UberCreds { client_id: string; client_secret: string; customer_id: string }

const tokenCache = new Map<string, { token: string; expiresAt: number }>()

async function fetchAccessToken(clientId: string, clientSecret: string): Promise<{ access_token: string; expires_in?: number }> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: 'eats.deliveries',
  })
  const res = await fetchWithTimeout(
    UBER_AUTH_URL,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
    TIMEOUTS.get_access_token,
    'get_access_token',
  )
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description || data.error || 'Auth failed')
  return data
}

async function getToken(creds: UberCreds): Promise<string> {
  const key = `${creds.client_id}:${creds.customer_id}`
  const cached = tokenCache.get(key)
  if (cached && Date.now() < cached.expiresAt) return cached.token
  const data = await fetchAccessToken(creds.client_id, creds.client_secret)
  tokenCache.set(key, { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000 })
  return data.access_token
}

/**
 * Credenciales guardadas de la organización. Un admin puede sobrescribirlas con
 * `credentials` (p. ej. para probar claves nuevas antes de guardarlas).
 */
async function resolveCreds(organizationId: string, override?: Partial<UberCreds>): Promise<UberCreds> {
  const stored = await getOrgSecrets(supabase, organizationId)
  const creds = {
    client_id: override?.client_id?.trim() || stored.uber_client_id,
    client_secret: override?.client_secret?.trim() || stored.uber_client_secret,
    customer_id: override?.customer_id?.trim() || stored.uber_customer_id,
  }
  if (!creds.client_id || !creds.client_secret || !creds.customer_id) {
    throw new HttpError(400, 'La organización no tiene credenciales de Uber Direct configuradas')
  }
  return creds as UberCreds
}

// ── Llamadas a Uber ───────────────────────────────────────────

async function uberRequest(
  action: string,
  creds: { customer_id: string; token: string },
  path: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const res = await fetchWithTimeout(
    `${UBER_API_BASE}/${creds.customer_id}${path}`,
    {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.token}`, ...(init.headers ?? {}) },
    },
    TIMEOUTS[action] ?? 15_000,
    action,
  )

  const text = await res.text()
  let data: Record<string, unknown> = {}
  if (text) {
    try { data = JSON.parse(text) } catch { data = { message: text } }
  }
  if (!res.ok) {
    const msg = parseUberError(data)
    console.error(`[Edge Uber ${action} Error] HTTP`, res.status, '|', msg)
    throw new Error(msg || `${action} failed`)
  }
  if (action === 'cancel_delivery' && !text) return { status: 'canceled' }
  return data
}

async function runAction(action: string, creds: { customer_id: string; token: string }, params: Record<string, unknown>) {
  const { delivery_id, ...payload } = params
  switch (action) {
    case 'create_quote':
      return uberRequest(action, creds, '/delivery_quotes', { method: 'POST', body: JSON.stringify(payload) })
    case 'create_delivery':
      return uberRequest(action, creds, '/deliveries', { method: 'POST', body: JSON.stringify(payload) })
    case 'get_delivery':
      return uberRequest(action, creds, `/deliveries/${delivery_id}`, { method: 'GET' })
    case 'cancel_delivery':
      return uberRequest(action, creds, `/deliveries/${delivery_id}`, { method: 'DELETE' })
    case 'update_delivery':
      return uberRequest(action, creds, `/deliveries/${delivery_id}`, { method: 'POST', body: JSON.stringify(payload) })
    default:
      throw new HttpError(400, `Unknown action: ${action}`)
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, organization_id, credentials, ...params } = await req.json()

    // ── Modo actual: credenciales resueltas en el servidor ──
    if (organization_id) {
      const level = ACCESS[action]
      if (!level) throw new HttpError(400, `Unknown action: ${action}`)
      // Sobrescribir credenciales guardadas solo lo puede hacer un admin.
      await assertAccess(req, organization_id, credentials ? 'admin' : level)

      const creds = await resolveCreds(organization_id, credentials)
      const token = await getToken(creds)

      if (action === 'test_credentials') {
        return json({ ok: true })
      }
      return json(await runAction(action, { customer_id: creds.customer_id, token }, params))
    }

    // ── Modo heredado (frontend anterior): token/secret enviados por el cliente ──
    // TODO(seguridad): eliminar después de desplegar el frontend nuevo y aplicar
    // 20261124100100_drop_org_secret_columns.sql.
    if (action === 'get_access_token') {
      const { client_id, client_secret } = params as Record<string, string>
      return json(await fetchAccessToken(client_id, client_secret))
    }
    const { customer_id, token, ...rest } = params as Record<string, unknown>
    if (!customer_id || !token) throw new HttpError(400, 'organization_id es obligatorio')
    return json(await runAction(action, { customer_id: String(customer_id), token: String(token) }, rest))
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    const status = error instanceof HttpError ? error.status : 400
    return json({ error: msg }, status)
  }
})
