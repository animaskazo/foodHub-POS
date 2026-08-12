import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthContext';
import { getShiftSettings, getCurrentShift } from '../services/shiftService';
import { activateDueScheduledOrders } from '../services/orderService';
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
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import PrepTimeSelector from '../components/ui/PrepTimeSelector';
import StockNotifications from '../components/StockNotifications';
import TransactionList from '../components/pos/TransactionList';
import PrintableReceipt from '../components/pos/PrintableReceipt';
import Sparkline from '../components/ui/Sparkline';
import Tooltip from '../components/ui/tooltip';

const DashboardView = () => {
  const { organization, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [channelFilter, setChannelFilter] = useState('all'); // all, table, pickup, online, whatsapp
  const [showScheduled, setShowScheduled] = useState(false);
  const [kitchenStatusFilter, setKitchenStatusFilter] = useState('all'); // all, pending, preparing, ready, delivered, cancelled
  const [dateRange, setDateRange] = useState('today'); // today, 7days, 30days
  const [showMetricsMobile, setShowMetricsMobile] = useState(false);
  
  // Shifts State
  const [shiftSettings, setShiftSettings] = useState(null);
  const [currentShift, setCurrentShift] = useState(null);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [shiftModalType, setShiftModalType] = useState('open'); // 'open' or 'close'

  const [weeklySparklines, setWeeklySparklines] = useState({ revenue: [], orders: [], ticket: [] });

  useEffect(() => {
    if (!organization?.id) return;
    const fetchSparklines = async () => {
      const startOfRange = new Date();
      startOfRange.setDate(startOfRange.getDate() - 6);
      startOfRange.setHours(0, 0, 0, 0);
      
      const { data } = await supabase
        .from('orders')
        .select('created_at, total')
        .eq('organization_id', organization.id)
        .gte('created_at', startOfRange.toISOString())
        .order('created_at', { ascending: true });
        
      if (data) {
        // Group by day (0 to 6)
        const dailyRevenue = new Array(7).fill(0);
        const dailyOrders = new Array(7).fill(0);
        
        data.forEach(order => {
          const orderDate = new Date(order.created_at);
          orderDate.setHours(0, 0, 0, 0);
          const dayIndex = Math.floor((orderDate.getTime() - startOfRange.getTime()) / (1000 * 60 * 60 * 24));
          if (dayIndex >= 0 && dayIndex < 7) {
            dailyRevenue[dayIndex] += Number(order.total) || 0;
            dailyOrders[dayIndex] += 1;
          }
        });
        
        const dailyTicket = dailyRevenue.map((rev, i) => dailyOrders[i] > 0 ? rev / dailyOrders[i] : 0);
        
        setWeeklySparklines({
          revenue: dailyRevenue,
          orders: dailyOrders,
          ticket: dailyTicket
        });
      }
    };
    fetchSparklines();
  }, [organization?.id]);


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
      // Activar pedidos programados cuya hora ya llegó
      await activateDueScheduledOrders();

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
          scheduled_at,
          ready_at,
          notes,
          customer_name,
          customer_phone,
          delivery_type,
          delivery_address,
          delivery_fee,
          uber_delivery_id,
          uber_tracking_url,
          uber_status,
          order_items (*, order_item_variants(*), order_item_ingredients(*)),
          payments (*)
        `)
        .eq('organization_id', organization.id)
        .gte('created_at', startOfRange.toISOString())
        .lte('created_at', endOfDay.toISOString())
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      const newOrders = data || [];
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
    const hideCancelled = organization?.hide_cancelled_orders === true;
    if (hideCancelled) {
      result = result.filter(order => order.status !== 'cancelled');
    }
    const now = Date.now();
    if (channelFilter === 'delivery') {
      result = result.filter(order => order.delivery_type === 'delivery');
    } else if (channelFilter !== 'all') {
      result = result.filter(order => order.order_type === channelFilter);
    }
    if (showScheduled) {
      result = result.filter(order =>
        order.scheduled_at && new Date(order.scheduled_at).getTime() > now && (order.status === 'scheduled' || order.status === 'pending')
      );
      return result;
    }
    if (kitchenStatusFilter !== 'all') {
      result = result.filter(order => order.status === kitchenStatusFilter);
    }
    return result;
  }, [orders, channelFilter, kitchenStatusFilter, showScheduled, organization?.hide_cancelled_orders]);

  const scheduledCount = useMemo(() => {
    const now = Date.now();
    return orders.filter(o => o.scheduled_at && new Date(o.scheduled_at).getTime() > now && (o.status === 'scheduled' || o.status === 'pending')).length;
  }, [orders]);

  // Calculate Metrics
  const metrics = useMemo(() => {
    const totalRevenue = filteredOrders.reduce((sum, order) => sum + Number(order.total), 0);
    const totalOrders = filteredOrders.length;
    const averageTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    
    // Additional metrics for new UI
    const local = filteredOrders.filter(o => o.order_type === 'table').reduce((sum, o) => sum + Number(o.total), 0);
    const pickup = filteredOrders.filter(o => o.order_type === 'pickup').reduce((sum, o) => sum + Number(o.total), 0);
    const delivery = filteredOrders.filter(o => o.order_type === 'online' || o.delivery_type === 'delivery').reduce((sum, o) => sum + Number(o.total), 0);
    const whatsapp = filteredOrders.filter(o => o.order_type === 'whatsapp').reduce((sum, o) => sum + Number(o.total), 0);

    return { totalRevenue, totalOrders, averageTicket, local, pickup, delivery, whatsapp };
  }, [filteredOrders]);

  // Helper for formatting currency (assuming CLP for now, can be dynamic later)
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);
  };

  const sparklineDateRangeText = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);

    const startMonth = start.toLocaleDateString('es-ES', { month: 'long' });
    const endMonth = end.toLocaleDateString('es-ES', { month: 'long' });
    const startDay = start.toLocaleDateString('es-ES', { day: '2-digit' });
    const endDay = end.toLocaleDateString('es-ES', { day: '2-digit' });

    if (startMonth === endMonth) {
      return `Desde el ${startDay} al ${endDay} de ${endMonth}`;
    } else {
      return `Desde el ${startDay} de ${startMonth} al ${endDay} de ${endMonth}`;
    }
  }, []);

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
              <div className="hidden md:flex items-center gap-3">
                <PrepTimeSelector />
                <StockNotifications />
              </div>
              {renderShiftButton(false)}
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
            size="sm"
            variant={channelFilter === 'all' && !showScheduled ? 'default' : 'secondary'}
            onClick={() => { setChannelFilter('all'); setShowScheduled(false); }}
          >
            Todos
          </Button>
          <Button
            size="sm"
            variant={channelFilter === 'table' ? 'default' : 'secondary'}
            onClick={() => { setChannelFilter('table'); setShowScheduled(false); }}
          >
            <Store className="h-3.5 w-3.5 mr-1" /> Local
          </Button>
          <Button
            size="sm"
            variant={channelFilter === 'pickup' ? 'default' : 'secondary'}
            onClick={() => { setChannelFilter('pickup'); setShowScheduled(false); }}
          >
            <PaperBag className="h-3.5 w-3.5 mr-1" /> Retiro
          </Button>
          <Button
            size="sm"
            variant={channelFilter === 'delivery' ? 'default' : 'secondary'}
            onClick={() => { setChannelFilter('delivery'); setShowScheduled(false); }}
          >
            <Van className="h-3.5 w-3.5 mr-1" /> Delivery
          </Button>
          <Button
            size="sm"
            variant={channelFilter === 'online' ? 'default' : 'secondary'}
            onClick={() => { setChannelFilter('online'); setShowScheduled(false); }}
          >
            <Globe className="h-3.5 w-3.5 mr-1" /> Online
          </Button>
          <Button
            size="sm"
            variant={channelFilter === 'whatsapp' ? 'default' : 'secondary'}
            onClick={() => { setChannelFilter('whatsapp'); setShowScheduled(false); }}
          >
            <MessageCircle className="h-3.5 w-3.5 mr-1" /> WhatsApp
          </Button>
          <Button
            size="sm"
            variant={showScheduled ? 'default' : 'secondary'}
            onClick={() => { setShowScheduled(!showScheduled); setChannelFilter('all'); }}
          >
            <CalendarClock className="h-3.5 w-3.5 mr-1" /> Programados
            {scheduledCount > 0 && (
              <span className={`ml-1.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${showScheduled ? 'bg-white/20 text-white' : 'bg-amber-400 text-black'}`}>
                {scheduledCount}
              </span>
            )}
          </Button>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          
          {/* Ventas Totales Card */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 font-mono tracking-tight shadow-sm flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 font-bold text-[12px] text-gray-900 mb-1 tracking-wider">
                <div className="w-1.5 h-1.5 rounded-full bg-black"></div>
                Ventas totales 
                <Tooltip text={sparklineDateRangeText}>
                  <Info className="h-3.5 w-3.5 text-gray-400 cursor-pointer" />
                </Tooltip>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {loading ? <Loader2 className="h-6 w-6 animate-spin text-gray-300" /> : formatCurrency(metrics.totalRevenue)}
              </div>
            </div>
            <div className="pl-4">
              <Sparkline data={weeklySparklines.revenue} color="#000000" fillColor="#e5e7eb" width={70} height={30} />
            </div>
          </div>

          {/* Órdenes Totales Card */}
          <div className={`bg-white p-5 rounded-2xl border border-gray-200 font-mono tracking-tight shadow-sm flex items-center justify-between md:flex ${showMetricsMobile ? 'flex' : 'hidden'}`}>
            <div>
              <div className="flex items-center gap-1.5 font-bold text-[12px] text-gray-900 mb-1 tracking-wider">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                Órdenes totales 
                <Tooltip text={sparklineDateRangeText}>
                  <Info className="h-3.5 w-3.5 text-gray-400 cursor-pointer" />
                </Tooltip>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {loading ? <Loader2 className="h-6 w-6 animate-spin text-gray-300" /> : metrics.totalOrders}
              </div>
            </div>
            <div className="pl-4">
              <Sparkline data={weeklySparklines.orders} color="#a855f7" fillColor="#f3e8ff" width={70} height={30} />
            </div>
          </div>

          {/* Ticket Promedio Card */}
          <div className={`bg-white p-5 rounded-2xl border border-gray-200 font-mono tracking-tight shadow-sm flex items-center justify-between md:flex ${showMetricsMobile ? 'flex' : 'hidden'}`}>
            <div>
              <div className="flex items-center gap-1.5 font-bold text-[12px] text-gray-900 mb-1 tracking-wider">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                Ticket promedio 
                <Tooltip text={sparklineDateRangeText}>
                  <Info className="h-3.5 w-3.5 text-gray-400 cursor-pointer" />
                </Tooltip>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {loading ? <Loader2 className="h-6 w-6 animate-spin text-gray-300" /> : formatCurrency(metrics.averageTicket)}
              </div>
            </div>
            <div className="pl-4">
              <Sparkline data={weeklySparklines.ticket} color="#3b82f6" fillColor="#dbeafe" width={70} height={30} />
            </div>
          </div>

          {/* Mobile Toggle Button */}
          <button 
            onClick={() => setShowMetricsMobile(!showMetricsMobile)}
            className="md:hidden flex items-center justify-center gap-1.5 w-full py-2 bg-gray-50 text-gray-600 rounded-lg text-sm font-semibold hover:bg-gray-100 transition-colors"
          >
            {showMetricsMobile ? (
              <><ChevronUp className="h-4 w-4" /> Ocultar métricas</>
            ) : (
              <><ChevronDown className="h-4 w-4" /> Ver más detalles</>
            )}
          </button>
        </div>

        {/* Sales Record */}
        <div className="md:bg-white md:rounded-2xl md:border md:border-gray-200 overflow-hidden flex flex-col">
          {/* Toolbar */}
          <div className="pb-4 md:p-6 md:border-b flex justify-between items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Registro Diario</h2>
            <div className="flex items-center gap-2">
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="bg-white border border-gray-200 text-gray-700 rounded-lg px-3 py-1.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-gray-200 cursor-pointer appearance-none pr-8 transition-all"
                style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
              >
                <option value="today">Hoy</option>
                <option value="7days">Últimos 7 días</option>
                <option value="30days">Últimos 30 días</option>
              </select>
              <select
                value={kitchenStatusFilter}
                onChange={(e) => setKitchenStatusFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:border-gray-300"
              >
                <option value="all">Todos los estados</option>
                <option value="scheduled">Programados</option>
                <option value="pending">Pendientes</option>
                <option value="preparing">En preparación</option>
                <option value="ready">Listos</option>
                <option value="delivered">Entregados</option>
                <option value="cancelled">Cancelados</option>
              </select>
            </div>
          </div>
          
          <TransactionList 
            orders={filteredOrders} 
            loading={loading} 
            onOrderUpdated={() => fetchOrders(true)} 
          />
        </div>
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
