import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, ...params } = await req.json()
    const timeout = TIMEOUTS[action] ?? 15_000

    switch (action) {
      case 'get_access_token': {
        const { client_id, client_secret } = params
        const body = new URLSearchParams({
          client_id,
          client_secret,
          grant_type: 'client_credentials',
          scope: 'eats.deliveries',
        })

        const res = await fetchWithTimeout(
          UBER_AUTH_URL,
          { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
          timeout,
          'get_access_token',
        )

        const data = await res.json()
        if (!res.ok) throw new Error(data.error_description || data.error || 'Auth failed')

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'create_quote': {
        const { customer_id, token, ...quoteData } = params
        const res = await fetchWithTimeout(
          `${UBER_API_BASE}/${customer_id}/delivery_quotes`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(quoteData),
          },
          timeout,
          'create_quote',
        )

        const data = await res.json()
        if (!res.ok) {
          const msg = parseUberError(data)
          console.error('[Edge Uber Quote Error] HTTP', res.status, '|', msg, '| full:', JSON.stringify(data))
          throw new Error(msg)
        }

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'create_delivery': {
        const { customer_id, token, ...deliveryData } = params
        const res = await fetchWithTimeout(
          `${UBER_API_BASE}/${customer_id}/deliveries`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(deliveryData),
          },
          timeout,
          'create_delivery',
        )

        const data = await res.json()
        if (!res.ok) {
          const msg = parseUberError(data)
          console.error('[Edge Uber Delivery Error] HTTP', res.status, '|', msg, '| full:', JSON.stringify(data))
          throw new Error(msg)
        }

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'get_delivery': {
        const { customer_id, token, delivery_id } = params
        const res = await fetchWithTimeout(
          `${UBER_API_BASE}/${customer_id}/deliveries/${delivery_id}`,
          { headers: { Authorization: `Bearer ${token}` } },
          timeout,
          'get_delivery',
        )

        const data = await res.json()
        if (!res.ok) throw new Error(parseUberError(data))

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'cancel_delivery': {
        const { customer_id, token, delivery_id } = params
        const res = await fetchWithTimeout(
          `${UBER_API_BASE}/${customer_id}/deliveries/${delivery_id}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
          timeout,
          'cancel_delivery',
        )

        if (!res.ok) {
          const text = await res.text()
          throw new Error(text || 'Cancel delivery failed')
        }

        let data: Record<string, unknown> = {}
        const text = await res.text()
        if (text) {
          try { data = JSON.parse(text) } catch { data = { status: 'canceled' } }
        }

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'update_delivery': {
        const { customer_id, token, delivery_id, ...updateData } = params
        const res = await fetchWithTimeout(
          `${UBER_API_BASE}/${customer_id}/deliveries/${delivery_id}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(updateData),
          },
          timeout,
          'update_delivery',
        )

        const data = await res.json()
        if (!res.ok) throw new Error(parseUberError(data))

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      default:
        throw new Error(`Unknown action: ${action}`)
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
    )
  }
})

