import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getAccessToken, createDeliveryWithRetry } from '../services/uberDirectService';
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

  // Fetch orders sin uber_delivery_id pero con delivery_type='delivery'
  useEffect(() => {
    const fetchFailedOrders = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('orders')
          .select(`
            id,
            order_number,
            status,
            customer_name,
            customer_phone,
            delivery_address,
            delivery_notes,
            delivery_fee,
            total,
            created_at,
            organization_id,
            branch_id
          `)
          .eq('organization_id', organizationId)
          .eq('branch_id', branchId)
          .eq('delivery_type', 'delivery')
          .is('uber_delivery_id', null)
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) throw error;
        setOrders(data || []);
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
      // Obtener datos de la organización
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

      // Validar que Uber está habilitado
      if (orgData.delivery_mode !== 'uber_direct' || !orgData.uber_enabled) {
        throw new Error('Uber Direct no está habilitado para esta organización');
      }

      // Obtener items del pedido
      const { data: orderItems, error: itemsError } = await supabase
        .from('order_items')
        .select('id, product_name, quantity, unit_price')
        .eq('order_id', order.id);

      if (itemsError) throw itemsError;

      // Obtener token
      const tokenRes = await getAccessToken(
        orgData.uber_client_id,
        orgData.uber_client_secret
      );
      const token = tokenRes.access_token;

      // Construir payload para crear delivery
      const pickupAddr = {
        street_address: [orgData.address || 'Dirección del local'],
        state: 'RM',
        city: 'Santiago',
        country: 'CL',
      };

      const dropoffAddr = {
        street_address: [order.delivery_address],
        state: 'RM',
        city: 'Santiago',
        country: 'CL',
      };

      const normalizePhone = (phone) => {
        if (!phone) return '';
        let n = (phone || '').replace(/^0+/, '').replace(/[^\d+]/g, '');
        if (n.startsWith('+')) return n;
        if (n.startsWith('56')) return `+${n}`;
        return `+56${n}`;
      };

      const deliveryData = {
        quote_id: null,
        external_store_id: orgData.id,
        pickup_address: JSON.stringify(pickupAddr),
        pickup_name: orgData.name,
        pickup_phone_number: normalizePhone(orgData.phone),
        pickup_latitude: orgData.store_lat || -33.8688,
        pickup_longitude: orgData.store_lng || -70.8693,
        dropoff_address: JSON.stringify(dropoffAddr),
        dropoff_name: order.customer_name || 'Cliente',
        dropoff_phone_number: normalizePhone(order.customer_phone),
        dropoff_latitude: -33.8688, // Would need to geocode for accuracy
        dropoff_longitude: -70.8693,
        dropoff_notes: order.delivery_notes || '',
        manifest_items: (orderItems || []).map(item => ({
          name: item.product_name || 'Producto',
          quantity: item.quantity || 1,
          value: item.unit_price || 0,
        })),
      };

      console.log('[Retry] Attempting delivery creation with retry logic...');
      
      // Use createDeliveryWithRetry to handle transient errors
      const delivery = await createDeliveryWithRetry(
        orgData.uber_customer_id,
        token,
        deliveryData,
        3 // maxRetries
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
          deliveryId: delivery.id
        }
      }));

      // Refrescar lista
      setOrders(prev => prev.filter(o => o.id !== order.id));
    } catch (error) {
      console.error('[Retry Error]:', error);
      setResults(prev => ({
        ...prev,
        [order.id]: { 
          success: false, 
          message: `❌ Error: ${error.message || 'No se pudo crear el delivery'}`,
          error: error.message
        }
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
