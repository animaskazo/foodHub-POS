import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getAccessToken, createQuote, createDeliveryWithRetry } from '../services/uberDirectService';
import { geocodeAddress } from '../utils/geo';
import { RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

/**
 * Admin Tool: Retry Failed Uber Deliveries
 * 
 * Permite reintentar la creación de deliveries de Uber que fallaron durante
 * la creación del pedido. El pedido existe pero sin uber_delivery_id.
 */
export const RetryUberDeliveryAdmin = ({ organizationId, branchId }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(null);
  const [results, setResults] = useState({});

  // Fetch orders Uber sin uber_delivery_id (con fallback pre-migración 058)
  useEffect(() => {
    const fetchFailedOrders = async () => {
      setLoading(true);
      try {
        const cols = `
            id,
            order_number,
            status,
            customer_name,
            customer_phone,
            delivery_address,
            delivery_notes,
            delivery_fee,
            delivery_provider,
            total,
            created_at,
            organization_id,
            branch_id
          `;
        const colsLegacy = cols.replace('delivery_provider,', '');
        const baseQuery = (selectCols, onlyUber) => {
          let q = supabase
            .from('orders')
            .select(selectCols)
            .eq('organization_id', organizationId)
            .eq('branch_id', branchId)
            .eq('delivery_type', 'delivery')
            .is('uber_delivery_id', null)
            .order('created_at', { ascending: false })
            .limit(20);
          if (onlyUber) q = q.eq('delivery_provider', 'uber_direct');
          return q;
        };

        let { data, error } = await baseQuery(cols, true);
        if (error && (error?.code === 'PGRST204' || /delivery_provider/i.test(error?.message || ''))) {
          // Pre-migración: sin columna delivery_provider, listar como antes
          const legacy = await baseQuery(colsLegacy, false);
          data = legacy.data;
          error = legacy.error;
        }
        if (error) throw error;
        // Belt-and-braces: excluir delivery propio si el filtro no aplicó
        setOrders((data || []).filter(o => !o.delivery_provider || o.delivery_provider === 'uber_direct'));
      } catch (err) {
        console.error('Error fetching failed orders:', err);
      } finally {
        setLoading(false);
      }
    };

    if (organizationId && branchId) {
      fetchFailedOrders();
    }
  }, [organizationId, branchId]);

  const retryDelivery = async (order) => {
    setRetrying(order.id);
    try {
      // Obtener datos de la organización (con fallback pre-migración 058)
      const ORG_RETRY_SELECT = `
          id, name, address, phone,
          store_lat, store_lng,
          uber_client_id, uber_client_secret, uber_customer_id,
          delivery_mode, delivery_modes, uber_enabled
        `;
      let orgData = null;
      {
        const first = await supabase
          .from('organizations')
          .select(ORG_RETRY_SELECT)
          .eq('id', organizationId)
          .single();
        if (first.error && (first.error?.code === 'PGRST204' || /delivery_modes/i.test(first.error?.message || ''))) {
          const legacy = await supabase
            .from('organizations')
            .select(ORG_RETRY_SELECT.replace(', delivery_modes,', ','))
            .eq('id', organizationId)
            .single();
          if (legacy.error || !legacy.data) throw new Error('No se encontraron credenciales de la organización');
          orgData = legacy.data;
        } else {
          if (first.error || !first.data) throw new Error('No se encontraron credenciales de la organización');
          orgData = first.data;
        }
      }

      const orgModes = Array.isArray(orgData.delivery_modes)
        ? orgData.delivery_modes
        : [orgData.delivery_mode || 'own'];
      // Triple modo: basta con que Uber esté habilitado y la orden sea Uber.
      // (La orden ya viene filtrada por delivery_provider='uber_direct'.)
      if (!orgData.uber_enabled || !orgModes.includes('uber_direct')) {
        throw new Error('Uber Direct no está habilitado para esta organización');
      }

      // Obtener items del pedido
      const { data: orderItems, error: itemsError } = await supabase
        .from('order_items')
        .select('id, product_name, quantity, unit_price')
        .eq('order_id', order.id);

      if (itemsError) throw itemsError;

      // Obtener token
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
        console.log('[Retry] Geocodificando dirección del local...');
        const pickupCoords = await geocodeAddress((orgData.address || '') + ', Chile');
        if (pickupCoords) { pickupLat = pickupCoords.lat; pickupLng = pickupCoords.lng; }
      }

      // ── Geocodificar dropoff (cliente) ────────────────────────────────────
      console.log('[Retry] Geocodificando dirección del cliente...');
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

      console.log('[Retry] Creando delivery con reintentos y quote fresco por intento...');

      // Cada reintento obtiene un quote nuevo (el anterior puede expirar en segundos)
      const delivery = await createDeliveryWithRetry(
        orgData.uber_customer_id,
        token,
        async (attempt) => {
          console.log(`[Retry] Obteniendo quote fresco (intento ${attempt})...`);
          const freshQuote = await createQuote(orgData.uber_customer_id, token, quoteParams);
          return { quote_id: freshQuote.id, ...baseDeliveryData };
        },
        3,
      );

      // Actualizar orden con datos de delivery
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          uber_delivery_id: delivery.id,
          uber_tracking_url: delivery.tracking_url,
          uber_status: delivery.status,
        })
        .eq('id', order.id);

      if (updateError) throw updateError;

      setResults(prev => ({
        ...prev,
        [order.id]: {
          success: true,
          message: `✅ Delivery creado: ${delivery.id}`,
          deliveryId: delivery.id,
        },
      }));

      // Quitar de la lista
      setOrders(prev => prev.filter(o => o.id !== order.id));
    } catch (error) {
      console.error('[Retry Error]:', error);
      setResults(prev => ({
        ...prev,
        [order.id]: {
          success: false,
          message: `❌ Error: ${error.message || 'No se pudo crear el delivery'}`,
          error: error.message,
        },
      }));
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-6">
        <AlertCircle className="w-5 h-5 text-amber-600" />
        <h2 className="text-lg font-bold text-gray-900">
          Reintentar Entregas Fallidas de Uber
        </h2>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <RefreshCw className="w-6 h-6 text-gray-400 animate-spin mx-auto mb-2" />
          <p className="text-gray-600">Cargando pedidos...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-8 bg-green-50 rounded border border-green-200">
          <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-2" />
          <p className="text-green-700 font-medium">
            ✅ No hay entregas fallidas. Todos los pedidos tienen delivery asignado.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Se encontraron {orders.length} pedidos sin entrega de Uber asignada:
          </p>
          
          {orders.map(order => (
            <div
              key={order.id}
              className="bg-gray-50 border border-gray-200 rounded p-4"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-semibold text-gray-900">
                    Pedido {order.order_number}
                  </p>
                  <p className="text-sm text-gray-600">
                    {order.customer_name} • {order.customer_phone}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    📍 {order.delivery_address}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(order.created_at).toLocaleString('es-CL')}
                  </p>
                </div>
                
                <button
                  onClick={() => retryDelivery(order)}
                  disabled={retrying === order.id}
                  className="px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white rounded text-sm font-medium flex items-center gap-2 transition-colors"
                >
                  {retrying === order.id ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Reintentando...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Reintentar
                    </>
                  )}
                </button>
              </div>

              {results[order.id] && (
                <div
                  className={`mt-3 p-3 rounded text-sm ${
                    results[order.id].success
                      ? 'bg-green-100 border border-green-300 text-green-800'
                      : 'bg-red-100 border border-red-300 text-red-800'
                  }`}
                >
                  {results[order.id].message}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RetryUberDeliveryAdmin;
