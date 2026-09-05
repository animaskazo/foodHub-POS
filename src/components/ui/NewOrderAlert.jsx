import React, { useEffect, useState, useRef } from 'react';
import { useKitchenOrders } from '../../hooks/useKitchenOrders';
import { 
  ChefHat, 
  X, 
  Receipt, 
  Printer, 
  Loader2, 
  Globe, 
  MessageCircle, 
  Van, 
  ShoppingBag, 
  Store,
  MapPin, 
  Phone,
  Volume2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import PrintableReceipt from '../pos/PrintableReceipt';
import { printReceipt, printReceiptAsPDF } from '../../services/printerService';
import { 
  playOrderSound, 
  startTitleFlash, 
  stopTitleFlash, 
  showDesktopNotification,
  testAlertSound 
} from '../../utils/soundAlerts';

const NewOrderAlert = () => {
  const { latestNewOrder, clearLatestNewOrder } = useKitchenOrders();
  const navigate = useNavigate();
  const { organization } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [autoPrintOrder, setAutoPrintOrder] = useState(null);
  const [isPrinting, setIsPrinting] = useState(false);
  
  const processedOrdersRef = useRef(new Set());

  useEffect(() => {
    if (latestNewOrder && !processedOrdersRef.current.has(latestNewOrder.id)) {
      processedOrdersRef.current.add(latestNewOrder.id);
      
      const isOnline = latestNewOrder.order_type === 'online' || latestNewOrder.order_type === 'whatsapp';
      let isCreatedByMe = false;

      // Online orders (from public storefront or WhatsApp) are NEVER created by this POS terminal.
      // Only local POS orders matching the last saved order ID should be muted.
      if (!isOnline) {
        try {
          const lastId = localStorage.getItem('last_pos_order_id');
          if (lastId && lastId === latestNewOrder.id) {
            isCreatedByMe = true;
            localStorage.removeItem('last_pos_order_id');
          }
        } catch(e) {}
      }

      if (!isCreatedByMe) {
        setIsVisible(true);
        
        // Play synthesized resonant chime
        playOrderSound(latestNewOrder);

        const orderNum = latestNewOrder.order_number || latestNewOrder.id?.slice(0, 4);
        const channelLabel = latestNewOrder.order_type === 'whatsapp' 
          ? 'WhatsApp' 
          : latestNewOrder.order_type === 'online' 
            ? 'Tienda Web' 
            : 'POS';

        // Flash browser tab title
        startTitleFlash(`🔔 ¡Pedido ${channelLabel} #${orderNum}!`);

        // Show OS Desktop notification (if permitted)
        showDesktopNotification({
          title: `¡Nuevo Pedido ${channelLabel} #${orderNum}!`,
          body: `${latestNewOrder.customer_name ? `Cliente: ${latestNewOrder.customer_name} • ` : ''}Total: $${latestNewOrder.total?.toLocaleString('es-CL')}`,
          onClick: () => {
            navigate('/kitchen');
          }
        });
        
        if (localStorage.getItem('pos_auto_print_enabled') === 'true') {
          setAutoPrintOrder(latestNewOrder);
        }
        
        const timer = setTimeout(() => {
          setIsVisible(false);
          stopTitleFlash();
          setTimeout(clearLatestNewOrder, 300);
        }, 12000); // 12 seconds
        
        return () => {
          clearTimeout(timer);
          stopTitleFlash();
        };
      } else {
        // Pedido creado por mi POS local -> ignorar alerta flotante
        setTimeout(clearLatestNewOrder, 1000);
      }
    } else if (!latestNewOrder) {
      setIsVisible(false);
      stopTitleFlash();
    }
  }, [latestNewOrder, clearLatestNewOrder, navigate]);

  // Dedicated effect for printing to ensure DOM/React state is ready
  useEffect(() => {
    if (autoPrintOrder && localStorage.getItem('pos_auto_print_enabled') === 'true') {
      import('sonner').then(({ toast }) => toast.info('Generando ticket...'));
      
const timer = setTimeout(async () => {
         const pythonPrinter = localStorage.getItem('python_default_printer');
         
         if (pythonPrinter) {
           try {
             await printReceipt(autoPrintOrder, organization, pythonPrinter);
           } catch (e) {
             console.error('Python Print failed', e);
             import('sonner').then(({ toast }) => toast.error('Error imprimiendo'));
           }
         } else {
           import('sonner').then(({ toast }) => toast.info('Generando PDF...'));
           await printReceiptAsPDF(autoPrintOrder, organization).catch(() => {});
         }
         setAutoPrintOrder(null);
       }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [autoPrintOrder, organization]);

  const handleManualPrint = async () => {
    setIsPrinting(true);
    let orderToPrint = latestNewOrder;

    const pythonPrinter = localStorage.getItem('python_default_printer');
if (pythonPrinter && orderToPrint) {
       import('sonner').then(({ toast }) => toast.info('Imprimiendo ticket...'));
       try {
         await printReceipt(orderToPrint, organization, pythonPrinter);
         setIsPrinting(false);
         return;
       } catch (e) {
         console.error('Python Print failed', e);
         import('sonner').then(({ toast }) => toast.error('Error imprimiendo'));
       }
     }
     import('sonner').then(({ toast }) => toast.info('Generando PDF...'));
     await printReceiptAsPDF(orderToPrint, organization).catch(() => {});
     setIsPrinting(false);
   };

  if (!latestNewOrder && !isVisible && !autoPrintOrder) return null;

  const isOnline = latestNewOrder?.order_type === 'online';
  const isWhatsapp = latestNewOrder?.order_type === 'whatsapp';
  const isDelivery = latestNewOrder?.delivery_type === 'delivery';

  return (
    <>
      <div 
        className={`fixed z-[100] bg-[#18181b] text-white shadow-2xl border border-zinc-700/80 transition-all duration-300 transform 
          ${isVisible ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-4 opacity-0 scale-95 pointer-events-none'}
          top-4 left-4 right-4 p-4 rounded-2xl
          md:top-6 md:right-6 md:left-auto md:w-[420px] md:p-5
        `}
      >
        <button 
          onClick={() => {
            setIsVisible(false);
            stopTitleFlash();
            setTimeout(clearLatestNewOrder, 300);
          }}
          className="absolute top-2 right-2 md:top-3 md:right-3 text-gray-400 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors"
          title="Cerrar alerta"
        >
          <X className="h-4 w-4 md:h-5 md:w-5" />
        </button>

        <div className="flex items-start gap-3 md:gap-4">
          {/* Icon based on Channel */}
          <div className={`p-2.5 md:p-3 rounded-2xl shrink-0 ${
            isWhatsapp 
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
              : isOnline 
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' 
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
          }`}>
            {isWhatsapp ? (
              <MessageCircle className="h-6 w-6" />
            ) : isOnline ? (
              <Globe className="h-6 w-6" />
            ) : latestNewOrder?.order_type === 'table' ? (
              <Store className="h-6 w-6" />
            ) : (
              <ChefHat className="h-6 w-6" />
            )}
          </div>

          <div className="flex-1 min-w-0 pr-4 md:pr-0">
            {/* Header: Title & Channel Badges */}
            <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base md:text-lg leading-tight tracking-tight text-white">
                  {isWhatsapp ? '¡Nuevo WhatsApp!' : isOnline ? '¡Nuevo Pedido Web!' : '¡Nuevo Pedido!'}
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                {/* Order Number Badge */}
                <span className="font-mono font-black text-xs px-2 py-0.5 rounded-md bg-white/10 text-white border border-white/10">
                  #{latestNewOrder?.order_number || latestNewOrder?.id?.slice(0, 4)}
                </span>
              </div>
            </div>

            {/* Badges row: Channel + Delivery mode */}
            <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1 ${
                isWhatsapp 
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : isOnline 
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
              }`}>
                {isWhatsapp ? 'WhatsApp' : isOnline ? 'Tienda Online' : 'POS'}
              </span>

              {isDelivery ? (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider flex items-center gap-1">
                  <Van className="h-3 w-3" /> Delivery
                </span>
              ) : (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700 uppercase tracking-wider flex items-center gap-1">
                  <ShoppingBag className="h-3 w-3" /> Retiro
                </span>
              )}

              {/* Quick Sound Test button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  testAlertSound(isOnline || isWhatsapp);
                }}
                className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 ml-auto flex items-center gap-1 transition-colors"
                title="Probar sonido"
              >
                <Volume2 className="h-2.5 w-2.5" />
                <span>Sonar</span>
              </button>
            </div>
            
            {/* Customer & Address Details for Online Orders */}
            {(latestNewOrder?.customer_name || latestNewOrder?.delivery_address || latestNewOrder?.customer_phone) && (
              <div className="bg-black/40 rounded-xl p-2.5 mb-3 text-xs border border-white/5 space-y-1">
                {latestNewOrder.customer_name && (
                  <div className="font-semibold text-zinc-200 truncate">
                    Cliente: <span className="text-white font-bold">{latestNewOrder.customer_name}</span>
                  </div>
                )}
                {latestNewOrder.customer_phone && (
                  <div className="text-zinc-400 flex items-center gap-1 truncate text-[11px]">
                    <Phone className="h-3 w-3 shrink-0 text-emerald-400" />
                    <span>{latestNewOrder.customer_phone}</span>
                  </div>
                )}
                {isDelivery && latestNewOrder.delivery_address && (
                  <div className="text-amber-300/90 flex items-start gap-1 text-[11px] font-medium leading-tight">
                    <MapPin className="h-3 w-3 shrink-0 text-amber-400 mt-0.5" />
                    <span className="truncate">{latestNewOrder.delivery_address}</span>
                  </div>
                )}
              </div>
            )}

            {/* Items Summary */}
            <div className="bg-zinc-900/90 rounded-xl p-3 mb-3 text-sm border border-white/5">
              <div className="flex justify-between items-center mb-1">
                <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Total</span>
                <span className="font-black text-base text-emerald-400">${latestNewOrder?.total?.toLocaleString('es-CL')}</span>
              </div>
              
              {latestNewOrder?.order_items && latestNewOrder.order_items.length > 0 && (
                <div className="border-t border-white/10 pt-2 mt-2">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Productos</span>
                    <span className="bg-white/10 text-white text-[10px] px-2 py-0.5 rounded font-bold">
                      {latestNewOrder.order_items.reduce((acc, item) => acc + item.quantity, 0)} items
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {latestNewOrder.order_items.slice(0, 3).map((item, idx) => (
                      <li key={idx} className="text-gray-300 text-xs truncate flex items-center gap-1.5">
                        <span className="font-bold text-amber-400">{item.quantity}x</span>
                        <span className="truncate">{item.product_name}</span>
                      </li>
                    ))}
                    {latestNewOrder.order_items.length > 3 && (
                      <li className="text-gray-500 text-xs italic mt-0.5">+ {latestNewOrder.order_items.length - 3} más...</li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleManualPrint}
                disabled={isPrinting}
                className="bg-white/10 text-white font-bold py-2 md:py-2.5 px-3.5 rounded-xl hover:bg-white/20 transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                title="Imprimir Ticket"
              >
                {isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              </button>
              <button
                onClick={() => {
                  setIsVisible(false);
                  stopTitleFlash();
                  setTimeout(clearLatestNewOrder, 300);
                  navigate('/kitchen');
                }}
                className="flex-1 bg-white text-black font-extrabold py-2 md:py-2.5 rounded-xl hover:bg-gray-100 transition-colors flex items-center justify-center gap-2 text-sm shadow-md"
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

