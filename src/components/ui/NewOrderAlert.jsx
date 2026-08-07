import React, { useEffect, useState } from 'react';
import { useKitchenOrders } from '../../hooks/useKitchenOrders';
import { ChefHat, X, Receipt } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const NewOrderAlert = () => {
  const { latestNewOrder, clearLatestNewOrder } = useKitchenOrders();
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (latestNewOrder) {
      setIsVisible(true);
      // Auto dismiss after 10 seconds
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(clearLatestNewOrder, 300); // Wait for transition
      }, 10000);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [latestNewOrder, clearLatestNewOrder]);

  if (!latestNewOrder && !isVisible) return null;

  return (
    <div 
      className={`fixed top-6 right-6 z-[100] max-w-sm w-full bg-[#1c1c1e] text-white p-5 rounded-2xl shadow-2xl border border-gray-700 transition-all duration-300 transform ${isVisible ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-4 opacity-0 scale-95 pointer-events-none'}`}
    >
      <button 
        onClick={() => {
          setIsVisible(false);
          setTimeout(clearLatestNewOrder, 300);
        }}
        className="absolute top-3 right-3 text-gray-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="flex items-start gap-4">
        <div className="bg-emerald-500/20 text-emerald-400 p-3 rounded-full shrink-0">
          <ChefHat className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-lg mb-1">¡Nuevo Pedido!</h3>
          <p className="text-gray-300 text-sm mb-3">
            Acaba de ingresar un pedido de <strong>{latestNewOrder?.source === 'table' ? 'Mesa' : 'Delivery/Retiro'}</strong>.
          </p>
          
          <div className="bg-black/40 rounded-xl p-3 mb-4 text-sm border border-white/5">
            <div className="flex justify-between items-center mb-1">
              <span className="text-gray-400">Orden:</span>
              <span className="font-bold">#{latestNewOrder?.order_number || latestNewOrder?.id?.slice(0,4)}</span>
            </div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-gray-400">Total:</span>
              <span className="font-bold">${latestNewOrder?.total?.toLocaleString('es-CL')}</span>
            </div>
          </div>

          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(clearLatestNewOrder, 300);
              navigate('/kitchen');
            }}
            className="w-full bg-white text-black font-bold py-2.5 rounded-xl hover:bg-gray-100 transition-colors flex items-center justify-center gap-2 text-sm"
          >
            <Receipt className="h-4 w-4" />
            Ver en Cocina
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewOrderAlert;
