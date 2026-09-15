import { supabase } from '../lib/supabase';
import { getAccessToken, createQuote, createDeliveryWithRetry } from '../services/uberDirectService';
import { geocodeAddress } from './geo';

const normalizePhone = (phone) => {
  if (!phone) return '';
  let n = (phone || '').replace(/^0+/, '').replace(/[^\d+]/g, '');
  if (n.startsWith('+')) return n;
  if (n.startsWith('56')) return `+${n}`;
  return `+56${n}`;
};

/**
 * Prepara todos los datos necesarios para cotizar/crear un delivery de Uber.
 * Lanza errores; el llamador los captura.
 */
const prepareUberDelivery = async (orderId, organizationId, allowEmergency = false) => {
  // 1. Obtener la orden
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (orderError || !order) throw new Error('No se encontró la orden');
  if (order.uber_delivery_id) throw new Error('La orden ya tiene un delivery asignado');

  // 2. Obtener datos de la organización
  const { data: orgData, error: orgError } = await supabase
    .from('organizations')
    .select(`
      id, name, address, phone,
      store_lat, store_lng,
      uber_client_id, uber_client_secret, uber_customer_id,
      delivery_mode, uber_enabled
    `)
    .eq('id', organizationId)
    .single();

  if (orgError || !orgData) throw new Error('No se encontraron credenciales de la organización');

  const hasUberCreds = orgData.uber_client_id && orgData.uber_client_secret && orgData.uber_customer_id;
  if (allowEmergency) {
    if (!hasUberCreds) throw new Error('No hay credenciales de Uber Direct configuradas para esta organización');
  } else {
    if (orgData.delivery_mode !== 'uber_direct' || !orgData.uber_enabled) {
      throw new Error('Uber Direct no está habilitado para esta organización');
    }
  }

  // 3. Obtener items del pedido
  const { data: orderItems, error: itemsError } = await supabase
    .from('order_items')
    .select('id, product_name, quantity, unit_price')
    .eq('order_id', orderId);

  if (itemsError) throw itemsError;

  // 4. Obtener token
  const tokenRes = await getAccessToken(orgData.uber_client_id, orgData.uber_client_secret);
  const token = tokenRes.access_token;

  // ── Geocodificar pickup (local) ───────────────────────────────────────
  let pickupLat = orgData.store_lat;
  let pickupLng = orgData.store_lng;
  if (!pickupLat || !pickupLng) {
    console.log('[Uber Retry] Geocodificando dirección del local...');
    const pickupCoords = await geocodeAddress((orgData.address || '') + ', Chile');
    if (pickupCoords) { pickupLat = pickupCoords.lat; pickupLng = pickupCoords.lng; }
  }

  // ── Geocodificar dropoff (cliente) ────────────────────────────────────
  console.log('[Uber Retry] Geocodificando dirección del cliente...');
  const dropoffCoords = await geocodeAddress(order.delivery_address);
  const dropoffLat = dropoffCoords?.lat ?? null;
  const dropoffLng = dropoffCoords?.lng ?? null;

  const city  = dropoffCoords?.address?.city ||
                dropoffCoords?.address?.town ||
                dropoffCoords?.address?.village ||
                dropoffCoords?.address?.county ||
                'Santiago';
  const state = dropoffCoords?.address?.state || 'RM';
  const zip   = dropoffCoords?.address?.postcode || '';

  const pickupAddr = {
    street_address: [orgData.address || 'Dirección del local'],
    state,
    city,
    zip_code: zip,
    country: 'CL',
  };

  const dropoffAddr = {
    street_address: [order.delivery_address],
    state,
    city,
    zip_code: zip,
    country: 'CL',
  };

  const manifestItems = (orderItems || []).map(item => ({
    name: item.product_name || 'Producto',
    quantity: item.quantity || 1,
    value: item.unit_price || 0,
  }));

  const quoteParams = {
    external_store_id: orgData.id,
    pickup_address: JSON.stringify(pickupAddr),
    dropoff_address: JSON.stringify(dropoffAddr),
    pickup_latitude: pickupLat,
    pickup_longitude: pickupLng,
    dropoff_latitude: dropoffLat,
    dropoff_longitude: dropoffLng,
    pickup_phone_number: normalizePhone(orgData.phone),
    dropoff_phone_number: normalizePhone(order.customer_phone),
    dropoff_notes: order.delivery_notes || '',
    manifest_items: manifestItems,
  };

  const baseDeliveryData = {
    external_store_id: orgData.id,
    pickup_address: JSON.stringify(pickupAddr),
    pickup_name: orgData.name,
    pickup_phone_number: normalizePhone(orgData.phone),
    pickup_latitude: pickupLat,
    pickup_longitude: pickupLng,
    dropoff_address: JSON.stringify(dropoffAddr),
    dropoff_name: order.customer_name || 'Cliente',
    dropoff_phone_number: normalizePhone(order.customer_phone),
    dropoff_latitude: dropoffLat,
    dropoff_longitude: dropoffLng,
    dropoff_notes: order.delivery_notes || '',
    manifest_items: manifestItems,
  };

  return { order, orderId, organizationId, uberCustomerId: orgData.uber_customer_id, token, quoteParams, baseDeliveryData };
};

