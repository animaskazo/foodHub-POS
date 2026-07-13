import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, MapPin, ChevronRight, Loader2 } from 'lucide-react';
import { getPublicOrderById } from '../../services/publicOrderService';

const fmt = (n) => n ? n.toLocaleString('es-CL') : '0';

const OrderConfirmation = ({ order, org }) => {
  const [visible, setVisible] = useState(false);
  const [dbOrder, setDbOrder] = useState(null);
  const [loading, setLoading] = useState(true);

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
          <p className="text-sm text-gray-500 font-medium mb-2.5">Orden #{dbOrder?.order_number || order?.order_number}</p>
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
              <p className="font-bold text-gray-900 text-sm">En preparación</p>
              <p className="text-xs text-gray-500 mt-0.5">Tu pedido ya fue recibido y está siendo preparado</p>
            </div>
          </div>

          {/* Pickup info */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
              <MapPin className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">Retiro en local · Pago al retirar</p>
              {org?.address && (
                <p className="text-xs text-gray-500 mt-0.5">{org.address}</p>
              )}
            </div>
          </div>

          {/* Order summary */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="font-bold text-gray-900 text-sm mb-3">Resumen de tu pedido</p>
            <div className="space-y-2">
              {items.map((item) => {
                const variants = item.order_item_variants || [];
                const ingredients = item.order_item_ingredients || [];
                return (
                  <div key={item.id} className="flex justify-between items-start text-sm">
                    <div className="flex-1 min-w-0 mr-4">
                      <span className="font-medium text-gray-800">
                        {item.quantity}× {item.product_name}
                      </span>
                      {variants.length > 0 && (
                        <span className="text-xs text-gray-500 ml-1.5 font-medium">
                          ({variants.map(v => v.variant_option_name).join(', ')})
                        </span>
                      )}
                      {ingredients.length > 0 && (
                        <p className="text-xs text-gray-400">
                          + {ingredients.map(i => i.ingredient_name).join(', ')}
                        </p>
                      )}
                    </div>
                    <span className="font-semibold text-gray-900 shrink-0">${fmt(item.total_price)}</span>
                  </div>
                );
              })}
              <div className="pt-2 border-t border-gray-100 flex justify-between">
                <span className="font-bold text-gray-900">Total</span>
                <span className="font-black text-gray-900">${fmt(displayTotal)}</span>
              </div>
            </div>
          </div>

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
