import React, { useEffect, useState, useRef } from 'react';
import { useKitchenOrders } from '../../hooks/useKitchenOrders';
import { ChefHat, X, Receipt } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import PrintableReceipt from '../pos/PrintableReceipt';

const NewOrderAlert = () => {
  const { latestNewOrder, clearLatestNewOrder } = useKitchenOrders();
  const navigate = useNavigate();
  const { organization } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [autoPrintOrder, setAutoPrintOrder] = useState(null);
  
  const audioCtxRef = useRef(null);
  const processedOrdersRef = useRef(new Set());

  const playBellSound = () => {
    try {
      const ctx = audioCtxRef.current || new (window.AudioContext || window.webkitAudioContext)();
      if (!audioCtxRef.current) audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') ctx.resume();

      const playNote = (freq, startTime, duration) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        gainNode.gain.setValueAtTime(0.5, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      playNote(880, ctx.currentTime, 1);
      playNote(1108.73, ctx.currentTime + 0.15, 1); // C#6
    } catch (e) {
      console.error("Audio error", e);
    }
  };

  useEffect(() => {
    const unlockAudio = () => {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      } else if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      if (audioCtxRef.current?.state === 'running') {
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
      }
    };

    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  useEffect(() => {
    if (latestNewOrder && !processedOrdersRef.current.has(latestNewOrder.id)) {
      processedOrdersRef.current.add(latestNewOrder.id);
      
      setIsVisible(true);
      playBellSound();
      
      if (localStorage.getItem('pos_auto_print_enabled') === 'true') {
        setAutoPrintOrder(latestNewOrder);
        import('sonner').then(({ toast }) => toast.info('Impresión automática iniciada...'));
        
        setTimeout(() => {
          const originalTitle = document.title;
          document.title = `Orden_#${latestNewOrder.order_number || latestNewOrder.id.slice(0,4)}`;
          
          const btn = document.getElementById('global-hidden-print-trigger');
          if (btn) {
            btn.click();
          } else {
            window.focus();
            window.print();
          }
          
          document.title = originalTitle;
        }, 500);
      }

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
    <>
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
              <div className="flex justify-between items-center mb-3">
                <span className="text-gray-400">Total:</span>
                <span className="font-bold">${latestNewOrder?.total?.toLocaleString('es-CL')}</span>
              </div>
              
              {latestNewOrder?.order_items && latestNewOrder.order_items.length > 0 && (
                <div className="border-t border-white/10 pt-2 mt-2">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Detalle</span>
                    <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-md font-bold">
                      {latestNewOrder.order_items.reduce((acc, item) => acc + item.quantity, 0)} items
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {latestNewOrder.order_items.slice(0, 3).map((item, idx) => (
                      <li key={idx} className="text-gray-300 text-xs truncate flex items-center gap-1.5">
                        <span className="font-bold text-gray-400">{item.quantity}x</span>
                        {item.product_name}
                      </li>
                    ))}
                    {latestNewOrder.order_items.length > 3 && (
                      <li className="text-gray-500 text-xs italic mt-1">+ {latestNewOrder.order_items.length - 3} más...</li>
                    )}
                  </ul>
                </div>
              )}
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

      <PrintableReceipt order={autoPrintOrder} organization={organization} />
      <button 
        id="global-hidden-print-trigger" 
        className="hidden" 
        onClick={() => {
          window.focus();
          window.print();
        }}
        aria-hidden="true"
      />
    </>
  );
};

export default NewOrderAlert;