/**
 * Actualiza la orden con los datos del delivery (y reajusta delivery_fee/total
 * con la tarifa real de Uber, consistente con el flujo público).
 */
const updateOrderWithDelivery = async (order, delivery) => {
  const deliveryFee = delivery?.fee
    ? (((delivery.currency_type || delivery.currency) || '').toUpperCase() === 'CLP' ? Math.round(delivery.fee / 100) : delivery.fee / 100)
    : 0;

  const updateData = {
    uber_delivery_id: delivery.id,
    uber_tracking_url: delivery.tracking_url,
    uber_status: delivery.status,
  };

  if (deliveryFee > 0 && typeof order.total === 'number') {
    updateData.delivery_fee = deliveryFee;
    updateData.total = Math.round((order.total || 0) - (order.delivery_fee || 0) + deliveryFee);
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update(updateData)
    .eq('id', order.id);

  if (updateError) throw updateError;
};

/**
 * Reintenta crear un delivery en Uber Direct para una orden fallida (flujo estándar).
 * Retorna { success, message, deliveryId }
 */
export const retryFailedUberDelivery = async (orderId, organizationId, options = {}) => {
  const { allowEmergency = false } = options;
  try {
    const prepared = await prepareUberDelivery(orderId, organizationId, allowEmergency);

    console.log('[Retry Uber] Creando delivery con reintentos y quote fresco por intento...');
    const delivery = await createDeliveryWithRetry(
      prepared.uberCustomerId,
      prepared.token,
      async (attempt) => {
        console.log(`[Retry Uber] Obteniendo quote fresco (intento ${attempt})...`);
        const freshQuote = await createQuote(prepared.uberCustomerId, prepared.token, prepared.quoteParams);
        return { quote_id: freshQuote.id, ...prepared.baseDeliveryData };
      },
      3,
    );

    await updateOrderWithDelivery(prepared.order, delivery);

    return { 
      success: true, 
      message: `✅ Delivery asignado: ${delivery.id}`,
      deliveryId: delivery.id,
      delivery
    };
  } catch (error) {
    console.error('[Retry Uber Error]:', error);
    return {
      success: false,
      message: error.message || 'No se pudo asignar el repartidor Uber',
    };
  }
};

/**
 * Solicitud de emergencia — PASO 1: cotizar (sin crear el delivery).
 * Retorna { success, orderId, organizationId, prepared, quote } o { success: false, message }
 */
export const quoteUberDelivery = async (orderId, organizationId, options = {}) => {
  const { allowEmergency = false } = options;
  try {
    const prepared = await prepareUberDelivery(orderId, organizationId, allowEmergency);

    console.log('[Quote Uber] Solicitando cotización en Uber Direct...');
    const quote = await createQuote(prepared.uberCustomerId, prepared.token, prepared.quoteParams);

    return {
      success: true,
      orderId,
      organizationId,
      prepared,
      quote,
    };
  } catch (error) {
    console.error('[Quote Uber Error]:', error);
    return {
      success: false,
      message: error.message || 'No se pudo cotizar el despacho con Uber',
    };
  }
};

/**
 * Solicitud de emergencia — PASO 2: confirmar la cotización.
 * Usa un quote fresco (el quote expira en ~60s) y crea el delivery.
 * Retorna { success, message, deliveryId, delivery } o { success: false, message }
 */
export const confirmUberQuote = async (orderId, organizationId, prepared) => {
  if (!prepared) {
    return { success: false, message: 'No hay una cotización previa, vuelve a cotizar el despacho.' };
  }
  try {
    console.log('[Confirm Uber] Creando delivery con quote fresco...');
    const freshQuote = await createQuote(prepared.uberCustomerId, prepared.token, prepared.quoteParams);

    const delivery = await createDeliveryWithRetry(
      prepared.uberCustomerId,
      prepared.token,
      async () => ({ quote_id: freshQuote.id, ...prepared.baseDeliveryData }),
      1,
    );

    await updateOrderWithDelivery(prepared.order, delivery);

    return {
      success: true,
      message: `✅ Delivery asignado: ${delivery.id}`,
      deliveryId: delivery.id,
      delivery
    };
  } catch (error) {
    console.error('[Confirm Uber Error]:', error);
    return {
      success: false,
      message: error.message || 'No se pudo confirmar el despacho con Uber',
    };
  }
};