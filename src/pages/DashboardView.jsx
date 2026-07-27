import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthContext';
import { getShiftSettings, getCurrentShift } from '../services/shiftService';
import ShiftModal from '../components/shifts/ShiftModal';
import {
  TrendingUp,
  ShoppingCart,
  Receipt,
  Loader2,
  Store,
  ShoppingBag as PaperBag,
  Globe,
  MessageCircle,
  Van,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import TransactionList from '../components/pos/TransactionList';
import PrintableReceipt from '../components/pos/PrintableReceipt';

const DashboardView = () => {
  const { organization, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [channelFilter, setChannelFilter] = useState('all'); // all, table, pickup, online, whatsapp
  const [kitchenStatusFilter, setKitchenStatusFilter] = useState('all'); // all, pending, preparing, ready, delivered, cancelled
  const [dateRange, setDateRange] = useState('today'); // today, 7days, 30days
  const [showMetricsMobile, setShowMetricsMobile] = useState(false);
  const [newOrderAlert, setNewOrderAlert] = useState(null);
  const [autoPrintOrder, setAutoPrintOrder] = useState(null);
  
  // Shifts State
  const [shiftSettings, setShiftSettings] = useState(null);
  const [currentShift, setCurrentShift] = useState(null);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [shiftModalType, setShiftModalType] = useState('open'); // 'open' or 'close'

  const audioCtxRef = useRef(null);
  const prevOrdersRef = useRef([]);

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
    if (authLoading) return;

    if (organization?.id) {
      loadShiftData();
      fetchOrders();
      const interval = setInterval(() => {
        fetchOrders(true);
        loadShiftData();
      }, 5000);
      return () => clearInterval(interval);
    } else {
      setLoading(false);
      setError('No tienes una organización asignada.');
    }
  }, [organization?.id, authLoading, dateRange]);

  const loadShiftData = async () => {
    try {
      const settings = await getShiftSettings(organization.id);
      setShiftSettings(settings);
      
      if (settings?.shifts_enabled) {
        const shift = await getCurrentShift(organization.id);
        setCurrentShift(shift);
      }
    } catch (err) {
      console.error('Error loading shift data:', err);
    }
  };

  const fetchOrders = async (isBackground = false) => {
    if (!isBackground) {
      setLoading(true);
      setError(null);
    }
    try {
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const startOfRange = new Date();
      if (dateRange === 'today') {
        startOfRange.setHours(0, 0, 0, 0);
      } else if (dateRange === '7days') {
        startOfRange.setDate(startOfRange.getDate() - 6);
        startOfRange.setHours(0, 0, 0, 0);
      } else if (dateRange === '30days') {
        startOfRange.setDate(startOfRange.getDate() - 29);
        startOfRange.setHours(0, 0, 0, 0);
      }

      const { data, error: fetchError } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          order_type,
          status,
          total,
          subtotal,
          tax_amount,
          created_at,
          ready_at,
          notes,
          customer_name,
          customer_phone,
          delivery_type,
          delivery_address,
          delivery_fee,
          order_items (*),
          payments (*)
        `)
        .eq('organization_id', organization.id)
        .gte('created_at', startOfRange.toISOString())
        .lte('created_at', endOfDay.toISOString())
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      const newOrders = data || [];
      if (isBackground && prevOrdersRef.current.length > 0) {
        const prevIds = new Set(prevOrdersRef.current.map(o => o.id));
        const arrived = newOrders.filter(o => !prevIds.has(o.id) && (o.status === 'confirmed' || o.status === 'pending'));
        if (arrived.length > 0) {
          playBellSound();
          setNewOrderAlert(arrived[0]);
          setTimeout(() => setNewOrderAlert(null), 6000);
          
          if (localStorage.getItem('pos_auto_print_enabled') === 'true') {
            setAutoPrintOrder(arrived[0]);
            // Allow React to render the new PrintableReceipt in DOM, then print
            setTimeout(() => {
              const originalTitle = document.title;
              document.title = `Orden_#${arrived[0].order_number}`;
              window.print();
              document.title = originalTitle;
            }, 500);
          }
        }
      }

      prevOrdersRef.current = newOrders;
      setOrders(newOrders);
    } catch (err) {
      if (!isBackground) setError('Error al cargar órdenes.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Filter orders based on selected channel and kitchen status
  const filteredOrders = useMemo(() => {
    let result = orders;
    if (channelFilter === 'delivery') {
      result = result.filter(order => order.delivery_type === 'delivery');
    } else if (channelFilter !== 'all') {
      result = result.filter(order => order.order_type === channelFilter);
    }
    if (kitchenStatusFilter !== 'all') {
      result = result.filter(order => order.status === kitchenStatusFilter);
    }
    return result;
  }, [orders, channelFilter, kitchenStatusFilter]);

  // Calculate Metrics
  const metrics = useMemo(() => {
    const totalRevenue = filteredOrders.reduce((sum, order) => sum + Number(order.total), 0);
    const totalOrders = filteredOrders.length;
    const averageTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return { totalRevenue, totalOrders, averageTicket };
  }, [filteredOrders]);

  // Helper for formatting currency (assuming CLP for now, can be dynamic later)
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);
  };


  useDocumentTitle('Dashboard');

  const renderShiftButton = (mobileOnly = false) => {
    if (!shiftSettings?.shifts_enabled) return null;
    
    return (
      <div className={mobileOnly ? "md:hidden" : "hidden md:block"}>
        {currentShift ? (
          <Button 
            onClick={() => { setShiftModalType('close'); setIsShiftModalOpen(true); }}
            className="flex items-center gap-2 bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 px-6 h-11 text-base"
          >
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
            </span>
            Turno Activo
          </Button>
        ) : (
          <Button 
            onClick={() => { setShiftModalType('open'); setIsShiftModalOpen(true); }}
            className="flex items-center gap-2 bg-black text-white hover:bg-gray-800 px-6 h-11 text-base"
          >
            <Store className="h-5 w-5" />
            Abrir Caja
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="bg-gray-50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title={
            <div className="flex items-center justify-between w-full gap-3 flex-wrap">
              <span>{organization ? organization.name : 'Cargando Negocio...'}</span>
              {renderShiftButton(true)}
            </div>
          }
          subtitle={
            dateRange === 'today' ? 'Resumen de ventas del día de hoy.' :
              dateRange === '7days' ? 'Resumen de ventas de los últimos 7 días.' :
                'Resumen de ventas de los últimos 30 días.'
          }
          actions={
            <div className="flex items-center gap-3">
              {renderShiftButton(false)}
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="fixed top-3 right-4 z-50 md:static bg-white border border-gray-200 text-gray-700 rounded-lg px-3 py-1.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-gray-200 cursor-pointer appearance-none pr-8 transition-all"
                style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
              >
                <option value="today">Hoy</option>
                <option value="7days">Últimos 7 días</option>
                <option value="30days">Últimos 30 días</option>
              </select>
            </div>
          }
        />

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl border border-red-100">
            {error}
          </div>
        )}



        {/* Filters */}
        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar mb-6">
          <Button
            variant={channelFilter === 'all' ? 'default' : 'secondary'}
            onClick={() => setChannelFilter('all')}
          >
            Todos
          </Button>
          <Button
            variant={channelFilter === 'table' ? 'default' : 'secondary'}
            onClick={() => setChannelFilter('table')}
          >
            <Store className="h-4 w-4 mr-1" /> Local
          </Button>
          <Button
            variant={channelFilter === 'pickup' ? 'default' : 'secondary'}
            onClick={() => setChannelFilter('pickup')}
          >
            <PaperBag className="h-4 w-4 mr-1" /> Retiro
          </Button>
          <Button
            variant={channelFilter === 'delivery' ? 'default' : 'secondary'}
            onClick={() => setChannelFilter('delivery')}
          >
            <Van className="h-4 w-4 mr-1" /> Delivery
          </Button>
          <Button
            variant={channelFilter === 'online' ? 'default' : 'secondary'}
            onClick={() => setChannelFilter('online')}
          >
            <Globe className="h-4 w-4 mr-1" /> Online
          </Button>
          <Button
            variant={channelFilter === 'whatsapp' ? 'default' : 'secondary'}
            onClick={() => setChannelFilter('whatsapp')}
          >
            <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
          </Button>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl border border-gray-200">
            <div className="flex items-center gap-3 text-gray-500 mb-2">
              <TrendingUp className="h-5 w-5 text-gray-900" />
              <span className="font-medium">
                Ventas {dateRange === 'today' ? 'de Hoy' : dateRange === '7days' ? '(7 días)' : '(30 días)'}
              </span>
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {loading ? <Loader2 className="h-8 w-8 animate-spin text-gray-300" /> : formatCurrency(metrics.totalRevenue)}
            </div>
            {/* Mobile Toggle Button inside the first card */}
            <button 
              onClick={() => setShowMetricsMobile(!showMetricsMobile)}
              className="md:hidden mt-4 flex items-center justify-center gap-1.5 w-full py-2 bg-gray-50 text-gray-600 rounded-lg text-sm font-semibold hover:bg-gray-100 transition-colors"
            >
              {showMetricsMobile ? (
                <><ChevronUp className="h-4 w-4" /> Ocultar métricas</>
              ) : (
                <><ChevronDown className="h-4 w-4" /> Ver más detalles</>
              )}
            </button>
          </div>

          <div className={`bg-white p-6 rounded-2xl border border-gray-200 md:block ${showMetricsMobile ? 'block' : 'hidden'}`}>
            <div className="flex items-center gap-3 text-gray-500 mb-2">
              <ShoppingCart className="h-5 w-5 text-gray-900" />
              <span className="font-medium">Órdenes Totales</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {loading ? <Loader2 className="h-8 w-8 animate-spin text-gray-300" /> : metrics.totalOrders}
            </div>
          </div>

          <div className={`bg-white p-6 rounded-2xl border border-gray-200 md:block ${showMetricsMobile ? 'block' : 'hidden'}`}>
            <div className="flex items-center gap-3 text-gray-500 mb-2">
              <Receipt className="h-5 w-5 text-gray-900" />
              <span className="font-medium">Ticket Promedio</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {loading ? <Loader2 className="h-8 w-8 animate-spin text-gray-300" /> : formatCurrency(metrics.averageTicket)}
            </div>
          </div>
        </div>

        {/* Sales Record */}
        <div className="md:bg-white md:rounded-2xl md:border md:border-gray-200 overflow-hidden flex flex-col">
          {/* Toolbar */}
          <div className="pb-4 md:p-6 md:border-b flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Registro Diario</h2>
            <select
              value={kitchenStatusFilter}
              onChange={(e) => setKitchenStatusFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:border-gray-300"
            >
              <option value="all">Todos los estados</option>
              <option value="pending">Pendientes</option>
              <option value="preparing">En preparación</option>
              <option value="ready">Listos</option>
              <option value="delivered">Entregados</option>
              <option value="cancelled">Cancelados</option>
            </select>
          </div>
          
          <TransactionList 
            orders={filteredOrders} 
            loading={loading} 
            onOrderUpdated={() => fetchOrders(true)} 
          />
        </div>
      </div>

      {/* New Order Toast Notification */}
      {newOrderAlert && (
        <div className="fixed bottom-24 right-6 w-80 bg-gray-900 text-white border border-gray-800 shadow-2xl rounded-2xl p-5 flex flex-col gap-3 z-50 animate-in slide-in-from-bottom-5">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <div className="flex items-center gap-3">
              <div>
                <h4 className="font-bold text-sm text-green-400">¡Nuevo Pedido!</h4>
                <p className="text-xs text-gray-400 capitalize">{newOrderAlert.order_type === 'table' ? 'Local' : newOrderAlert.order_type}</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-gray-400">Orden</span>
              <p className="text-2xl font-black leading-none">{newOrderAlert.order_number}</p>
            </div>
          </div>

          <div className="flex-1 space-y-2 max-h-32 overflow-hidden">
            {newOrderAlert.order_items?.slice(0, 3).map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-gray-300 truncate pr-2">
                  <span className="font-bold text-gray-400 mr-1">{item.quantity}x</span>
                  {item.product_name}
                </span>
                <span className="font-medium whitespace-nowrap">${(item.unit_price * item.quantity).toLocaleString('es-CL')}</span>
              </div>
            ))}
            {newOrderAlert.order_items?.length > 3 && (
              <p className="text-xs text-gray-500 italic">... y {newOrderAlert.order_items.length - 3} más</p>
            )}
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-gray-800 mt-1">
            <span className="font-medium text-gray-400 text-sm">Total</span>
            <span className="font-bold text-lg">${newOrderAlert.total?.toLocaleString('es-CL')}</span>
          </div>
        </div>
      )}
      {/* Printable Receipt for Auto-Printing New Orders */}
      <div className="hidden">
        <PrintableReceipt order={autoPrintOrder} organization={organization} />
      </div>

      <ShiftModal 
        isOpen={isShiftModalOpen} 
        onClose={() => setIsShiftModalOpen(false)} 
        type={shiftModalType} 
        settings={shiftSettings}
        organizationId={organization?.id}
        onSuccess={() => {
          setIsShiftModalOpen(false);
          loadShiftData();
        }}
        shiftId={currentShift?.id}
        totalSales={metrics.totalRevenue}
      />
    </div>
  );
};

export default DashboardView;
