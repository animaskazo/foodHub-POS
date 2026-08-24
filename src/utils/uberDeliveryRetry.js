import { supabase } from '../lib/supabase';
import { getAccessToken, createQuote, createDeliveryWithRetry } from '../services/uberDirectService';
import { geocodeAddress } from './geo';

/**
 * Reintenta crear un delivery en Uber Direct para una orden fallida.
 * Retorna { success, message, deliveryId }
 */
export const retryFailedUberDelivery = async (orderId, organizationId) => {
  try {
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

    if (orgData.delivery_mode !== 'uber_direct' || !orgData.uber_enabled) {
      throw new Error('Uber Direct no está habilitado para esta organización');
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

    const normalizePhone = (phone) => {
      if (!phone) return '';
      let n = (phone || '').replace(/^0+/, '').replace(/[^\d+]/g, '');
      if (n.startsWith('+')) return n;
      if (n.startsWith('56')) return `+${n}`;
      return `+56${n}`;
    };

    // ── Geocodificar pickup (local) ───────────────────────────────────────
    let pickupLat = orgData.store_lat;
    let pickupLng = orgData.store_lng;
    if (!pickupLat || !pickupLng) {
      console.log('[Retry Uber] Geocodificando dirección del local...');
      const pickupCoords = await geocodeAddress((orgData.address || '') + ', Chile');
      if (pickupCoords) { pickupLat = pickupCoords.lat; pickupLng = pickupCoords.lng; }
    }

    // ── Geocodificar dropoff (cliente) ────────────────────────────────────
    console.log('[Retry Uber] Geocodificando dirección del cliente...');
    const dropoffCoords = await geocodeAddress(order.delivery_address);
    const dropoffLat = dropoffCoords?.lat ?? null;
    const dropoffLng = dropoffCoords?.lng ?? null;

    // Extraer ciudad/estado de la geocodificación, con fallback a RM/Santiago
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

    console.log('[Retry Uber] Creando delivery con reintentos y quote fresco por intento...');

    const delivery = await createDeliveryWithRetry(
      orgData.uber_customer_id,
      token,
      async (attempt) => {
        console.log(`[Retry Uber] Obteniendo quote fresco (intento ${attempt})...`);
        const freshQuote = await createQuote(orgData.uber_customer_id, token, quoteParams);
        return { quote_id: freshQuote.id, ...baseDeliveryData };
      },
      3,
    );

    // 5. Actualizar orden con datos de delivery
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        uber_delivery_id: delivery.id,
        uber_tracking_url: delivery.tracking_url,
        uber_status: delivery.status,
      })
      .eq('id', order.id);

    if (updateError) throw updateError;

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
