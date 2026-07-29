const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const PROXY_FN = `${SUPABASE_URL}/functions/v1/uber-direct-proxy`

async function callProxy(payload) {
  const res = await fetch(PROXY_FN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  })

  const data = await res.json()
  if (!res.ok) {
    console.error('[Uber Proxy Error] status:', res.status, 'body:', JSON.stringify(data))
    throw new Error(data.error || `Request failed (${res.status})`)
  }
  return data
}

export const getAccessToken = async (clientId, clientSecret) => {
  return callProxy({
    action: 'get_access_token',
    client_id: clientId,
    client_secret: clientSecret,
  })
}

export const createQuote = async (customerId, token, quoteData) => {
  return callProxy({
    action: 'create_quote',
    customer_id: customerId,
    token,
    ...quoteData,
  })
}

export const createDelivery = async (customerId, token, deliveryData) => {
  return callProxy({
    action: 'create_delivery',
    customer_id: customerId,
    token,
    ...deliveryData,
  })
}

export const getDelivery = async (customerId, token, deliveryId) => {
  return callProxy({
    action: 'get_delivery',
    customer_id: customerId,
    token,
    delivery_id: deliveryId,
  })
}

export const cancelDelivery = async (customerId, token, deliveryId) => {
  return callProxy({
    action: 'cancel_delivery',
    customer_id: customerId,
    token,
    delivery_id: deliveryId,
  })
}

export const updateDeliveryStatus = async (customerId, token, deliveryId, status) => {
  return callProxy({
    action: 'update_delivery',
    customer_id: customerId,
    token,
    delivery_id: deliveryId,
    status,
  })
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

export const checkMode = async (customerId, token) => {
  const quoteRes = await createQuote(customerId, token, {
    pickup_address: JSON.stringify(PICKUP.address),
    dropoff_address: JSON.stringify(DROPOFF.address),
    pickup_latitude: PICKUP.lat,
    pickup_longitude: PICKUP.lng,
    dropoff_latitude: DROPOFF.lat,
    dropoff_longitude: DROPOFF.lng,
    pickup_phone_number: PICKUP.phone,
    dropoff_phone_number: DROPOFF.phone,
  })

  const deliveryRes = await createDelivery(customerId, token, {
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
  })

  const liveMode = deliveryRes.live_mode
  const status = deliveryRes.status
  const deliveryId = deliveryRes.id

  let cancelled = false
  try {
    await cancelDelivery(customerId, token, deliveryId)
    cancelled = true
  } catch {
  }

  return { live_mode: liveMode, status, delivery_id: deliveryId, cancelled }
}
