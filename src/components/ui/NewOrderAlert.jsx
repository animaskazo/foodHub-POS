import React, { useEffect, useState, useRef } from 'react';
import { useKitchenOrders } from '../../hooks/useKitchenOrders';
import { ChefHat, X, Receipt, Printer, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import PrintableReceipt from '../pos/PrintableReceipt';
import { printReceipt } from '../../services/printerService';

const NewOrderAlert = () => {
  const { latestNewOrder, clearLatestNewOrder } = useKitchenOrders();
  const navigate = useNavigate();
  const { organization } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [autoPrintOrder, setAutoPrintOrder] = useState(null);
  const [isPrinting, setIsPrinting] = useState(false);
  
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
      
      let isCreatedByMe = false;
      try {
        const lastId = localStorage.getItem('last_pos_order_id');
        const lastTime = localStorage.getItem('last_pos_order_time');
        // Identificar si el pedido fue creado en este mismo dispositivo recientemente (últimos 30 seg)
        if (lastId === latestNewOrder.id || (lastTime && (Date.now() - parseInt(lastTime)) < 30000)) {
          isCreatedByMe = true;
          // Limpiar para no bloquear accidentalmente futuras ordenes falsas
          localStorage.removeItem('last_pos_order_id');
        }
      } catch(e) {}

      if (!isCreatedByMe) {
        setIsVisible(true);
        playBellSound();
        
        if (localStorage.getItem('pos_auto_print_enabled') === 'true') {
          setAutoPrintOrder(latestNewOrder);
        }
        
        const timer = setTimeout(() => {
          setIsVisible(false);
          setTimeout(clearLatestNewOrder, 300); // Wait for transition
        }, 10000);
        return () => clearTimeout(timer);
      } else {
        // Pedido creado por mi POS local -> ignorar por completo, PosView ya lo imprimió
        setTimeout(clearLatestNewOrder, 1000);
      }
    } else {
      setIsVisible(false);
    }
  }, [latestNewOrder, clearLatestNewOrder]);

  // Dedicated effect for printing to ensure DOM/React state is ready
  useEffect(() => {
    if (autoPrintOrder && localStorage.getItem('pos_auto_print_enabled') === 'true') {
      import('sonner').then(({ toast }) => toast.info('Generando ticket...'));
      
      const timer = setTimeout(async () => {
        const qzPrinter = localStorage.getItem('qz_default_printer');
        
        if (qzPrinter) {
          try {
            await printReceipt(autoPrintOrder, organization, qzPrinter);
          } catch (e) {
            console.error('QZ Print failed', e);
            import('sonner').then(({ toast }) => toast.error('Error imprimiendo en QZ Tray'));
          }
          setAutoPrintOrder(null);
        } else {
          // Si no hay QZ Tray configurado, NO lanzamos window.print() automáticamente 
          // porque bloquea la pantalla con el diálogo nativo (a menos que usen Kiosk mode).
          console.warn('Auto-impresión ignorada: No hay impresora QZ Tray seleccionada.');
          import('sonner').then(({ toast }) => toast.warning('Impresión automática omitida: Selecciona una impresora en Configuración.'));
          setAutoPrintOrder(null);
        }
      }, 1000); // 1s delay for logo rendering
      
      return () => clearTimeout(timer);
    }
  }, [autoPrintOrder, organization]);

  const handleManualPrint = async () => {
    setIsPrinting(true);
    let orderToPrint = latestNewOrder;

    const qzPrinter = localStorage.getItem('qz_default_printer');
    if (qzPrinter && orderToPrint) {
      import('sonner').then(({ toast }) => toast.info('Imprimiendo ticket...'));
      try {
        await printReceipt(orderToPrint, organization, qzPrinter);
      } catch (e) {
        console.error('QZ Print failed', e);
        import('sonner').then(({ toast }) => toast.error('Error imprimiendo en QZ Tray'));
      }
    } else {
      setAutoPrintOrder(orderToPrint);
      setTimeout(() => {
        const originalTitle = document.title;
        document.title = `Orden_#${orderToPrint?.order_number || orderToPrint?.id?.slice(0,4)}`;
        window.focus();
        window.print();
        document.title = originalTitle;
        setTimeout(() => setAutoPrintOrder(null), 1000);
      }, 150);
    }
    setIsPrinting(false);
  };

  if (!latestNewOrder && !isVisible && !autoPrintOrder) return null;

  return (
    <>
      <div 
        className={`fixed z-[100] bg-[#1c1c1e] text-white shadow-2xl border border-gray-700 transition-all duration-300 transform 
          ${isVisible ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-4 opacity-0 scale-95 pointer-events-none'}
          top-4 left-4 right-4 p-4 rounded-2xl
          md:top-6 md:right-6 md:left-auto md:w-[380px] md:p-5
        `}
      >
        <button 
          onClick={() => {
            setIsVisible(false);
            setTimeout(clearLatestNewOrder, 300);
          }}
          className="absolute top-2 right-2 md:top-3 md:right-3 text-gray-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
        >
          <X className="h-4 w-4 md:h-5 md:w-5" />
        </button>

        <div className="flex items-start gap-3 md:gap-4">
          <div className="bg-emerald-500/20 text-emerald-400 p-2 md:p-3 rounded-full shrink-0">
            <ChefHat className="h-5 w-5 md:h-6 md:w-6" />
          </div>
          <div className="flex-1 min-w-0 pr-4 md:pr-0">
            <div className="flex justify-between items-start mb-1">
              <h3 className="font-bold text-base md:text-lg leading-tight">¡Nuevo Pedido!</h3>
              {/* Solo en desktop se muestra arriba, en mobile lo ponemos más compacto */}
              <span className="hidden md:block font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-md text-xs">
                #{latestNewOrder?.order_number || latestNewOrder?.id?.slice(0,4)}
              </span>
            </div>
            
            <p className="text-gray-300 text-xs md:text-sm mb-3">
              <span className="hidden md:inline">Acaba de ingresar un pedido de </span>
              <strong>{latestNewOrder?.order_type === 'table' ? 'Mesa' : 'Delivery/Retiro'}</strong>
              <span className="md:hidden ml-1 text-gray-400">• #{latestNewOrder?.order_number || latestNewOrder?.id?.slice(0,4)}</span>
              <span className="md:hidden ml-1 font-bold text-white">• ${latestNewOrder?.total?.toLocaleString('es-CL')}</span>
            </p>
            
            <div className="hidden md:block bg-black/40 rounded-xl p-3 mb-4 text-sm border border-white/5">
              <div className="flex justify-between items-center mb-1">
                <span className="text-gray-400">Total:</span>
                <span className="font-bold">${latestNewOrder?.total?.toLocaleString('es-CL')}</span>
              </div>
              
              {latestNewOrder?.order_items && latestNewOrder.order_items.length > 0 && (
                <div className="border-t border-white/10 pt-2 mt-2">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Detalle</span>
                    <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0.5 rounded-md font-bold">
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

            <div className="flex gap-2">
              <button
                onClick={handleManualPrint}
                disabled={isPrinting}
                className="bg-white/10 text-white font-bold py-2 md:py-2.5 px-4 rounded-xl hover:bg-white/20 transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                title="Imprimir Ticket"
              >
                {isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              </button>
              <button
                onClick={() => {
                  setIsVisible(false);
                  setTimeout(clearLatestNewOrder, 300);
                  navigate('/kitchen');
                }}
                className="flex-1 bg-white text-black font-bold py-2 md:py-2.5 rounded-xl hover:bg-gray-100 transition-colors flex items-center justify-center gap-2 text-sm"
              >
                <Receipt className="h-4 w-4" />
                Ver en Cocina
              </button>
            </div>
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
