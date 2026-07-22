import React, { useState, useEffect, useRef } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Clock, ChefHat, CheckCircle2, Play, RefreshCw, Volume2, Store, ShoppingBag, ShoppingCart, Globe, MessageCircle, User, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getKitchenOrders, updateOrderStatus } from '../services/orderService';

const KitchenView = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const audioCtxRef = useRef(null);
  const prevOrdersRef = useRef([]);

  // Audio Context must be resumed after user interaction
  const initAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    } else if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

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
    } catch(e) {
      console.error("Audio error", e);
    }
  };

  useEffect(() => {
    const unlockAudio = () => {
      initAudio();
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

  const fetchOrders = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    const data = await getKitchenOrders();
    
    // Check for new orders
    if (isBackground && prevOrdersRef.current.length > 0) {
      const prevIds = new Set(prevOrdersRef.current.map(o => o.id));
      const hasNew = data.some(o => !prevIds.has(o.id));
      if (hasNew) {
        playBellSound();
      }
    }
    
    setOrders(data);
    prevOrdersRef.current = data;
    if (!isBackground) setLoading(false);
  };

  useDocumentTitle('Cocina');

  useEffect(() => {
    fetchOrders();
    // Auto refresh every 5 seconds silently
    const interval = setInterval(() => {
      fetchOrders(true);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleUpdateStatus = async (orderId, newStatus) => {
    // Optimistic update
    setOrders(prev => {
      if (newStatus === 'ready') return prev.filter(o => o.id !== orderId);
      return prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o);
    });

    try {
      await updateOrderStatus(orderId, newStatus);
    } catch (error) {
      // Revert on error by refetching
      alert("Hubo un error al actualizar el estado de la orden.");
      fetchOrders();
    }
  };

  // Helper para mostrar el tiempo transcurrido
  const getElapsedTime = (createdAt) => {
    const start = new Date(createdAt);
    const now = new Date();
    const diffMs = now - start;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Ahora mismo';
    return `hace ${diffMins} min`;
  };

  return (
    <div className="flex flex-col h-screen bg-black text-gray-100 overflow-hidden font-sans" onClick={initAudio}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-[#111] border-b border-[#222]">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 text-gray-400 hover:text-white bg-[#222] hover:bg-[#333] border border-[#333] rounded-lg transition-colors flex items-center justify-center"
            title="Volver al Dashboard"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="bg-white p-2 rounded-lg text-black">
              <ChefHat className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white hidden md:block">KDS - Vista de Cocina</h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-green-500/20 text-green-400 border border-green-500/30">
            <Volume2 className="h-4 w-4" />
            Sonido Activo
          </div>
          <div className="text-sm font-medium text-gray-400 bg-[#222] px-4 py-2 rounded-full flex items-center gap-2 border border-[#333]">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            Actualización en vivo
          </div>
          <button 
            onClick={() => fetchOrders()}
            className="p-2 bg-[#222] hover:bg-[#333] border border-[#333] rounded-lg transition-colors"
            title="Actualizar manualmente"
          >
            <RefreshCw className={`h-5 w-5 text-white ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Kanban Board / Grid */}
      <main className="flex-1 overflow-x-auto overflow-y-hidden p-6">
        <div className="flex gap-6 h-full items-start after:content-[''] after:w-1 after:shrink-0">
          {orders.length === 0 && !loading && (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
              <ChefHat className="h-16 w-16 mb-4 opacity-20" />
              <p className="text-xl font-medium">No hay órdenes pendientes en este momento.</p>
              <p className="text-sm mt-2 opacity-60">La cocina está al día.</p>
            </div>
          )}
          {orders.map(order => {
            const elapsed = getElapsedTime(order.created_at);
            const elapsedMins = elapsed.includes('min') ? parseInt(elapsed.match(/\d+/)?.[0] || 0) : 0;
            const isUrgent  = elapsedMins >= 15;
            const isWarning = elapsedMins >= 8 && elapsedMins < 15;

            // Clean, low-contrast UI configs
            const statusConfig = {
              preparing: {
                border:   'border-emerald-500/30',
                glow:     'shadow-black/40',
                headerBg: 'bg-[#22c55e]/[0.02]',
                label:    'Preparando',
                labelCls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
                btnClass: 'bg-[#10b981] hover:bg-[#059669] text-white',
              },
              pending: {
                border:   'border-amber-500/30',
                glow:     'shadow-black/40',
                headerBg: 'bg-[#f59e0b]/[0.02]',
                label:    'Pendiente',
                labelCls: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
                btnClass: 'bg-zinc-800 hover:bg-zinc-700 text-white',
              },
              confirmed: {
                border:   'border-zinc-800',
                glow:     'shadow-black/40',
                headerBg: 'bg-zinc-900',
                label:    'Nuevo',
                labelCls: 'bg-zinc-800 text-zinc-300 border border-zinc-700',
                btnClass: 'bg-white hover:bg-zinc-100 text-zinc-950',
              },
            };
            const cfg = statusConfig[order.status] || statusConfig.confirmed;

            const channelConfig = {
              online:   { label: 'Online',   Icon: Globe },
              whatsapp: { label: 'WhatsApp', Icon: MessageCircle },
              table:    { label: 'Local',    Icon: Store },
              takeaway: { label: 'Llevar',   Icon: ShoppingBag },
              pickup:   { label: 'Retiro',   Icon: ShoppingCart },
            };
            const channel = channelConfig[order.order_type] || { label: order.order_type, Icon: Store };

            return (
            <div
              key={order.id}
              className={`flex-shrink-0 w-[22rem] h-full flex flex-col rounded-2xl border ${cfg.border} bg-zinc-950 overflow-hidden ticket-enter`}
            >
              {/* ── Header ── */}
              <div className={`${cfg.headerBg} px-4 pt-4 pb-3.5 border-b border-zinc-900 shrink-0 space-y-3`}>

                {/* Row 1: order number */}
                <h2 className="text-3xl font-black text-white tracking-tight leading-none truncate">
                  {order.order_number}
                </h2>

                {/* Row 2: badge status + channel + user */}
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-full shrink-0 ${cfg.labelCls}`}>
                    {cfg.label}
                  </span>
                  <div className="flex items-center gap-2 text-xs text-zinc-400 font-medium min-w-0">
                    <div className="flex items-center gap-1 shrink-0">
                      <channel.Icon className="h-3.5 w-3.5" />
                      <span>{channel.label}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 min-w-0">
                      <User className="h-3.5 w-3.5 fill-current shrink-0" />
                      <span className="truncate max-w-[100px]">{order.customer_name || 'Sin Nombre'}</span>
                    </div>
                  </div>
                </div>

                {/* Customer order notes */}
                {order.notes && (
                  <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <p className="text-xs text-amber-300/90 font-medium leading-relaxed break-words">{order.notes}</p>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto py-3 px-3 space-y-2.5 custom-scrollbar bg-zinc-950">
                {order.order_items?.filter(item => !item.parent_item_id).map((item) => {
                  const childItems = order.order_items?.filter(child => child.parent_item_id === item.id) || [];
                  const variants = item.order_item_variants?.map(v => v.variant_option_name).join(', ');
                  const extras   = item.order_item_ingredients?.map(i => i.ingredient_name);
                  const hasModifiers = variants || (extras && extras.length > 0) || item.notes || childItems.length > 0;
                  return (
                    <div key={item.id} className="rounded-xl bg-zinc-900/60 border border-zinc-900 overflow-hidden">
                      {/* qty + image + name */}
                      <div className="flex items-start gap-3 px-3.5 pt-3 pb-2.5">
                        <div className="w-8 h-8 rounded-lg bg-zinc-800 text-white flex items-center justify-center font-extrabold text-base shrink-0">
                          {item.quantity}
                        </div>
                        {item.products?.product_images?.[0]?.url ? (
                          <img 
                            src={item.products.product_images[0].url} 
                            alt={item.product_name} 
                            className="w-10 h-10 rounded-lg object-cover shrink-0 border border-zinc-800"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-zinc-850 flex items-center justify-center shrink-0 border border-zinc-800/40">
                            <ChefHat className="h-5 w-5 text-zinc-600" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 pt-0.5">
                          <p className="text-[15px] font-bold text-white leading-tight break-words">{item.product_name}</p>
                        </div>
                      </div>

                      {/* modifiers block */}
                      {hasModifiers && (
                        <div className="px-3.5 pb-3 pt-0.5 border-t border-zinc-900/40 space-y-2.5 text-[13px]">
                          {/* Render combo child options first, clean and structured */}
                          {childItems.length > 0 && (
                            <div className="space-y-1.5 bg-black/30 p-2.5 rounded-lg border border-zinc-800/50">
                              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-extrabold select-none block mb-1">Componentes:</span>
                              {childItems.map((child, cIdx) => {
                                const childVars = child.order_item_variants?.map(v => v.variant_option_name).join(', ');
                                const childExtras = child.order_item_ingredients?.map(i => i.ingredient_name);
                                return (
                                  <div key={cIdx} className="text-zinc-300 font-medium text-xs leading-normal">
                                    <span className="text-emerald-400 font-bold">• {child.quantity / item.quantity}x</span> {child.product_name}
                                    {childVars && (
                                      <span className="text-zinc-500"> ({childVars})</span>
                                    )}
                                    {childExtras && childExtras.length > 0 && (
                                      <span className="text-amber-500 ml-1 font-semibold">
                                        (+ {childExtras.join(', ')})
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {variants && (
                            <div className="flex items-baseline gap-1 text-zinc-400 font-medium">
                              <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-extrabold select-none shrink-0">Opción:</span>
                              <span className="break-words leading-tight flex-1">{variants}</span>
                            </div>
                          )}
                          {extras && extras.length > 0 && (
                            <div className="space-y-1">
                              <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-extrabold select-none block">Agregados:</span>
                              <div className="flex flex-wrap gap-1">
                                {extras.map((extra, idx) => (
                                  <span key={idx} className="inline-block bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-0.5 rounded-md text-[12px] font-semibold">
                                    + {extra}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {item.notes && (
                            <div className="p-2 bg-[#ffc107]/[0.03] border border-[#ffc107]/10 rounded-lg">
                              <p className="text-[12px] text-amber-200/90 font-medium leading-relaxed break-words">
                                <span className="font-bold text-[#ffc107] block select-none mb-0.5 text-[10px] uppercase tracking-wider">Nota ítem:</span>
                                {item.notes}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── Timer & Action button ── */}
              <div className="px-4 pb-4 pt-2 shrink-0 flex flex-col gap-3 border-t border-zinc-900/50 bg-zinc-950">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500 font-bold uppercase tracking-wider">Tiempo de espera</span>
                  <div className={`flex items-center gap-1.5 font-mono text-[13px] font-bold px-2 py-1 rounded-md shrink-0 select-none ${isUrgent ? 'bg-red-500/10 text-red-400 border border-red-500/20' : isWarning ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-zinc-900 border border-zinc-800 text-zinc-300'}`}>
                    <Clock className="h-3.5 w-3.5" />
                    <span>{elapsed}</span>
                  </div>
                </div>
                {(order.status === 'confirmed' || order.status === 'pending') ? (
                  <button
                    onClick={() => handleUpdateStatus(order.id, 'preparing')}
                    className={`w-full py-3.5 ${cfg.btnClass} rounded-xl font-bold flex justify-center items-center gap-2 transition-all text-sm tracking-wide active:scale-[0.98]`}
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Empezar Preparación
                  </button>
                ) : (
                  <button
                    onClick={() => handleUpdateStatus(order.id, 'ready')}
                    className={`w-full py-3.5 ${cfg.btnClass} rounded-xl font-extrabold flex justify-center items-center gap-2 transition-all text-sm tracking-wide active:scale-[0.98]`}
                  >
                    <CheckCircle2 className="h-5 w-5" strokeWidth={2.5} />
                    Marcar como Listo
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }

        @keyframes slideInUp {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .ticket-enter {
          animation: slideInUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
};

export default KitchenView;
