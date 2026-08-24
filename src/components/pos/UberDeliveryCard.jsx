import React, { useState, useEffect, useCallback } from 'react';
import { Truck, Phone, User, ExternalLink, RefreshCw, AlertCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getAccessToken, getDelivery } from '../../services/uberDirectService';

export const UberDeliveryCard = ({ order, organization }) => {
  const [deliveryData, setDeliveryData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const fetchUberData = useCallback(async () => {
    if (!order?.uber_delivery_id) return;
    let cid = organization?.uber_customer_id;
    let clientId = organization?.uber_client_id;
    let clientSecret = organization?.uber_client_secret;

    setLoading(true);
    setError(null);

    try {
      if ((!cid || !clientId || !clientSecret) && (order?.organization_id || organization?.id)) {
        const orgId = order?.organization_id || organization?.id;
        const { data: orgData } = await supabase
          .from('organizations')
          .select('uber_customer_id, uber_client_id, uber_client_secret')
          .eq('id', orgId)
          .single();
        if (orgData) {
          cid = orgData.uber_customer_id;
          clientId = orgData.uber_client_id;
          clientSecret = orgData.uber_client_secret;
        }
      }

      if (!cid || !clientId || !clientSecret) {
        setError('Credenciales de Uber Direct no disponibles');
        setLoading(false);
        return;
      }

      const tokenRes = await getAccessToken(clientId, clientSecret);
      const data = await getDelivery(cid, tokenRes.access_token, order.uber_delivery_id);
      setDeliveryData(data);
    } catch (err) {
      console.error('[UberDeliveryCard] Error fetching driver info:', err);
      setError('No se pudo obtener información del repartidor de Uber');
    } finally {
      setLoading(false);
    }
  }, [order?.uber_delivery_id, order?.organization_id, organization]);

  useEffect(() => {
    fetchUberData();
  }, [fetchUberData]);

  // Si no hay delivery de Uber, verificamos si debería haber uno (fallido)
  if (!order?.uber_delivery_id && !order?.uber_tracking_url) {
    if (order?.delivery_type === 'delivery' && organization?.uber_enabled) {
      return (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-4 text-xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-bold text-red-800 text-sm mb-1">Error al asignar repartidor</h4>
              <p className="text-red-600 mb-3 leading-relaxed">
                El pedido fue confirmado pero hubo un problema al solicitar el repartidor en Uber Direct.
              </p>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const { toast } = await import('sonner');
                  const { retryFailedUberDelivery } = await import('../../utils/uberDeliveryRetry');
                  
                  const toastId = toast.loading('Solicitando repartidor en Uber Direct...');
                  const result = await retryFailedUberDelivery(order.id, organization.id);
                  
                  if (result.success) {
                    toast.success('Repartidor asignado con éxito', { id: toastId });
                    // Recargar la data forzando actualización
                    if (window.location.pathname.includes('superadmin')) {
                       window.dispatchEvent(new Event('reload-orders'));
                    } else {
                       window.location.reload();
                    }
                  } else {
                    toast.error(result.message, { id: toastId, duration: 5000 });
                  }
                }}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Reintentar solicitud en Uber
              </button>
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  const courier = deliveryData?.courier;
  const status = deliveryData?.status || order?.uber_status || 'pending';

  const statusLabels = {
    pending: { label: 'Buscando repartidor', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    pickup: { label: 'Repartidor en camino al local', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    pickup_complete: { label: 'Pedido recogido · En camino al cliente', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    dropoff: { label: 'Repartidor llegando al cliente', color: 'bg-purple-50 text-purple-700 border-purple-200' },
    delivered: { label: 'Entregado por Uber', color: 'bg-green-50 text-green-700 border-green-200' },
    canceled: { label: 'Entrega cancelada', color: 'bg-red-50 text-red-700 border-red-200' },
  };

  const currentStatus = statusLabels[status] || { label: status, color: 'bg-gray-50 text-gray-700 border-gray-200' };

  const vehicleIcons = {
    CAR: '🚗 Auto',
    MOTORCYCLE: '🏍️ Moto',
    BICYCLE: '🚲 Bicicleta',
    FOOT: '🏃 A pie',
  };

  return (
    <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-xs">
      {/* Encabezado Estado Uber */}
      <div 
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-1.5 font-bold text-gray-800">
          <Truck className="h-4 w-4 text-black" />
          <span>Uber Direct <span className="font-normal text-gray-500">({currentStatus.label})</span></span>
          {isExpanded ? <ChevronUp className="h-4 w-4 ml-1 text-gray-500" /> : <ChevronDown className="h-4 w-4 ml-1 text-gray-500" />}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            fetchUberData();
          }}
          disabled={loading}
          className="p-1 text-gray-400 hover:text-black transition-colors rounded-full hover:bg-gray-100"
          title="Actualizar estado"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-blue-500' : ''}`} />
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-3 mt-3 pt-3 border-t border-gray-200">
          {/* Badge Estado */}
          <div className={`px-2.5 py-1.5 rounded-lg border font-semibold flex items-center justify-between ${currentStatus.color}`}>
            <span>{currentStatus.label}</span>
            {deliveryData?.pickup_eta && status === 'pending' && (
              <span className="text-[10px] opacity-80 flex items-center gap-1">
                <Clock className="h-3 w-3" /> ETA Retiro: {new Date(deliveryData.pickup_eta).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          {/* Info Repartidor */}
          {courier ? (
            <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-2">
              <div className="flex items-center gap-3">
                {courier.img_href ? (
                  <img src={courier.img_href} alt={courier.name} className="w-10 h-10 rounded-full object-cover border border-gray-200" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold border border-gray-200">
                    <User className="h-5 w-5" />
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-bold text-gray-900 text-sm">{courier.name}</p>
                  <div className="flex items-center gap-2 text-gray-500 text-[11px]">
                    <span>{vehicleIcons[courier.vehicle_type] || courier.vehicle_type || 'Repartidor'}</span>
                    {courier.rating && <span>· ⭐ {courier.rating}</span>}
                  </div>
                </div>
              </div>

              {/* Teléfono Conductor */}
              {courier.phone_number && (
                <div className="pt-2 border-t border-gray-100 flex gap-2">
                  <a
                    href={`tel:${courier.phone_number}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 text-center font-bold text-black bg-gray-100 hover:bg-gray-200 py-1.5 rounded-md flex items-center justify-center gap-1 text-xs"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    Llamar ({courier.phone_number})
                  </a>
                </div>
              )}
            </div>
          ) : !loading && (
            <div className="bg-white p-2.5 rounded-lg border border-gray-200 text-gray-500 text-[11px] flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
              <span>Uber está asignando el repartidor para esta orden. Vuelve a presionar "Actualizar" en unos momentos.</span>
            </div>
          )}

          {/* Tracking Link */}
          {(deliveryData?.tracking_url || order?.uber_tracking_url) && (
            <a
              href={deliveryData?.tracking_url || order?.uber_tracking_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-green-700 bg-green-50 hover:bg-green-100 py-2 rounded-lg border border-green-200 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Seguir en vivo (Mapa Uber)
            </a>
          )}

          {error && <p className="text-[11px] text-red-600 italic">{error}</p>}
        </div>
      )}
    </div>
  );
};

export default UberDeliveryCard;
