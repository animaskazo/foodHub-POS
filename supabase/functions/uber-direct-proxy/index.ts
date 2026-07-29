import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UBER_AUTH_URL = 'https://auth.uber.com/oauth/v2/token'
const UBER_API_BASE = 'https://api.uber.com/v1/customers'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, ...params } = await req.json()

    switch (action) {
      case 'get_access_token': {
        const { client_id, client_secret } = params
        const body = new URLSearchParams({
          client_id,
          client_secret,
          grant_type: 'client_credentials',
          scope: 'eats.deliveries',
        })

        const res = await fetch(UBER_AUTH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        })

        const data = await res.json()
        if (!res.ok) throw new Error(data.error_description || data.error || 'Auth failed')

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'create_quote': {
        const { customer_id, token, ...quoteData } = params
        const res = await fetch(`${UBER_API_BASE}/${customer_id}/delivery_quotes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(quoteData),
        })

        const data = await res.json()
        if (!res.ok) throw new Error(data.message || data.error || 'Create quote failed')

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'create_delivery': {
        const { customer_id, token, ...deliveryData } = params
        const res = await fetch(`${UBER_API_BASE}/${customer_id}/deliveries`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(deliveryData),
        })

        const data = await res.json()
        if (!res.ok) throw new Error(data.message || data.error || 'Create delivery failed')

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'get_delivery': {
        const { customer_id, token, delivery_id } = params
        const res = await fetch(`${UBER_API_BASE}/${customer_id}/deliveries/${delivery_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        const data = await res.json()
        if (!res.ok) throw new Error(data.message || data.error || 'Get delivery failed')

        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'cancel_delivery': {
        const { customer_id, token, delivery_id } = params
        const res = await fetch(`${UBER_API_BASE}/${customer_id}/deliveries/${delivery_id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!res.ok) {
          const text = await res.text()
          throw new Error(text || 'Cancel delivery failed')
        }

        let data = {}
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
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15000)
        try {
          const res = await fetch(`${UBER_API_BASE}/${customer_id}/deliveries/${delivery_id}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(updateData),
            signal: controller.signal,
          })
          clearTimeout(timeout)
          const data = await res.json()
          if (!res.ok) throw new Error(data.message || data.error || `Update delivery failed (${res.status})`)
          return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        } catch (fetchErr) {
          clearTimeout(timeout)
          if (fetchErr.name === 'AbortError') throw new Error('Uber API timeout after 15s')
          throw fetchErr
        }
      }

      default:
        throw new Error(`Unknown action: ${action}`)
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
