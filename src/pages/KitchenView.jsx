import React, { useState, useEffect, useRef } from 'react';
import { Clock, ChefHat, CheckCircle2, Play, RefreshCw, Volume2, VolumeX, BellRing } from 'lucide-react';
import { getKitchenOrders, updateOrderStatus } from '../services/orderService';

const KitchenView = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const audioEnabledRef = useRef(false);
  const audioCtxRef = useRef(null);
  const prevOrdersRef = useRef([]);

  const toggleAudio = () => {
    const nextState = !audioEnabled;
    setAudioEnabled(nextState);
    audioEnabledRef.current = nextState;
    
    if (nextState) {
      // Browser requires AudioContext to be created/resumed on user gesture
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      } else if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      playBellSound(true); // Reproducir sonido de prueba
    }
  };

  const playBellSound = (force = false) => {
    if (!audioEnabledRef.current && !force) return;
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

  useEffect(() => {
    fetchOrders();
    // Auto refresh every 10 seconds silently
    const interval = setInterval(() => {
      fetchOrders(true);
    }, 10000);
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
    <div className="flex flex-col h-screen bg-black text-gray-100 overflow-hidden font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-[#111] border-b border-[#222] shadow-md">
        <div className="flex items-center gap-3">
          <div className="bg-white p-2 rounded-lg text-black">
            <ChefHat className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">KDS - Vista de Cocina</h1>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={toggleAudio}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
              audioEnabled ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-[#222] text-gray-400 border border-[#333]'
            }`}
          >
            {audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            {audioEnabled ? 'Sonido Activo' : 'Activar Sonido'}
          </button>
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
        <div className="flex gap-6 h-full items-start">
          {orders.length === 0 && !loading && (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
              <ChefHat className="h-16 w-16 mb-4 opacity-20" />
              <p className="text-xl font-medium">No hay órdenes pendientes en este momento.</p>
              <p className="text-sm mt-2 opacity-60">La cocina está al día.</p>
            </div>
          )}

          {orders.map(order => {
            const isNew = getElapsedTime(order.created_at) === 'Ahora mismo';
            return (
            <div 
              key={order.id} 
              className={`flex-shrink-0 w-80 h-full flex flex-col rounded-2xl border-2 shadow-xl bg-[#111] flex-nowrap ticket-enter ${
                order.status === 'preparing' ? 'border-green-500/50' : 'border-blue-500/30'
              } ${isNew ? 'ring-4 ring-blue-500/20 shadow-blue-500/20' : ''}`}
            >
              {/* Ticket Header */}
              <div className={`p-4 border-b shrink-0 flex justify-between items-center ${
                order.status === 'preparing' ? 'bg-green-500/10 border-green-500/20' : 'bg-blue-500/10 border-blue-500/20'
              }`}>
                <div>
                  <h2 className={`text-2xl font-black ${order.status === 'preparing' ? 'text-green-400' : 'text-blue-400'}`}>#{order.order_number}</h2>
                  <div className="flex items-center gap-1.5 text-xs font-semibold mt-1">
                    <span className={`px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      order.status === 'preparing' ? 'bg-green-500 text-black' : 'bg-blue-600 text-white'
                    }`}>
                      {order.status === 'preparing' ? 'Preparando' : 'Nuevo'}
                    </span>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-400 capitalize">{order.order_type}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end text-right">
                  <div className="flex items-center gap-1 text-gray-400">
                    <Clock className="h-4 w-4" />
                  </div>
                  <span className={`text-sm font-medium mt-1 ${
                    getElapsedTime(order.created_at).includes('min') && parseInt(getElapsedTime(order.created_at).match(/\\d+/)?.[0] || 0) > 15 
                      ? 'text-red-400 font-bold' 
                      : 'text-gray-400'
                  }`}>
                    {getElapsedTime(order.created_at)}
                  </span>
                </div>
              </div>

              {/* Ticket Items */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {order.order_items?.map(item => {
                  const variants = item.order_item_variants?.map(v => v.variant_option_name).join(', ');
                  return (
                  <div key={item.id} className="flex gap-3 items-start bg-[#222]/50 p-3 rounded-xl border border-[#333]">
                    <div className="w-8 h-8 rounded-lg bg-[#333] text-white flex items-center justify-center font-bold text-lg shrink-0">
                      {item.quantity}
                    </div>
                    <div className="flex-1 pt-1">
                      <p className="font-semibold text-white leading-snug">{item.product_name}</p>
                      {variants && (
                        <p className="text-sm text-gray-300 mt-1 font-medium bg-[#111] p-1.5 rounded border border-[#333]">
                          <span className="text-gray-500 mr-1">Con:</span> {variants}
                        </p>
                      )}
                      {item.products?.description && !variants && (
                        <p className="text-xs text-gray-400 mt-0.5 leading-snug">
                          {item.products.description}
                        </p>
                      )}
                      {item.notes && (
                        <p className="text-xs text-black mt-1.5 bg-gray-200 p-1.5 rounded-md border border-gray-300 font-medium">
                          {item.notes}
                        </p>
                      )}
                    </div>
                  </div>
                )})}
              </div>

              {/* Ticket Actions */}
              <div className="p-4 border-t border-[#222] bg-[#111] rounded-b-2xl shrink-0">
                {order.status === 'confirmed' ? (
                  <button
                    onClick={() => handleUpdateStatus(order.id, 'preparing')}
                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex justify-center items-center gap-2 transition-colors shadow-lg shadow-blue-900/20"
                  >
                    <Play className="h-5 w-5 fill-current" />
                    Empezar a Preparar
                  </button>
                ) : (
                  <button
                    onClick={() => handleUpdateStatus(order.id, 'ready')}
                    className="w-full py-3.5 bg-green-500 hover:bg-green-400 text-gray-900 rounded-xl font-black flex justify-center items-center gap-2 transition-colors shadow-lg shadow-green-900/20"
                  >
                    <CheckCircle2 className="h-6 w-6" strokeWidth={3} />
                    Marcar Listo
                  </button>
                )}
              </div>
            </div>
          )})}
        </div>
      </main>

      {/* Add a subtle custom scrollbar style */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.1);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.2);
        }
        
        @keyframes slideInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ticket-enter {
          animation: slideInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
};

export default KitchenView;
