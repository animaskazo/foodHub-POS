import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const PROXY_FN = `${SUPABASE_URL}/functions/v1/uber-direct-proxy`

// Timeout total para la Edge Function (cubre el tiempo del proxy + Uber API)
const PROXY_TIMEOUT_MS = 30_000

// Las credenciales y el token de Uber viven solo en el servidor (organization_secrets).
// El navegador envía organization_id y, si hay sesión, el JWT del usuario para las
// acciones restringidas (consultar/cancelar despachos, probar credenciales).
async function callProxy(organizationId, action, payload = {}, credentials) {
  if (!organizationId) throw new Error('[Uber Proxy] organizationId es obligatorio')

  const { data: { session } = {} } = await supabase.auth.getSession()
  const bearer = session?.access_token || SUPABASE_ANON_KEY

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS)

  let res
  try {
    res = await fetch(PROXY_FN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${bearer}`,
      },
      body: JSON.stringify({ action, organization_id: organizationId, ...(credentials ? { credentials } : {}), ...payload }),
      signal: controller.signal,
    })
  } catch (fetchErr) {
    if (fetchErr.name === 'AbortError') {
      throw new Error(`[Uber Proxy] Request timed out after ${PROXY_TIMEOUT_MS / 1000}s`)
    }
    throw fetchErr
  } finally {
    clearTimeout(timer)
  }

  const data = await res.json()
  if (!res.ok) {
    // Extraer mensaje legible: puede venir como string o como objeto de Uber
    const raw = data?.error
    const msg = typeof raw === 'string' ? raw : (raw?.message || JSON.stringify(raw) || `Request failed (${res.status})`)
    console.error('[Uber Proxy Error] status:', res.status, 'msg:', msg)
    throw new Error(msg)
  }
  return data
}

// `credentials` ({ client_id, client_secret, customer_id }) es opcional y solo lo
// acepta el servidor para owner/admin: sirve para probar claves antes de guardarlas.

export const testUberCredentials = (organizationId, credentials) =>
  callProxy(organizationId, 'test_credentials', {}, credentials)

export const createQuote = (organizationId, quoteData, credentials) =>
  callProxy(organizationId, 'create_quote', quoteData, credentials)

export const createDelivery = (organizationId, deliveryData, credentials) =>
  callProxy(organizationId, 'create_delivery', deliveryData, credentials)

export const getDelivery = (organizationId, deliveryId, credentials) =>
  callProxy(organizationId, 'get_delivery', { delivery_id: deliveryId }, credentials)

export const cancelDelivery = (organizationId, deliveryId, credentials) =>
  callProxy(organizationId, 'cancel_delivery', { delivery_id: deliveryId }, credentials)

export const updateDeliveryStatus = (organizationId, deliveryId, status, credentials) =>
  callProxy(organizationId, 'update_delivery', { delivery_id: deliveryId, status }, credentials)

// ── Retry wrapper with exponential backoff ──
// `deliveryDataOrFn` puede ser:
//   - Un objeto estático con los datos del delivery
//   - Una función async (attempt: number) => deliveryData
//     Útil para regenerar un quote fresco en cada reintento (el quote expira en ~60s).
//
// Solo interrumpe los reintentos ante errores definitivos (unauthorized, validation).
// Errores de "invalid"/"not found" pueden ser quote expirado → se reintenta con datos frescos.
export const createDeliveryWithRetry = async (
  organizationId,
  deliveryDataOrFn,
  maxRetries = 3
) => {
  let lastError

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Uber Delivery] Attempt ${attempt}/${maxRetries}`)

      // Si es función, la invocamos para obtener datos frescos (nuevo quoteId, etc.)
      const deliveryData = typeof deliveryDataOrFn === 'function'
        ? await deliveryDataOrFn(attempt)
        : deliveryDataOrFn

      const result = await createDelivery(organizationId, deliveryData)
      console.log(`[Uber Delivery] ✅ Success on attempt ${attempt}`)
      return result
    } catch (error) {
      lastError = error
      console.error(`[Uber Delivery] ❌ Attempt ${attempt} failed:`, error.message)

      const errorStr = error.message.toLowerCase()

      // Errores definitivos que nunca se reintentan
      if (errorStr.includes('unauthorized') || errorStr.includes('validation')) {
        console.error(`[Uber Delivery] Auth/Validation error — not retrying`)
        throw error
      }

      // "invalid"/"not found" puede ser quote expirado: sí se reintenta
      // Si deliveryDataOrFn es función, el próximo intento pedirá un quote nuevo.

      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt - 1) * 1000
        console.log(`[Uber Delivery] ⏳ Retrying in ${delayMs}ms...`)
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
  }

  console.error(`[Uber Delivery] ❌ Failed after ${maxRetries} attempts`)
  throw lastError
}

export const TEST_LOCATIONS = {
  pickup: {
    address: { street_address: ['Av. 5 de Abril 050'], state: 'RM', city: 'Maipú', zip_code: '9250000', country: 'CL' },
    lat: -33.5105, lng: -70.7605,
    name: 'Local FoodHub Maipú', phone: '+56912345678',
  },
  dropoff: {
    address: { street_address: ['Av. Pajaritos 1500'], state: 'RM', city: 'Maipú', zip_code: '9250000', country: 'CL' },
    lat: -33.5012, lng: -70.7512,
    name: 'Cliente de Prueba', phone: '+56987654321',
  },
}

const PICKUP = TEST_LOCATIONS.pickup
const DROPOFF = TEST_LOCATIONS.dropoff

export const checkMode = async (organizationId, credentials) => {
  const quoteRes = await createQuote(organizationId, {
    pickup_address: JSON.stringify(PICKUP.address),
    dropoff_address: JSON.stringify(DROPOFF.address),
    pickup_latitude: PICKUP.lat,
    pickup_longitude: PICKUP.lng,
    dropoff_latitude: DROPOFF.lat,
    dropoff_longitude: DROPOFF.lng,
    pickup_phone_number: PICKUP.phone,
    dropoff_phone_number: DROPOFF.phone,
  }, credentials)

  const deliveryRes = await createDelivery(organizationId, {
    quote_id: quoteRes.id,
    pickup_address: JSON.stringify(PICKUP.address),
    pickup_name: PICKUP.name,
    pickup_phone_number: PICKUP.phone,
    pickup_latitude: PICKUP.lat,
    pickup_longitude: PICKUP.lng,
    dropoff_address: JSON.stringify(DROPOFF.address),
    dropoff_name: DROPOFF.name,
    dropoff_phone_number: DROPOFF.phone,
    dropoff_latitude: DROPOFF.lat,
    dropoff_longitude: DROPOFF.lng,
    manifest_items: [{ name: 'Caja de prueba', quantity: 1, weight: 10 }],
  }, credentials)

  const liveMode = deliveryRes.live_mode
  const status = deliveryRes.status
  const deliveryId = deliveryRes.id

  let cancelled = false
  try {
    await cancelDelivery(organizationId, deliveryId, credentials)
    cancelled = true
  } catch {
  }

  return { live_mode: liveMode, status, delivery_id: deliveryId, cancelled }
}
