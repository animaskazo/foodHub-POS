import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, MapPin, ChevronRight, Loader2, ExternalLink, CalendarClock } from 'lucide-react';
import { getPublicOrderById } from '../../services/publicOrderService';
import { generateJoke } from '../../services/aiService';

const fmt = (n) => n ? n.toLocaleString('es-CL') : '0';

const OrderConfirmation = ({ order, org }) => {
  const [visible, setVisible] = useState(false);
  const [dbOrder, setDbOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joke, setJoke] = useState(null);

  useEffect(() => {
    setTimeout(() => setVisible(true), 50);
    
    const fetchOrderDetails = async () => {
      if (!order?.id) {
        setLoading(false);
        return;
      }
      try {
        const data = await getPublicOrderById(order.id);
        setDbOrder(data);
      } catch (e) {
        console.error('Error fetching order confirmation details:', e);
      } finally {
        setLoading(false);
      }
    };
    
    fetchOrderDetails();

    // Fetch joke independently so it doesn't block loading
    generateJoke().then(j => {
      if (j) setJoke(j);
    });
  }, [order?.id]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  const displayTotal = dbOrder?.total || 0;
  const items = dbOrder?.order_items || [];

  const formatSchedule = (iso) => {
    const d = new Date(iso);
    const dateLabel = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
    const timeLabel = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    return { dateLabel, timeLabel };
  };
  const schedule = dbOrder?.scheduled_at ? formatSchedule(dbOrder.scheduled_at) : null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col items-center">

        {/* Success animation */}
        <div
          className={`transition-all duration-700 ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-75'} mb-5`}
        >
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 bg-gray-200 rounded-full animate-ping opacity-30" />
            <div className="relative w-16 h-16 bg-black rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-white" strokeWidth={2.5} />
            </div>
          </div>
        </div>

        <div
          className={`text-center transition-all duration-500 delay-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        >
          <h1 className="text-2xl font-black text-gray-900 mb-0.5">¡Pedido enviado!</h1>
          <p className="text-sm text-gray-500 font-medium mb-2.5">
            Orden {(dbOrder?.order_number || order?.order_number)?.includes('#') ? '' : '#'}{dbOrder?.order_number || order?.order_number}
          </p>
          <div className="inline-block bg-green-50 text-green-700 px-3.5 py-1 rounded-full font-black text-lg border border-green-200">
            ${fmt(displayTotal)}
          </div>
        </div>

        {/* Info cards */}
        <div
          className={`w-full mt-8 space-y-3 transition-all duration-500 delay-500 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        >
          {/* Status */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">
                {dbOrder?.status === 'scheduled' ? 'Programado' :
                 dbOrder?.status === 'pending' ? 'Pendiente' :
                 dbOrder?.status === 'confirmed' ? 'Confirmado' :
                 dbOrder?.status === 'preparing' ? 'En preparación' :
                 dbOrder?.status === 'ready' ? 'Listo' :
                 dbOrder?.status === 'delivered' ? 'Entregado' :
                 dbOrder?.status === 'cancelled' ? 'Cancelado' :
                 'En preparación'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 mb-1.5">
                {dbOrder?.status === 'scheduled' ? 'Pedido agendado, lo prepararemos a la hora indicada' :
                 dbOrder?.status === 'pending' ? 'Pedido recibido, esperando confirmación' :
                 dbOrder?.status === 'confirmed' ? 'Pedido confirmado' :
                 dbOrder?.status === 'preparing' ? 'Tu pedido está siendo preparado' :
                 dbOrder?.status === 'ready' ? 'Tu pedido está listo' :
                 dbOrder?.status === 'delivered' ? 'Pedido entregado' :
                 dbOrder?.status === 'cancelled' ? 'Pedido cancelado' :
                 'Tu pedido ya fue recibido y está siendo preparado'}
              </p>
              {dbOrder?.customer_name && (
                <div className="text-xs text-gray-700 bg-gray-50 rounded px-2 py-1 inline-block border border-gray-100">
                  <span className="font-bold">A nombre de:</span> {dbOrder.customer_name} 
                  {dbOrder?.customer_phone && <span className="text-gray-500 ml-1">({dbOrder.customer_phone})</span>}
                </div>
              )}
            </div>
          </div>

          {/* Scheduled day & time */}
          {schedule && (
            <div className="bg-amber-50 rounded-2xl border border-amber-100 p-4 flex items-center gap-4">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                <CalendarClock className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-amber-700/70 uppercase tracking-wider">
                  {dbOrder?.delivery_type === 'delivery' ? 'Día y hora de entrega' : 'Día y hora de retiro'}
                </p>
                <p className="font-bold text-gray-900 text-base capitalize">{schedule.dateLabel}</p>
                <p className="text-sm font-bold text-amber-800">a las {schedule.timeLabel} hrs</p>
              </div>
            </div>
          )}

          {/* Pickup/Delivery info */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
              <MapPin className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">
                {dbOrder?.delivery_type === 'delivery' 
                  ? 'Despacho a Domicilio' 
                  : 'Retiro en local'} 
                {' · '} 
                {dbOrder?.payments?.[0]?.method === 'online_gateway' ? 'Pagado online' : 'Pago al recibir'}
              </p>
              {dbOrder?.payments?.[0]?.reference_code && (
                <p className="text-xs text-gray-500 mt-0.5">
                  ID de transacción Klap: {dbOrder.payments[0].reference_code}
                </p>
              )}
              {dbOrder?.delivery_type === 'delivery' ? (
                <p className="text-xs text-gray-500 mt-0.5">{dbOrder.delivery_address}</p>
              ) : (
                org?.address && <p className="text-xs text-gray-500 mt-0.5">{org.address}</p>
              )}
            </div>
          </div>

          {/* Uber Direct tracking */}
          {dbOrder?.uber_tracking_url && (
            <a
              href={dbOrder.uber_tracking_url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white rounded-2xl border border-green-200 p-4 flex items-center gap-4 hover:bg-green-50 transition-colors group"
            >
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                <ExternalLink className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-green-700 text-sm group-hover:underline">
                  Seguir delivery en vivo
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Delivery vía Uber Direct 
                  {dbOrder.uber_status === 'pending' ? ' — Pendiente' :
                   dbOrder.uber_status === 'preparing' ? ' — Preparando pedido' :
                   dbOrder.uber_status === 'ready' ? ' — Pedido listo' :
                   dbOrder.uber_status === 'pickup' ? ' — Repartidor en camino al local' :
                   dbOrder.uber_status === 'pickup_complete' ? ' — Repartidor recogió el pedido' :
                   dbOrder.uber_status === 'dropoff' ? ' — Repartidor en camino a tu domicilio' :
                   dbOrder.uber_status === 'delivered' ? ' — ¡Entregado!' :
                   dbOrder.uber_status === 'canceled' ? ' — Cancelado' :
                   ''}
                </p>
              </div>
              <ExternalLink className="h-4 w-4 text-green-500 shrink-0" />
            </a>
          )}

          {/* Order summary */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="font-bold text-gray-900 text-sm mb-3">Resumen de tu pedido</p>
            <div className="space-y-3">
              {items
                .filter(item => !item.parent_item_id)
                .map((item) => {
                  const childItems = items.filter(child => child.parent_item_id === item.id);
                  const variants = item.order_item_variants || [];
                  const ingredients = item.order_item_ingredients || [];
                  return (
                    <div key={item.id} className="py-1">
                      <div className="flex justify-between items-start text-sm">
                        <div className="flex-1 min-w-0 mr-4">
                          <span className="font-bold text-gray-800">
                            {item.quantity}× {item.product_name}
                          </span>
                          {variants.length > 0 && (
                            <span className="text-xs text-gray-500 ml-1.5 font-medium">
                              ({variants.map(v => v.variant_option_name).join(', ')})
                            </span>
                          )}
                          {ingredients.length > 0 && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              + {ingredients.map(i => i.ingredient_name).join(', ')}
                            </p>
                          )}
                        </div>
                        <span className="font-semibold text-gray-900 shrink-0">${fmt(item.total_price)}</span>
                      </div>

                      {/* Renderizar componentes del combo del cliente */}
                      {childItems.length > 0 && (
                        <div className="ml-5 mt-1.5 pl-3 border-l border-gray-200 space-y-1">
                          {childItems.map((child, cIdx) => (
                            <div key={cIdx} className="text-xs text-gray-500 font-medium">
                              <span className="font-bold text-gray-600">{child.quantity / item.quantity}x</span> {child.product_name}
                              {child.order_item_variants && child.order_item_variants.length > 0 && (
                                <span className="text-gray-400"> ({child.order_item_variants.map(v => v.variant_option_name).join(', ')})</span>
                              )}
                              {child.order_item_ingredients && child.order_item_ingredients.length > 0 && (
                                <span className="text-orange-500 ml-1 font-semibold">
                                  (+ {child.order_item_ingredients.map(i => i.ingredient_name).join(', ')})
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              {(dbOrder?.delivery_fee > 0 || (dbOrder?.delivery_type === 'delivery' && dbOrder?.delivery_fee === 0)) && (
                <div className="pt-2 border-t border-gray-100 flex justify-between text-sm">
                  <span className="font-semibold text-gray-600">Costo de envío</span>
                  <span className="font-semibold text-gray-800">${fmt(dbOrder.delivery_fee || 0)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-gray-100 flex justify-between">
                <span className="font-bold text-gray-900">Total</span>
                <span className="font-black text-gray-900">${fmt(displayTotal)}</span>
              </div>
              {dbOrder?.notes && (
                <div className="pt-3 pb-1 border-t border-gray-100">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Notas del pedido</p>
                  <p className="text-xs text-gray-700 italic bg-amber-50 p-2 rounded-lg border border-amber-100">"{dbOrder.notes}"</p>
                </div>
              )}
            </div>
          </div>

          {/* Joke Section */}
          {joke && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center mt-4">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">💡 Curiosidad del chef</p>
              <p className="text-sm text-gray-700 italic">"{joke}"</p>
            </div>
          )}

          {/* New order CTA */}
          <button
            onClick={() => {
              // Redirect to main store page to reset params and start fresh
              const storeUrl = window.location.pathname;
              window.location.href = storeUrl;
            }}
            className="w-full mt-2 border-2 border-gray-200 bg-white text-gray-800 font-bold py-4 rounded-full flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors active:scale-[0.98]"
          >
            Hacer otro pedido
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderConfirmation;
