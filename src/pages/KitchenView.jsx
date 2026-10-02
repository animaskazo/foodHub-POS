import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { 
  Clock, 
  ChefHat, 
  CheckCircle2, 
  CheckCheck,
  Loader2,
  Play, 
  RefreshCw, 
  Volume2, 
  VolumeX, 
  Store, 
  ShoppingBag, 
  ShoppingCart, 
  Globe, 
  MessageCircle, 
  User, 
  ArrowLeft, 
  Home, 
  Van 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getKitchenOrders, updateOrderStatus, activateDueScheduledOrders, updateOrderItemsStatus, bulkMarkOrdersReady } from '../services/orderService';
import { useAuth } from '../components/AuthContext';
import { Button } from '@/components/ui/button';
import { supabase } from '../lib/supabase';
import {
  playKitchenChime,
  playOnlineOrderAlert,
  testAlertSound,
  unlockAudio,
  isAudioUnlocked,
  startTitleFlash,
  stopTitleFlash,
  getIsMuted,
  setIsMuted
} from '../utils/soundAlerts';

const KitchenView = () => {
  const navigate = useNavigate();
  const { organization } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [muted, setMutedState] = useState(getIsMuted());
  const [audioReady, setAudioReady] = useState(isAudioUnlocked());
  const prevOrdersRef = useRef([]);
  const isInitialLoadRef = useRef(true);
  const scrollContainerRef = useRef(null);
  const [leavingOrders, setLeavingOrders] = useState(new Set());
  const [newOrderIds, setNewOrderIds] = useState(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });

  // Smoothly scroll the container to make the newest / target ticket visible
  const scrollToNewOrder = useCallback((ticketId) => {
    setTimeout(() => {
      const el = ticketId 
        ? document.getElementById(`ticket-${ticketId}`) 
        : (document.querySelector('.ticket-enter-new') || scrollContainerRef.current?.lastElementChild);

      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'end' });
      } else if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({
          left: scrollContainerRef.current.scrollWidth,
          behavior: 'smooth'
        });
      }
    }, 200);
  }, []);

  // Trigger visual and audible alerts for new orders with 10s duration and auto-scroll
  const triggerNewOrderAlert = useCallback((ordersList, playSound = true) => {
    if (!ordersList || ordersList.length === 0) return;
    setNewOrderIds(prev => {
      const next = new Set(prev);
      ordersList.forEach(o => {
        next.add(o.id);
        next.add(`${o.id}-round-0`);
        next.add(`${o.id}-round-1`);
      });
      return next;
    });

    // Automatically scroll to the latest incoming order
    const latestOrder = ordersList[ordersList.length - 1];
    if (latestOrder) {
      scrollToNewOrder(latestOrder.id);
    }

    // Keep animation active for 10 seconds
    setTimeout(() => {
      setNewOrderIds(prev => {
        const next = new Set(prev);
        ordersList.forEach(o => {
          next.delete(o.id);
          next.delete(`${o.id}-round-0`);
          next.delete(`${o.id}-round-1`);
        });
        return next;
      });
    }, 10000);

    if (playSound) {
      const hasOnline = ordersList.some(o => o.order_type === 'online' || o.order_type === 'whatsapp');
      if (hasOnline) {
        playOnlineOrderAlert();
        startTitleFlash('🔔 ¡NUEVO PEDIDO ONLINE!');
      } else {
        playKitchenChime();
        startTitleFlash('🔔 ¡NUEVA ORDEN EN COCINA!');
      }
    }
  }, [scrollToNewOrder]);

  // Fetch kitchen orders and track newly arrived orders for sound & animation
  const fetchOrders = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      // Activar pedidos programados cuya hora ya llegó
      await activateDueScheduledOrders();
      const data = await getKitchenOrders();

      if (!isInitialLoadRef.current) {
        const prevIds = new Set(prevOrdersRef.current.map(o => o.id));
        const added = data.filter(o => 
          !prevIds.has(o.id) && (o.status === 'scheduled' || o.status === 'pending' || o.status === 'confirmed')
        );

        if (added.length > 0) {
          triggerNewOrderAlert(added, true);
        }
      } else {
        isInitialLoadRef.current = false;
        // On initial mount/navigation, if an order was created in the last 60 seconds, animate and scroll to it!
        const recentOrders = data.filter(o => 
          (o.status === 'pending' || o.status === 'confirmed') &&
          o.created_at &&
          (Date.now() - new Date(o.created_at).getTime()) < 60000
        );
        if (recentOrders.length > 0) {
          triggerNewOrderAlert(recentOrders, false);
        }
      }

      setOrders(data);
      prevOrdersRef.current = data;
    } catch (e) {
      console.error('Error fetching kitchen orders', e);
      if (!isBackground) alert('Error al cargar órdenes de cocina');
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [triggerNewOrderAlert]);

  const handleToggleSound = async () => {
    const ready = await unlockAudio();
    setAudioReady(ready);
    if (muted) {
      setIsMuted(false);
      setMutedState(false);
    }
    testAlertSound(true);

    // Trigger 10-second inverse blink on the latest order and scroll to it!
    if (orders.length > 0) {
      const latest = orders[orders.length - 1];
      triggerNewOrderAlert([latest], false);
    }
  };

  const handleMuteToggle = (e) => {
    e.stopPropagation();
    const newMuted = !muted;
    setIsMuted(newMuted);
    setMutedState(newMuted);
  };

  useDocumentTitle('Cocina');

  useEffect(() => {
    fetchOrders(true);

    // Supabase Realtime subscription for instant new orders (<500ms)
    const channel = supabase
      .channel('kitchen-view-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          fetchOrders(true);
        }
      )
      .subscribe();

    // Auto refresh every 12 seconds as a fallback
    const interval = setInterval(() => {
      fetchOrders(true);
    }, 12000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
      stopTitleFlash();
    };
  }, [fetchOrders]);

  const handleUpdateStatus = async (orderId, newStatus, ticket = null) => {
    if (newStatus === 'ready') {
      const targetId = ticket ? ticket.ticketId : orderId;
      setLeavingOrders(prev => new Set([...prev, targetId]));
      setTimeout(() => {
        // Optimistically remove the ticket from view
        if (ticket) {
          // If we are updating a specific round ticket, we don't remove the whole order
          // The next fetchOrders will handle it because the items will be marked as ready
          fetchOrders(true);
        } else {
          setOrders(prev => prev.filter(o => o.id !== orderId));
        }
        setLeavingOrders(prev => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
      }, 400);
    } else {
      // Optimistic update: only change the order's status in local state
      // Then confirm from DB to avoid race conditions with auto-refresh interval
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    }

    try {
      if (ticket && newStatus === 'ready') {
        const itemIds = ticket.roundItems.map(i => i.id);
        await updateOrderItemsStatus(itemIds, newStatus, orderId);
      } else {
        await updateOrderStatus(orderId, newStatus);
      }
      // After a successful DB write for 'preparing', re-fetch to ensure
      // the local state is consistent (avoids ticket disappearing due to
      // race conditions between optimistic update and the 15s auto-refresh)
      if (newStatus === 'preparing') {
        setTimeout(() => fetchOrders(true), 300);
      }
    } catch (error) {
      // Revert on error by refetching
      alert("Hubo un error al actualizar el estado de la orden.");
      fetchOrders();
    }
  };

  // Un pedido programado cuya hora aún no llega se muestra en la pantalla pero
  // no entra en el "todos listos": cerrarlo antes de tiempo lo marca como
  // entregado sin que se haya preparado.
  const isFutureScheduled = useCallback((order) => {
    return order.status === 'scheduled'
      && !!order.scheduled_at
      && new Date(order.scheduled_at).getTime() > Date.now();
  }, []);

  const ordersToMarkReady = useMemo(
    () => orders.filter((o) => {
      if (isFutureScheduled(o)) return false;
      return (o.order_items || []).some((i) => !i.parent_item_id && i.status !== 'ready');
    }),
    [orders, isFutureScheduled]
  );

  const scheduledSkippedCount = useMemo(
    () => orders.filter(isFutureScheduled).length,
    [orders, isFutureScheduled]
  );

  const itemsToMarkCount = useMemo(
    () => ordersToMarkReady.reduce(
      (acc, o) => acc + (o.order_items || []).filter((i) => !i.parent_item_id && i.status !== 'ready').length,
      0
    ),
    [ordersToMarkReady]
  );

  // El rail muestra *rondas*, no órdenes: una mesa que pide dos veces produce
  // dos tickets. Por eso los contadores de la barra se derivan de aquí y no de
  // y no de `orders`: el número de arriba siempre es el número de tickets que
  // hay abajo, aunque la cuenta por orden y la cuenta por ronda difieran.
  const tickets = useMemo(() => {
    const all = [];
    orders.forEach((order) => {
      const parents = (order.order_items || [])
        .filter((item) => !item.parent_item_id && item.status !== 'ready')
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      if (parents.length === 0) return;

      const rounds = [];
      let currentRound = [];
      parents.forEach((item) => {
        if (currentRound.length === 0) {
          currentRound.push(item);
        } else {
          const prevItem = currentRound[currentRound.length - 1];
          const diffMs = new Date(item.created_at) - new Date(prevItem.created_at);
          if (diffMs > 60000) { // 1 minuto de diferencia separa rondas
            rounds.push(currentRound);
            currentRound = [item];
          } else {
            currentRound.push(item);
          }
        }
      });
      if (currentRound.length > 0) rounds.push(currentRound);

      rounds.forEach((round, rIdx) => {
        all.push({
          ...order,
          roundItems: round,
          roundIdx: rIdx,
          totalRounds: rounds.length,
          // El ticket nace con su primer producto, no con el primer pedido
          created_at: round[0]?.created_at || order.created_at,
          ticketId: `${order.id}-round-${rIdx}`
        });
      });
    });

    // De más antiguo a más nuevo: lo primero que se encuentra es lo que más
    // lleva esperando.
    return all.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }, [orders]);

  const kitchenStats = useMemo(() => {
    let dishes = 0;
    let notStarted = 0;
    let preparing = 0;
    let later = 0;
    let oldestMins = 0;

    const now = Date.now();
    tickets.forEach((t) => {
      dishes += t.roundItems.length;
      if (t.status === 'preparing') {
        preparing += 1;
      } else if (isFutureScheduled(t)) {
        // Un programado cuya hora no llega todavía no es trabajo pendiente:
        // se cuenta aparte para que no infle la cola.
        later += 1;
      } else {
        notStarted += 1;
      }
      const mins = Math.floor((now - new Date(t.created_at).getTime()) / 60000);
      if (mins > oldestMins) oldestMins = mins;
    });

    return { dishes, notStarted, preparing, later, oldestMins };
  }, [tickets, isFutureScheduled]);

  const handleBulkMarkReady = async () => {
    setBulkWorking(true);
    setBulkProgress({ done: 0, total: ordersToMarkReady.length });
    try {
      const { updated, skipped, failed } = await bulkMarkOrdersReady(
        ordersToMarkReady.map((o) => o.id),
        (done, total) => setBulkProgress({ done, total })
      );
      setBulkConfirmOpen(false);
      await fetchOrders(true);

      const parts = [];
      if (updated > 0) parts.push(`${updated} ${updated === 1 ? 'pedido listo' : 'pedidos listos'}`);
      if (skipped > 0) parts.push(`${skipped} ${skipped === 1 ? 'programado sin marcar' : 'programados sin marcar'}`);
      if (failed > 0) parts.push(`${failed} con error`);

      if (updated > 0) toast.success(parts.join(' · '));
      else if (failed > 0) toast.error(parts.join(' · '));
      else toast.info('No había pedidos pendientes por marcar.');
    } catch (error) {
      console.error('Error marcando pedidos como listos:', error);
      toast.error('Hubo un error al marcar los pedidos como listos.');
    } finally {
      setBulkWorking(false);
      setBulkProgress({ done: 0, total: 0 });
    }
  };

  // Escape cierra, salvo mientras la operación corre: a medio marcar no se
  // abandona la acción, porque los pedidos que faltan sí se guardaron.
  useEffect(() => {
    if (!bulkConfirmOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !bulkWorking) setBulkConfirmOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bulkConfirmOpen, bulkWorking]);

  // Helper para mostrar el tiempo transcurrido
  const getElapsedTime = (createdAt) => {
    const start = new Date(createdAt);
    const now = new Date();
    const diffMs = now - start;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Ahora mismo';
    return `hace ${diffMins} min`;
  };

  // Formatea la hora programada para mostrarla en el ticket
  const formatScheduled = (scheduledAt) => {
    if (!scheduledAt) return null;
    return new Date(scheduledAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  };

  // El tiempo más largo que algo lleva esperando, que es lo que decide si hay
  // que apurarse. Pasa de 59 a "1 h" para que la barra no se quede sin señal.
  const formatWait = (mins) => {
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h} h ${m}` : `${h} h`;
  };

  // El reloj lleva su propio intervalo porque el resto de la pantalla solo se
  // re-renderiza cada 12s: sin esto mostraría el minuto anterior a las 18:38:59
  // durante casi todo el minuto. El intervalo despierta cada segundo pero solo
  // actualiza el estado cuando cambia el minuto, porque un setState por segundo
  // re-renderiza los 47 tickets de la fila y en una tablet de cocina eso se nota.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let lastMinute = '';
    const tick = () => {
      const d = new Date();
      const key = `${d.getHours()}:${d.getMinutes()}`;
      if (key !== lastMinute) {
        lastMinute = key;
        setNow(d);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const clockLabel = now.toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return (
    <div className="flex flex-col h-screen bg-black text-gray-100 overflow-hidden font-sans" onClick={unlockAudio}>
      {/* Header en dos bandas. La primera es identidad y lleva el nombre del
          local en grande, porque en una cocina con varias sucursales lo primero
          que hay que confirmar es en cuál se está trabajando; antes iba en
          minúscula apretado entre dos botones. La segunda son los controles, y
          es un flex-wrap: en móvil el reloj y "marcar todo listo" bajan a una
          tercera línea, en desktop queda todo en la misma. Un nodo para las dos
          disposiciones. */}
      <header className="bg-[#111] border-b border-[#222] shrink-0">
        <div className="flex items-end justify-between gap-3 px-3 md:px-4 py-2.5 md:py-3">
          {/* Nombre del local y hora, alineados por abajo para que ambos se
              apoyen en la misma línea base, como un cartel y no dos sueltos. */}
          <h1 className="text-2xl md:text-4xl font-black text-white truncate tracking-tight leading-tight min-w-0">
            {organization?.name || 'Local'}
          </h1>

          {/* Reloj en la misma línea que el nombre. Fuera de los controles porque
              ahí competía por el ancho; fijo al extremo derecho porque es la hora
              de referencia del local. tabular-nums porque en cualquier otra
              tipografía las cifras saltan al cambiar de minuto, y el sufijo
              "hrs" es lo que lo distingue de un número más de la cola. */}
          <time
            dateTime={now.toISOString()}
            className="shrink-0 flex items-end gap-1.5 pl-3 border-l border-zinc-800 select-none"
            title="Hora local"
          >
            <span className="text-3xl md:text-5xl font-black text-white tabular-nums tracking-tight leading-none">
              {clockLabel}
            </span>
            <span className="text-xs md:text-sm font-bold text-zinc-500 mb-1.5">hrs</span>
          </time>
        </div>

        <div className="flex flex-wrap md:flex-nowrap items-center gap-2 px-3 md:px-4 pb-2.5 md:pb-3">
          {/* Navegación: salir al POS, ir al admin */}
          <div className="order-1 flex items-center gap-2 md:gap-3 min-w-0 flex-1">
            <Button
              onClick={() => navigate('/pos')}
              className="px-2.5! md:px-3! py-2 min-h-10 bg-blue-600 text-white hover:bg-blue-500 rounded-xl! transition-colors flex items-center justify-center shrink-0 gap-1.5 font-bold text-sm"
              title="Volver al punto de venta"
            >
              <ArrowLeft className="size-5" />
              <span className="hidden sm:inline">Volver al POS</span>
              <span className="sm:hidden">POS</span>
            </Button>

            <Button
              onClick={() => navigate('/')}
              size="icon"
              className="bg-white text-black hover:bg-gray-100 rounded-xl!"
              title="Dashboard admin"
              aria-label="Ir al dashboard admin"
            >
              <Home className="size-5" />
            </Button>
          </div>

        {/* Controles del servicio: sonido primero, porque silenciar las alertas
            es lo que más se toca durante un turno. */}
        <div className="order-2 flex items-center gap-1.5 md:gap-2">
          {/* Sonido: dos controles porque son dos gestos distintos y ninguno
              reemplaza al otro. Probar es una comprobación de que el parlante
              del local funciona; silenciar es lo que se hace cuando el ruido se
              vuelve insoportable. Se mantienen separados pero chicos, y el icono
              del silenciador es el que lleva el estado, para que no haya dos
              botones distintos que parezcan el mismo. */}
          <button
            onClick={handleToggleSound}
            className={`flex items-center gap-1.5 h-10 w-10 sm:w-auto sm:px-3 rounded-xl text-xs md:text-sm font-bold border transition-colors shrink-0 justify-center sm:justify-start ${
              !audioReady
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
                : 'bg-[#222] text-zinc-300 border-[#333] hover:bg-[#2b2b2b] hover:text-white'
            }`}
            title={audioReady ? 'Probar el sonido de la cocina' : 'Tocar para permitir el audio en el navegador'}
            aria-label={audioReady ? 'Probar el sonido de la cocina' : 'Activar el sonido'}
          >
            <Volume2 className="h-5 w-5" />
            <span className="hidden sm:inline">{audioReady ? 'Probar' : 'Activar sonido'}</span>
          </button>

          <button
            onClick={handleMuteToggle}
            className={`flex items-center justify-center w-10 h-10 shrink-0 rounded-xl border transition-colors ${
              muted
                ? 'bg-red-500/15 text-red-300 border-red-500/40 hover:bg-red-500/25'
                : 'bg-[#222] text-zinc-400 border-[#333] hover:bg-[#2b2b2b] hover:text-white'
            }`}
            title={muted ? 'Activar el sonido de las alertas' : 'Silenciar las alertas'}
            aria-label={muted ? 'Activar el sonido de las alertas' : 'Silenciar las alertas'}
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>

          {/* Sin indicador de "en vivo": era un adorno estático que ocupaba
              espacio en la barra sin ayudar a hacer nada. Cuando hay algo que
              actualizar, lo dice el spinner del botón de refrescar. */}

          <Button
            onClick={() => fetchOrders()}
            size="icon"
            className="bg-[#222] hover:bg-[#333] border border-[#333] rounded-xl!"
            title="Actualizar manualmente"
            aria-label="Actualizar manualmente"
          >
            <RefreshCw className={`size-5 text-white ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Marcar todo listo. En móvil ocupa la fila completa bajo los controles;
            en desktop queda a la derecha. Como icono suelto no se entendía qué
            marcaba ni cuántos marcaba. */}
        <Button
          onClick={() => setBulkConfirmOpen(true)}
          disabled={bulkWorking || ordersToMarkReady.length === 0}
          className="order-3 w-full md:w-auto min-h-10 px-3! py-2 bg-emerald-500 text-black hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-xl! transition-colors flex items-center justify-between md:justify-center gap-2 font-bold text-sm shrink-0"
          title={
            ordersToMarkReady.length === 0
              ? 'No hay pedidos pendientes por marcar'
              : `Marcar ${ordersToMarkReady.length} pedido(s) como listos`
          }
        >
          <span className="flex items-center gap-2">
            {bulkWorking
              ? <Loader2 className="h-5 w-5 animate-spin" />
              : <CheckCheck className="h-5 w-5" strokeWidth={2.5} />}
            <span>Marcar todo listo</span>
          </span>
          {ordersToMarkReady.length > 0 && (
            <span className="text-xs font-black bg-black/20 rounded px-1.5 py-0.5 tabular-nums">
              {ordersToMarkReady.length}
            </span>
          )}
        </Button>
        </div>
      </header>

      {/* Kanban Board / Grid */}
      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">

        {/* Barra de estado. Va fuera del rail y no scrollea con él: la cola es
            lo que se mueve, el total de lo que falta es lo que no. */}
        <div className="flex items-center gap-x-4 gap-y-1 px-4 md:px-6 py-1.5 md:py-2 bg-zinc-950 border-b border-zinc-900 overflow-x-auto hide-scrollbar shrink-0">
          <div className="flex items-baseline gap-1.5 shrink-0">
            <span className="text-lg md:text-xl font-black text-white tabular-nums leading-none">
              {kitchenStats.notStarted}
            </span>
            <span className="text-[11px] font-bold text-zinc-400 whitespace-nowrap">
              sin empezar
            </span>
          </div>
          <span className="w-px h-4 bg-zinc-800 shrink-0" aria-hidden="true"></span>
          <div className="flex items-baseline gap-1.5 shrink-0">
            <span className={`text-lg md:text-xl font-black tabular-nums leading-none ${
              kitchenStats.preparing > 0 ? 'text-emerald-400' : 'text-zinc-600'
            }`}>
              {kitchenStats.preparing}
            </span>
            <span className="text-[11px] font-bold text-zinc-400 whitespace-nowrap">
              preparando
            </span>
          </div>
          <span className="w-px h-4 bg-zinc-800 shrink-0" aria-hidden="true"></span>
          <div className="flex items-baseline gap-1.5 shrink-0">
            <span className={`text-lg md:text-xl font-black tabular-nums leading-none ${
              kitchenStats.dishes > 0 ? 'text-white' : 'text-zinc-600'
            }`}>
              {kitchenStats.dishes}
            </span>
            <span className="text-[11px] font-bold text-zinc-400 whitespace-nowrap">
              {kitchenStats.dishes === 1 ? 'producto' : 'productos'}
            </span>
          </div>

          {/* Lo que lleva más rato parado. Si este número está rojo, el servicio
              ya se atrasó y da igual cuántos tickets haya. */}
          {kitchenStats.oldestMins > 0 && (
            <>
              <span className="w-px h-4 bg-zinc-800 shrink-0" aria-hidden="true"></span>
              <div className="flex items-baseline gap-1.5 shrink-0">
                <span className={`text-lg md:text-xl font-black tabular-nums leading-none ${
                  kitchenStats.oldestMins >= 15
                    ? 'text-red-400'
                    : kitchenStats.oldestMins >= 8
                      ? 'text-amber-400'
                      : 'text-zinc-400'
                }`}>
                  {formatWait(kitchenStats.oldestMins)}
                </span>
                <span className="text-[11px] font-bold text-zinc-500 whitespace-nowrap">
                  de espera
                </span>
              </div>
            </>
          )}

          {/* Los programados más tarde no son cola: se anotan aparte para que el
              número de arriba no prometa trabajo que todavía no corresponde. */}
          {kitchenStats.later > 0 && (
            <span className="shrink-0 text-[11px] font-bold text-indigo-400/80 whitespace-nowrap">
              {kitchenStats.later} {kitchenStats.later === 1 ? 'programado' : 'programados'} más tarde
            </span>
          )}
        </div>

        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 flex flex-col md:flex-row md:flex-nowrap gap-4 md:gap-6 w-full items-stretch md:items-start px-4 md:px-6 py-4 md:py-6 pb-safe md:pb-6 overflow-y-auto md:overflow-x-auto md:overflow-y-hidden hide-scrollbar scroll-smooth"
        >

          {tickets.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center w-full h-full py-20 col-span-full">
              <ChefHat className="h-24 w-24 mb-6 text-gray-400" />
              <p className="text-xl font-medium text-center text-gray-500">No hay órdenes pendientes en este momento.</p>
              <p className="text-sm mt-2 text-center text-gray-400">La cocina está al día.</p>
            </div>
          )}

          {tickets.map((ticket) => {
              const elapsed = getElapsedTime(ticket.scheduled_at || ticket.created_at);
              const scheduledTime = formatScheduled(ticket.scheduled_at);
              const elapsedMins = elapsed.includes('min') ? parseInt(elapsed.match(/\d+/)?.[0] || 0) : 0;
              const isUrgent = elapsedMins >= 15;
              const isWarning = elapsedMins >= 8 && elapsedMins < 15;

              // Clean, low-contrast UI configs
              const statusConfig = {
                preparing: {
                  border: 'border-2 border-emerald-500/90',
                  glow: 'shadow-black/40',
                  headerBg: 'bg-[#22c55e]/[0.02]',
                  label: 'Preparando',
                  labelCls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
                  btnClass: 'bg-[#10b981] hover:bg-[#059669] text-white',
                },
                pending: {
                  border: 'border-2 border-amber-500/20 border-dashed',
                  glow: 'shadow-black/40',
                  headerBg: 'bg-[#f59e0b]/[0.02]',
                  label: 'Pendiente',
                  labelCls: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
                  btnClass: 'bg-zinc-800 hover:bg-zinc-700 text-white',
                },
                scheduled: {
                  border: 'border-2 border-indigo-500/40',
                  glow: 'shadow-black/40',
                  headerBg: 'bg-[#6366f1]/[0.04]',
                  label: 'Programado',
                  labelCls: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
                  btnClass: 'bg-zinc-800 hover:bg-zinc-700 text-white',
                },
                confirmed: {
                  border: 'border-2 border-amber-500/50',
                  glow: 'shadow-black/40',
                  headerBg: 'bg-zinc-900',
                  label: 'Nuevo',
                  labelCls: 'bg-zinc-800 text-zinc-300 border border-zinc-700',
                  btnClass: 'bg-white hover:bg-zinc-100 text-zinc-950',
                },
              };
              const cfg = statusConfig[ticket.status] || statusConfig.confirmed;

              const channelConfig = {
                online: { label: 'Online', Icon: Globe },
                whatsapp: { label: 'WhatsApp', Icon: MessageCircle },
                table: { label: 'Local', Icon: Store },
                takeaway: { label: 'Llevar', Icon: ShoppingBag },
                pickup: { label: 'Retiro', Icon: ShoppingCart },
              };
              const channel = channelConfig[ticket.order_type] || { label: ticket.order_type, Icon: Store };

              const isNew = newOrderIds.has(ticket.id) || newOrderIds.has(ticket.ticketId);
              const isLeaving = leavingOrders.has(ticket.ticketId);

              return (
                <div
                  id={`ticket-${ticket.ticketId}`}
                  key={ticket.ticketId}
                  className={`order-card ${isNew ? '' : 'transition-all'} w-full md:w-80 min-w-[300px] flex-shrink-0 flex flex-col rounded-2xl border ${cfg.border} bg-zinc-950 overflow-hidden shadow-lg md:h-full ${isLeaving ? 'ticket-leave' : isNew ? 'ticket-enter-new' : (ticket.status === 'scheduled' || ticket.status === 'pending' || ticket.status === 'confirmed') ? 'ticket-enter-pending' : 'ticket-enter'}`}
                >
                  {/* ── Header ── */}
                  <div className={`${cfg.headerBg} px-4 pt-4 pb-3.5 border-b border-zinc-900 shrink-0 space-y-3`}>

                    {/* Row 1: order number */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 truncate">
                        <h2 className="text-3xl font-black text-white tracking-tight leading-none truncate">
                          {ticket.order_number}
                        </h2>
                      </div>
                      {ticket.delivery_type === 'delivery' ? (
                        <span className="text-[10px] px-2 py-1 rounded bg-amber-500 text-black font-black uppercase tracking-wider shrink-0 flex items-center gap-1">
                          <Van className="h-3.5 w-3.5" /> Delivery
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-1 rounded bg-zinc-800 text-zinc-300 font-bold uppercase tracking-wider shrink-0 flex items-center gap-1">
                          <ShoppingBag className="h-3.5 w-3.5" /> Retiro
                        </span>
                      )}
                    </div>

                    {/* Row 2: badge status + channel + user */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-[11px] uppercase tracking-wider font-extrabold px-2.5 py-1 ${cfg.labelCls}`}>
                          {cfg.label}
                        </span>
                        {scheduledTime && (
                          <span className="text-[11px] font-extrabold px-2.5 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            <Clock className="h-3 w-3 inline-block mr-1" />
                            {scheduledTime}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-zinc-400 font-medium min-w-0">
                        <div className="flex items-center gap-1 shrink-0">
                          <channel.Icon className="h-3.5 w-3.5" />
                          <span>{channel.label}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 min-w-0">
                          <User className="h-3.5 w-3.5 fill-current shrink-0" />
                          <span className="truncate max-w-[100px]">{ticket.customer_name || 'Sin Nombre'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Customer order notes */}
                    {ticket.notes && (
                      <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                        <p className="text-xs text-amber-300/90 font-medium leading-relaxed break-words">{ticket.notes}</p>
                      </div>
                    )}

                    {/* Delivery Address */}
                    {ticket.delivery_type === 'delivery' && ticket.delivery_address && (
                      <div className="p-2.5 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
                        <p className="text-[9px] text-zinc-500 font-extrabold uppercase tracking-wider mb-1">Dirección de Despacho</p>
                        <p className="text-xs text-zinc-200 leading-relaxed font-semibold">{ticket.delivery_address}</p>
                      </div>
                    )}
                  </div>

                  <div className="py-3 px-3 space-y-2.5 bg-zinc-950 md:flex-1 md:overflow-y-auto custom-scrollbar">
                    {ticket.restaurant_tables && (
                      <div className="w-full bg-indigo-500/10 border border-indigo-500/20 px-3.5 py-2.5 rounded-xl mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Store className="h-4 w-4 text-indigo-400" />
                          <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                            {ticket.restaurant_tables.name}
                          </span>
                        </div>
                        {ticket.restaurant_tables.table_zones?.name && (
                          <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-md font-bold uppercase">
                            {ticket.restaurant_tables.table_zones.name}
                          </span>
                        )}
                      </div>
                    )}
                    
                    {/* Render the round items */}
                    <div className="space-y-2.5">
                      {ticket.totalRounds > 1 && (
                        <div className="flex items-center gap-2 px-1">
                          <div className="h-px bg-zinc-800 flex-1"></div>
                          <span className="text-[10px] font-black uppercase tracking-wider text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                            Ronda {ticket.roundIdx + 1} de {ticket.totalRounds}
                          </span>
                          <div className="h-px bg-zinc-800 flex-1"></div>
                        </div>
                      )}
                      
                      {ticket.roundItems.map((item) => {
                        const childItems = ticket.order_items?.filter(child => child.parent_item_id === item.id) || [];
                        const variants = item.order_item_variants?.map(v => v.variant_option_name).join(', ');
                        const extras = item.order_item_ingredients?.map(i => i.ingredient_name);
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
                                <div className="w-10 h-10 rounded-lg bg-zinc-800/60 flex items-center justify-center shrink-0 border border-zinc-800/40">
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
                    {(ticket.status === 'confirmed' || ticket.status === 'pending' || ticket.status === 'scheduled') ? (
                      <Button
                        onClick={() => handleUpdateStatus(ticket.id, 'preparing', ticket)}
                        className={`w-full py-6 ${cfg.btnClass} rounded-xl! font-bold flex justify-center items-center gap-2 transition-all text-lg tracking-wide active:scale-[0.98]`}
                      >
                        <Play className="h-4 w-4 fill-current" />
                        Empezar Preparación
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleUpdateStatus(ticket.id, 'ready', ticket)}
                        className={`w-full py-6 ${cfg.btnClass} rounded-xl! font-extrabold flex justify-center items-center gap-2 transition-all text-lg tracking-wide active:scale-[0.98]`}
                      >
                        <CheckCircle2 className="h-5 w-5" strokeWidth={2.5} />
                        Marcar como Listo
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </main>

      {bulkConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => !bulkWorking && setBulkConfirmOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-ready-title"
            className="bg-zinc-900 rounded-2xl w-full max-w-md shadow-2xl shadow-black/60 border border-zinc-800 overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 sm:p-7">
              <h2 id="bulk-ready-title" className="text-sm font-bold text-zinc-400">
                ¿Marcar todo como listo?
              </h2>

              {/* El número manda: el riesgo de esta acción es cuánto se cierra. */}
              <div className="mt-1 flex items-baseline gap-2.5">
                <span className="text-5xl font-black text-white tracking-tight leading-none tabular-nums">
                  {ordersToMarkReady.length}
                </span>
                <span className="text-sm font-extrabold uppercase tracking-wider text-emerald-400">
                  {ordersToMarkReady.length === 1 ? 'pedido' : 'pedidos'}
                </span>
              </div>

              <div className="mt-5 border-y border-zinc-800 divide-y divide-zinc-800">
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-500">
                    Productos
                  </span>
                  <span className="font-mono text-sm font-bold text-zinc-200 tabular-nums">
                    {itemsToMarkCount}
                  </span>
                </div>
                {scheduledSkippedCount > 0 && (
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-500">
                      Programados más tarde
                    </span>
                    <span className="font-mono text-sm font-bold text-amber-400 tabular-nums">
                      {scheduledSkippedCount}
                      <span className="ml-1.5 font-sans text-[10px] uppercase tracking-wider text-amber-400/70">
                        sin marcar
                      </span>
                    </span>
                  </div>
                )}
              </div>

              <p className="mt-4 text-sm leading-relaxed text-zinc-400">
                {scheduledSkippedCount > 0
                  ? 'Los programados más tarde no se marcarán. Los clientes con correo reciben el aviso de pedido listo.'
                  : 'Los clientes con correo recibirán el aviso de pedido listo.'}
              </p>

              {bulkWorking && (
                <div className="mt-5">
                  <div className="mb-1.5 flex items-baseline justify-between text-[11px] font-bold text-zinc-400">
                    <span>Marcando {bulkProgress.done} de {bulkProgress.total}</span>
                    <span className="font-mono tabular-nums">
                      {bulkProgress.total > 0
                        ? Math.round((bulkProgress.done / bulkProgress.total) * 100)
                        : 0}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-[width] duration-200 ease-out"
                      style={{
                        width: `${bulkProgress.total > 0
                          ? (bulkProgress.done / bulkProgress.total) * 100
                          : 0}%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    No cierres esta pantalla: los pedidos ya marcados quedan guardados.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-2 border-t border-zinc-800 bg-zinc-950/60 p-4">
              {/* Sin variant="outline": esa variante usa --background, que sin
                  la clase .dark es blanco y convertía Cancelar en el elemento
                  más brillante del modal. Colores explícitos para que el botón
                  quede recesado y la atención esté en la acción principal. */}
              <Button
                className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-40"
                onClick={() => setBulkConfirmOpen(false)}
                disabled={bulkWorking}
              >
                Cancelar
              </Button>
              <Button
                className="flex-[1.4] rounded-xl bg-emerald-500 text-black hover:bg-emerald-400 font-extrabold"
                onClick={handleBulkMarkReady}
                disabled={bulkWorking}
              >
                {bulkWorking ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Marcando...
                  </>
                ) : (
                  <>
                    <CheckCheck className="mr-2 h-4 w-4" strokeWidth={3} />
                    Sí, marcar todo
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }

        @keyframes slideInUp {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes slideOutUp {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to   { opacity: 0; transform: translateY(-24px) scale(0.97); }
        }
        @keyframes blinkInverse {
          0%, 100% {
            filter: invert(0);
            -webkit-filter: invert(0);
          }
          50% {
            filter: invert(1);
            -webkit-filter: invert(1);
          }
        }
        .ticket-enter {
          animation: slideInUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .ticket-enter-pending {
          animation: slideInUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .ticket-enter-new {
          animation: slideInUp 0.35s ease-out, blinkInverse 0.8s ease-in-out 12 !important;
          will-change: filter, -webkit-filter;
        }
        .ticket-leave {
          animation: slideOutUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
};

export default KitchenView;
