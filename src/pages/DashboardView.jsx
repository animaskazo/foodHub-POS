import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthContext';
import { activateDueScheduledOrders } from '../services/orderService';
import {
  TrendingUp,
  ShoppingCart,
  Receipt,
  Store,
  ShoppingBag as PaperBag,
  Globe,
  MessageCircle,
  Van,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Info,
  List,
  Columns3,
  ArrowRight,
  X
} from 'lucide-react';
import { InlineSpinner } from '@/components/ui/Spinner';
import PageHeader from '../components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import PrepTimeSelector from '../components/ui/PrepTimeSelector';
import StockNotifications from '../components/StockNotifications';
import OnboardingChecklist from '../components/dashboard/OnboardingChecklist';
import TransactionList from '../components/pos/TransactionList';
import PrintableReceipt from '../components/pos/PrintableReceipt';
import Sparkline from '../components/ui/Sparkline';
import Tooltip from '../components/ui/tooltip';
import DateRangePicker from '../components/ui/DateRangePicker';
import { useKitchenOrders } from '../hooks/useKitchenOrders';

const toLocalDateStr = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const DAILY_BOARD_WELCOME_KEY = 'foodhub-daily-board-welcome-v1';

const MobileMetricsSlider = ({ children }) => {
  const [active, setActive] = useState(0);
  const count = React.Children.count(children);
  const touchStart = useRef(null);

  const onTouchStart = (e) => {
    touchStart.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e) => {
    if (touchStart.current === null) return;
    const diff = touchStart.current - e.changedTouches[0].clientX;
    if (diff > 50 && active < count - 1) {
      setActive(prev => prev + 1);
    } else if (diff < -50 && active > 0) {
      setActive(prev => prev - 1);
    }
    touchStart.current = null;
  };

  return (
    <div 
      className="md:hidden w-full overflow-hidden mb-8"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div 
        className="flex gap-4 transition-transform duration-500 ease-in-out"
        style={{ transform: `translateX(calc(-${active} * (75vw + 1rem)))` }}
      >
        {React.Children.map(children, child => (
          <div className="w-[75vw] last:w-full shrink-0">
            {child}
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-2 mt-4">
        {Array.from({ length: count }).map((_, i) => (
          <button 
            key={i} 
            onClick={() => setActive(i)}
            className={`w-2 h-2 rounded-full transition-colors ${i === active ? 'bg-gray-800' : 'bg-gray-300'}`} 
            aria-label={`Ver diapositiva ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

const DashboardView = () => {
  const { organization, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState([]);
  const [totalVisits, setTotalVisits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [channelFilter, setChannelFilter] = useState('all'); // all, table, pickup, online, whatsapp
  const [showScheduled, setShowScheduled] = useState(false);
  const [kitchenStatusFilter, setKitchenStatusFilter] = useState('all'); // all, pending, preparing, ready, delivered, cancelled
  const [dailyRecordLayout, setDailyRecordLayout] = useState('table');
  const [showDailyBoardWelcome, setShowDailyBoardWelcome] = useState(false);
  const [activePreset, setActivePreset] = useState('today');
  const [rangeFrom, setRangeFrom] = useState(null);
  const [rangeTo, setRangeTo] = useState(null);
  const [onboardingPending, setOnboardingPending] = useState(false);
  const [bypassOnboardingBlur, setBypassOnboardingBlur] = useState(false);
  const dashboardBlurred = onboardingPending && !bypassOnboardingBlur;
  

  const [weeklySparklines, setWeeklySparklines] = useState({ revenue: [], orders: [], ticket: [], visits: [] });
  const { latestNewOrder } = useKitchenOrders();
  const dailyColumnsRef = useRef(null);
  const touchStartXRef = useRef(null);
  const lastColumnNavigationRef = useRef(0);

  useEffect(() => {
    if (!window.localStorage.getItem(DAILY_BOARD_WELCOME_KEY)) {
      setShowDailyBoardWelcome(true);
    }
  }, []);

  const closeDailyBoardWelcome = (openColumns = false) => {
    window.localStorage.setItem(DAILY_BOARD_WELCOME_KEY, 'seen');
    setShowDailyBoardWelcome(false);
    if (openColumns) {
      setKitchenStatusFilter('all');
      setDailyRecordLayout('columns');
    }
  };

  const moveDailyColumn = useCallback((direction) => {
    const scroller = dailyColumnsRef.current;
    if (!scroller) return;
    const columns = Array.from(scroller.children);
    if (columns.length < 2) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const scrollerCenter = scrollerRect.left + scroller.clientWidth / 2;
    const currentIndex = columns.reduce((closestIndex, column, index) => {
      const rect = column.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const closestRect = columns[closestIndex].getBoundingClientRect();
      const closestCenter = closestRect.left + closestRect.width / 2;
      return Math.abs(center - scrollerCenter) < Math.abs(closestCenter - scrollerCenter) ? index : closestIndex;
    }, 0);
    const nextIndex = Math.max(0, Math.min(columns.length - 1, currentIndex + direction));
    if (nextIndex === currentIndex) return;

    const nextRect = columns[nextIndex].getBoundingClientRect();
    const left = scroller.scrollLeft + nextRect.left - scrollerRect.left - (scroller.clientWidth - nextRect.width) / 2;
    scroller.scrollTo({ left, behavior: 'smooth' });
  }, []);

  const handleDailyColumnsTouchStart = (event) => {
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
  };

  const handleDailyColumnsTouchEnd = (event) => {
    if (touchStartXRef.current === null) return;
    const deltaX = touchStartXRef.current - (event.changedTouches[0]?.clientX ?? touchStartXRef.current);
    touchStartXRef.current = null;
    if (Math.abs(deltaX) < 12) return;
    const now = Date.now();
    if (now - lastColumnNavigationRef.current < 350) return;
    lastColumnNavigationRef.current = now;
    moveDailyColumn(deltaX > 0 ? 1 : -1);
  };

  const handleDailyColumnsWheel = (event) => {
    const delta = event.shiftKey ? event.deltaY : event.deltaX;
    if (Math.abs(delta) < 8) return;
    event.preventDefault();
    const now = Date.now();
    if (now - lastColumnNavigationRef.current < 450) return;
    lastColumnNavigationRef.current = now;
    moveDailyColumn(delta > 0 ? 1 : -1);
  };

  const fetchSparklines = useCallback(async () => {
    if (!organization?.id) return;
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    let startOfRange = new Date();
    let numPoints = 7;

    if (rangeFrom && rangeTo && !activePreset) {
      startOfRange = new Date(rangeFrom);
      startOfRange.setHours(0, 0, 0, 0);
      endOfDay.setTime(rangeTo.getTime());
      endOfDay.setHours(23, 59, 59, 999);
      const diffDays = Math.round((endOfDay.getTime() - startOfRange.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      numPoints = Math.min(diffDays, 90);
    } else if (activePreset === 'today') {
      startOfRange.setHours(0, 0, 0, 0);
      numPoints = 24;
    } else if (activePreset === '7days') {
      startOfRange.setDate(startOfRange.getDate() - 6);
      startOfRange.setHours(0, 0, 0, 0);
      numPoints = 7;
    } else if (activePreset === '30days') {
      startOfRange.setDate(startOfRange.getDate() - 29);
      startOfRange.setHours(0, 0, 0, 0);
      numPoints = 30;
    }

    // Los límites se convierten con toISOString() (local → UTC exacto); no extender un día.
    const queryStart = new Date(startOfRange);
    const { data } = await supabase
      .from('orders')
      .select('created_at, total, status')
      .eq('organization_id', organization.id)
      .gte('created_at', queryStart.toISOString())
      .lte('created_at', endOfDay.toISOString())
      .order('created_at', { ascending: true });

    const validOrdersData = (data || []).filter(o => o.status !== 'cancelled');

    const dailyRevenue = new Array(numPoints).fill(0);
    const dailyOrders = new Array(numPoints).fill(0);

    validOrdersData.forEach(order => {
      const orderDate = new Date(order.created_at);
      let pointIndex = 0;

      if (activePreset === 'today') {
        pointIndex = orderDate.getHours();
      } else {
        const orderLocalDate = toLocalDateStr(orderDate);
        const startLocalDate = toLocalDateStr(startOfRange);
        pointIndex = Math.floor((new Date(orderLocalDate).getTime() - new Date(startLocalDate).getTime()) / (1000 * 60 * 60 * 24));
      }

      if (pointIndex >= 0 && pointIndex < numPoints) {
        dailyRevenue[pointIndex] += Number(order.total) || 0;
        dailyOrders[pointIndex] += 1;
      }
    });

    const dailyTicket = dailyRevenue.map((rev, i) => dailyOrders[i] > 0 ? Math.round(rev / dailyOrders[i]) : 0);

    // Fetch visits for sparkline
    const { data: visitsData } = await supabase
      .from('store_visits')
      .select('date, visit_count')
      .eq('organization_id', organization.id)
      .gte('date', toLocalDateStr(startOfRange))
      .lte('date', toLocalDateStr(endOfDay));

    const dailyVisits = new Array(numPoints).fill(0);
    if (visitsData) {
      visitsData.forEach(visit => {
        const visitDate = new Date(visit.date + 'T00:00:00');
        let pointIndex = 0;
        if (activePreset === 'today') {
          pointIndex = 12;
        } else {
          pointIndex = Math.floor((visitDate.getTime() - startOfRange.getTime()) / (1000 * 60 * 60 * 24));
        }
        if (pointIndex >= 0 && pointIndex < numPoints) {
          dailyVisits[pointIndex] += visit.visit_count;
        }
      });
    }

    setWeeklySparklines({
      revenue: dailyRevenue,
      orders: dailyOrders,
      ticket: dailyTicket,
      visits: dailyVisits
    });
  }, [organization?.id, activePreset, rangeFrom, rangeTo]);

  useEffect(() => {
    fetchSparklines();
  }, [fetchSparklines]);

  // Instant refresh when a new order arrives from online/WhatsApp or POS
  useEffect(() => {
    if (latestNewOrder) {
      fetchOrders(true);
      fetchSparklines();
    }
  }, [latestNewOrder, fetchSparklines]);

  useEffect(() => {
    if (authLoading) return;

    if (organization?.id) {
      fetchOrders();

      // Supabase Realtime subscription for instant updates on the dashboard
      const channel = supabase
        .channel('dashboard-orders-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders' },
          () => {
            fetchOrders(true);
            fetchSparklines();
          }
        )
        .subscribe();

      const interval = setInterval(() => {
        fetchOrders(true);
      }, 20000);

      return () => {
        supabase.removeChannel(channel);
        clearInterval(interval);
      };
    } else {
      setLoading(false);
      setError('No tienes una organización asignada.');
    }
  }, [organization?.id, authLoading, activePreset, rangeFrom, rangeTo, fetchSparklines]);

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
      if (rangeFrom && rangeTo && !activePreset) {
        startOfRange.setTime(rangeFrom.getTime());
        startOfRange.setHours(0, 0, 0, 0);
        endOfDay.setTime(rangeTo.getTime());
        endOfDay.setHours(23, 59, 59, 999);
      } else if (activePreset === 'today') {
        startOfRange.setHours(0, 0, 0, 0);
      } else if (activePreset === '7days') {
        startOfRange.setDate(startOfRange.getDate() - 6);
        startOfRange.setHours(0, 0, 0, 0);
      } else if (activePreset === '30days') {
        startOfRange.setDate(startOfRange.getDate() - 29);
        startOfRange.setHours(0, 0, 0, 0);
      }

      // Los límites se convierten con toISOString() (local → UTC exacto); no extender un día.
      const queryStart = new Date(startOfRange);

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
          discount_amount,
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
        .gte('created_at', queryStart.toISOString())
        .lte('created_at', endOfDay.toISOString())
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      const newOrders = data || [];
      setOrders(newOrders);

      // Fetch visits for the selected date range
      const { data: visitsData } = await supabase
        .from('store_visits')
        .select('visit_count')
        .eq('organization_id', organization.id)
        .gte('date', toLocalDateStr(startOfRange))
        .lte('date', toLocalDateStr(endOfDay));
      
      const totalVisitsCount = (visitsData || []).reduce((sum, v) => sum + (v.visit_count || 0), 0);
      setTotalVisits(totalVisitsCount);
      
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

    // Re-filter by the selected range: fetch extends 1 day back to compensate timezone,
    // so the list must exclude orders outside the real local window.
    const startLocal = new Date();
    const endLocal = new Date();
    if (rangeFrom && rangeTo && !activePreset) {
      startLocal.setTime(rangeFrom.getTime());
      startLocal.setHours(0, 0, 0, 0);
      endLocal.setTime(rangeTo.getTime());
      endLocal.setHours(23, 59, 59, 999);
    } else if (activePreset === '7days') {
      startLocal.setDate(startLocal.getDate() - 6);
      startLocal.setHours(0, 0, 0, 0);
      endLocal.setHours(23, 59, 59, 999);
    } else if (activePreset === '30days') {
      startLocal.setDate(startLocal.getDate() - 29);
      startLocal.setHours(0, 0, 0, 0);
      endLocal.setHours(23, 59, 59, 999);
    } else {
      startLocal.setHours(0, 0, 0, 0);
      endLocal.setHours(23, 59, 59, 999);
    }

    result = result.filter(order => {
      const t = new Date(order.created_at).getTime();
      return t >= startLocal.getTime() && t <= endLocal.getTime();
    });

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
  }, [orders, channelFilter, kitchenStatusFilter, showScheduled, organization?.hide_cancelled_orders, activePreset, rangeFrom, rangeTo]);

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
    if (rangeFrom && rangeTo && !activePreset) {
      const sMonth = rangeFrom.toLocaleDateString('es-ES', { month: 'long' });
      const eMonth = rangeTo.toLocaleDateString('es-ES', { month: 'long' });
      const sDay = rangeFrom.toLocaleDateString('es-ES', { day: 'numeric' });
      const eDay = rangeTo.toLocaleDateString('es-ES', { day: 'numeric' });
      if (sMonth === eMonth) return `Del ${sDay} al ${eDay} de ${eMonth}`;
      return `Del ${sDay} de ${sMonth} al ${eDay} de ${eMonth}`;
    }

    const end = new Date();
    const start = new Date();

    if (activePreset === 'today') {
      return `Hoy, ${end.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`;
    }

    if (activePreset === '7days') {
      start.setDate(start.getDate() - 6);
    } else {
      start.setDate(start.getDate() - 29);
    }

    const startMonth = start.toLocaleDateString('es-ES', { month: 'long' });
    const endMonth = end.toLocaleDateString('es-ES', { month: 'long' });
    const startDay = start.toLocaleDateString('es-ES', { day: 'numeric' });
    const endDay = end.toLocaleDateString('es-ES', { day: 'numeric' });

    if (startMonth === endMonth) {
      return `Del ${startDay} al ${endDay} de ${endMonth}`;
    } else {
      return `Del ${startDay} de ${startMonth} al ${endDay} de ${endMonth}`;
    }
  }, [activePreset, rangeFrom, rangeTo]);

  useDocumentTitle('Dashboard');

  return (
    <div className="bg-gray-50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title={
            <div className="flex w-full items-center justify-between gap-3">
              <span>Dashboard</span>
            </div>
          }
          subtitle={
            activePreset === 'today' ? 'Resumen de ventas del día de hoy.' :
              activePreset === '7days' ? 'Resumen de ventas de los últimos 7 días.' :
                'Resumen de ventas de los últimos 30 días.'
          }
          actions={
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-3">
                <PrepTimeSelector />
                <StockNotifications />
              </div>
            </div>
          }
        />

        {/* Configuración inicial: solo visible mientras falte algún paso */}
        <OnboardingChecklist onStatusChange={(pending) => {
          setOnboardingPending(pending);
          if (!pending) setBypassOnboardingBlur(false);
        }} />

        <div className="relative">
        <div
          aria-hidden={dashboardBlurred}
          className={dashboardBlurred
            ? 'pointer-events-none select-none blur-[6px] opacity-50 saturate-75 motion-safe:transition-all motion-safe:duration-300'
            : 'motion-safe:transition-all motion-safe:duration-300'}
        >
        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl border border-red-100">
            {error}
          </div>
        )}

        {/* Top Filters & Period Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain overscroll-y-none hide-scrollbar touch-pan-x">
            <Button
              className="shrink-0"
              size="xs"
              variant={channelFilter === 'all' && !showScheduled ? 'default' : 'secondary'}
              onClick={() => { setChannelFilter('all'); setShowScheduled(false); }}
            >
              Todos
            </Button>
            <Button
              className="shrink-0"
              size="xs"
              variant={channelFilter === 'table' ? 'default' : 'secondary'}
              onClick={() => { setChannelFilter('table'); setShowScheduled(false); }}
            >
              <Store className="h-3.5 w-3.5" aria-hidden="true" /> Local
            </Button>
            <Button
              className="shrink-0"
              size="xs"
              variant={channelFilter === 'pickup' ? 'default' : 'secondary'}
              onClick={() => { setChannelFilter('pickup'); setShowScheduled(false); }}
            >
              <PaperBag className="h-3.5 w-3.5" aria-hidden="true" /> Retiro
            </Button>
            <Button
              className="shrink-0"
              size="xs"
              variant={channelFilter === 'delivery' ? 'default' : 'secondary'}
              onClick={() => { setChannelFilter('delivery'); setShowScheduled(false); }}
            >
              <Van className="h-3.5 w-3.5" aria-hidden="true" /> Delivery
            </Button>
            <Button
              className="shrink-0"
              size="xs"
              variant={channelFilter === 'online' ? 'default' : 'secondary'}
              onClick={() => { setChannelFilter('online'); setShowScheduled(false); }}
            >
              <Globe className="h-3.5 w-3.5" aria-hidden="true" /> Online
            </Button>
            <Button
              className="shrink-0"
              size="xs"
              variant={channelFilter === 'whatsapp' ? 'default' : 'secondary'}
              onClick={() => { setChannelFilter('whatsapp'); setShowScheduled(false); }}
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> WhatsApp
            </Button>
            <Button
              className="shrink-0"
              size="xs"
              variant={showScheduled ? 'default' : 'secondary'}
              onClick={() => { setShowScheduled(!showScheduled); setChannelFilter('all'); }}
            >
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Programados
              {scheduledCount > 0 && (
                <span className={`ml-1.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${showScheduled ? 'bg-white/20 text-white' : 'bg-amber-400 text-black'}`}>
                  {scheduledCount}
                </span>
              )}
            </Button>
          </div>
        </div>

        {/* Metrics Cards (Slider on Mobile, Grid on Desktop) */}
        <div className="md:grid md:grid-cols-4 md:gap-6 md:mb-8">
          
          {/* Mobile: Slider */}
          <MobileMetricsSlider>
            {/* Ventas Totales Card */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 font-mono tracking-tight shadow-sm flex items-center justify-between w-full">
              <div>
                <div className="flex items-center gap-1.5 font-bold text-[12px] text-gray-900 mb-1 tracking-wider">
                  <div className="w-1.5 h-1.5 rounded-full bg-black"></div>
                  Ventas totales 
                  <Tooltip text={sparklineDateRangeText}>
                    <Info className="h-3.5 w-3.5 cursor-pointer" />
                  </Tooltip>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {loading ? <InlineSpinner size="md" /> : formatCurrency(metrics.totalRevenue)}
                </div>
              </div>
              <div className="pl-4">
                <Sparkline data={weeklySparklines.revenue} color="#000000" fillColor="#e5e7eb" width={70} height={30} />
              </div>
            </div>

            {/* Órdenes Totales Card */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 font-mono tracking-tight shadow-sm flex items-center justify-between w-full">
              <div>
                <div className="flex items-center gap-1.5 font-bold text-[12px] text-gray-900 mb-1 tracking-wider">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                  Órdenes totales 
                  <Tooltip text={sparklineDateRangeText}>
                    <Info className="h-3.5 w-3.5 cursor-pointer" />
                  </Tooltip>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {loading ? <InlineSpinner size="md" /> : metrics.totalOrders}
                </div>
              </div>
              <div className="pl-4">
                <Sparkline data={weeklySparklines.orders} color="#a855f7" fillColor="#f3e8ff" width={70} height={30} />
              </div>
            </div>

            {/* Ticket Promedio Card */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 font-mono tracking-tight shadow-sm flex items-center justify-between w-full">
              <div>
                <div className="flex items-center gap-1.5 font-bold text-[12px] text-gray-900 mb-1 tracking-wider">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                  Ticket promedio 
                  <Tooltip text={sparklineDateRangeText}>
                    <Info className="h-3.5 w-3.5 cursor-pointer" />
                  </Tooltip>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {loading ? <InlineSpinner size="md" /> : formatCurrency(metrics.averageTicket)}
                </div>
              </div>
              <div className="pl-4">
                <Sparkline data={weeklySparklines.ticket} color="#3b82f6" fillColor="#dbeafe" width={70} height={30} />
              </div>
            </div>

            {/* Visitas Card */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 font-mono tracking-tight shadow-sm flex items-center justify-between w-full">
              <div>
                <div className="flex items-center gap-1.5 font-bold text-[12px] text-gray-900 mb-1 tracking-wider">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                  Visitas totales
                  <Tooltip text={sparklineDateRangeText}>
                    <Info className="h-3.5 w-3.5 cursor-pointer" />
                  </Tooltip>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {loading ? <InlineSpinner size="md" /> : totalVisits}
                </div>
              </div>
              <div className="pl-4">
                <Sparkline data={weeklySparklines.visits} color="#10b981" fillColor="#d1fae5" width={70} height={30} />
              </div>
            </div>
          </MobileMetricsSlider>

          {/* Desktop: Grid directo */}
          <div className="hidden md:contents">
            <div className="bg-white p-5 rounded-2xl border border-gray-200 font-mono tracking-tight shadow-sm flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 font-bold text-[12px] text-gray-900 mb-1 tracking-wider">
                  <div className="w-1.5 h-1.5 rounded-full bg-black"></div>
                  Ventas totales 
                  <Tooltip text={sparklineDateRangeText}>
                    <Info className="h-3.5 w-3.5 cursor-pointer" />
                  </Tooltip>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {loading ? <InlineSpinner size="md" /> : formatCurrency(metrics.totalRevenue)}
                </div>
              </div>
              <div className="pl-4">
                <Sparkline data={weeklySparklines.revenue} color="#000000" fillColor="#e5e7eb" width={70} height={30} />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-200 font-mono tracking-tight shadow-sm flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 font-bold text-[12px] text-gray-900 mb-1 tracking-wider">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                  Órdenes totales 
                  <Tooltip text={sparklineDateRangeText}>
                    <Info className="h-3.5 w-3.5 cursor-pointer" />
                  </Tooltip>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {loading ? <InlineSpinner size="md" /> : metrics.totalOrders}
                </div>
              </div>
              <div className="pl-4">
                <Sparkline data={weeklySparklines.orders} color="#a855f7" fillColor="#f3e8ff" width={70} height={30} />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-200 font-mono tracking-tight shadow-sm flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 font-bold text-[12px] text-gray-900 mb-1 tracking-wider">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                  Ticket promedio 
                  <Tooltip text={sparklineDateRangeText}>
                    <Info className="h-3.5 w-3.5 cursor-pointer" />
                  </Tooltip>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {loading ? <InlineSpinner size="md" /> : formatCurrency(metrics.averageTicket)}
                </div>
              </div>
              <div className="pl-4">
                <Sparkline data={weeklySparklines.ticket} color="#3b82f6" fillColor="#dbeafe" width={70} height={30} />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-200 font-mono tracking-tight shadow-sm flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 font-bold text-[12px] text-gray-900 mb-1 tracking-wider">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                  Visitas totales
                  <Tooltip text={sparklineDateRangeText}>
                    <Info className="h-3.5 w-3.5 cursor-pointer" />
                  </Tooltip>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {loading ? <InlineSpinner size="md" /> : totalVisits}
                </div>
              </div>
              <div className="pl-4">
                <Sparkline data={weeklySparklines.visits} color="#10b981" fillColor="#d1fae5" width={70} height={30} />
              </div>
            </div>
          </div>

        </div>

        {/* Sales Record */}
        <div className="md:bg-white md:rounded-2xl md:border md:border-gray-200 overflow-hidden flex flex-col">
          {/* Toolbar */}
          <div className="pb-4 md:p-6 md:border-b flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-2">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-gray-900 whitespace-nowrap">Registro Diario</h2>
              <div className="flex items-center gap-1" role="group" aria-label="Cambiar vista del registro diario">
                <Tooltip text="Vista de listado">
                  <Button
                    type="button"
                    size="icon-xs"
                    variant={dailyRecordLayout === 'table' ? 'default' : 'ghost'}
                    className="border-0 shadow-none"
                    onClick={() => setDailyRecordLayout('table')}
                    aria-label="Vista de listado"
                    aria-pressed={dailyRecordLayout === 'table'}
                  >
                    <List className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </Tooltip>
                <Tooltip text="Vista de columnas por estado">
                  <Button
                    type="button"
                    size="icon-xs"
                    variant={dailyRecordLayout === 'columns' ? 'default' : 'ghost'}
                    className="border-0 shadow-none"
                    onClick={() => {
                      setKitchenStatusFilter('all');
                      setDailyRecordLayout('columns');
                    }}
                    aria-label="Vista de columnas por estado"
                    aria-pressed={dailyRecordLayout === 'columns'}
                  >
                    <Columns3 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </Tooltip>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:ml-auto flex-wrap justify-start sm:justify-end">
              <DateRangePicker
                from={rangeFrom}
                to={rangeTo}
                activePreset={activePreset}
                onSelect={(from, to) => {
                  setRangeFrom(from);
                  setRangeTo(to);
                }}
                onPresetChange={(preset) => {
                  setActivePreset(preset);
                  if (preset) {
                    setRangeFrom(null);
                    setRangeTo(null);
                  }
                }}
              />
              {dailyRecordLayout === 'table' && (
                <select
                  value={kitchenStatusFilter}
                  onChange={(e) => setKitchenStatusFilter(e.target.value)}
                  className="bg-white border border-gray-200 text-gray-700 rounded-lg px-2 py-1.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-gray-200 cursor-pointer appearance-none pr-6 transition-all"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.25rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.2em 1.2em' }}
                >
                  <option value="all">Todos</option>
                  <option value="scheduled">Programados</option>
                  <option value="pending">Pendientes</option>
                  <option value="preparing">Preparación</option>
                  <option value="ready">Listos</option>
                  <option value="delivered">Entregados</option>
                  <option value="cancelled">Cancelados</option>
                </select>
              )}
            </div>
          </div>
          
          {dailyRecordLayout === 'columns' ? (
            <div
              role="region"
              aria-label="Pedidos por estado. Desliza horizontalmente para cambiar de columna."
              ref={dailyColumnsRef}
              onWheel={handleDailyColumnsWheel}
              onTouchStart={handleDailyColumnsTouchStart}
              onTouchEnd={handleDailyColumnsTouchEnd}
              className="flex h-[calc(100dvh-260px)] min-h-[360px] snap-x snap-mandatory touch-pan-y items-stretch gap-3 overflow-x-auto overscroll-x-contain scroll-smooth px-0 pb-3 md:h-auto md:min-h-0 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:p-6 md:pt-4 lg:grid-cols-3"
            >
              {[
                { title: 'Pedidos recibidos', statuses: ['pending', 'confirmed'] },
                { title: 'Pedidos en preparación', status: 'preparing' },
                { title: 'Pedidos entregados', statuses: ['ready', 'delivered'] },
              ].map(({ title, status, statuses }) => {
                const statusOrders = filteredOrders.filter(order => statuses ? statuses.includes(order.status) : order.status === status);
                return (
                  <section key={status || title} className="flex h-full min-w-0 w-[82vw] max-w-[360px] shrink-0 snap-always snap-center flex-col rounded-xl border border-gray-200 bg-gray-50/70 p-3 md:h-auto md:w-auto md:max-w-none md:shrink md:snap-start">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-600 border border-gray-200">
                        {statusOrders.length}
                      </span>
                    </div>
                    <TransactionList
                      orders={statusOrders}
                      loading={loading}
                      forceCards
                      showCompletionChip={title === 'Pedidos entregados'}
                      showColumnActions
                      onOrderUpdated={() => fetchOrders(true)}
                    />
                  </section>
                );
              })}
            </div>
          ) : (
            <TransactionList
              orders={filteredOrders}
              loading={loading}
              onOrderUpdated={() => fetchOrders(true)}
            />
          )}
        </div>
        </div>
        {dashboardBlurred && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <Button
              type="button"
              onClick={() => setBypassOnboardingBlur(true)}
              className="pointer-events-auto inline-flex items-center bg-gray-900 text-white shadow-lg transition-colors hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
             variant="default" size="default">
              Ver dashboard
            </Button>
          </div>
        )}
        </div>
      </div>


      {showDailyBoardWelcome && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-gray-950/35 p-4 backdrop-blur-md"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeDailyBoardWelcome(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="daily-board-welcome-title"
            aria-describedby="daily-board-welcome-description"
            className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl"
          >
            <button
              type="button"
              onClick={() => closeDailyBoardWelcome(false)}
              aria-label="Cerrar bienvenida"
              className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-600 shadow-sm transition hover:bg-white hover:text-gray-900"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            <img
              src="/images/daily-orders-board.jpg"
              alt="Pedidos organizados en columnas por estado, con canal y tipo de despacho"
              className="aspect-[3/2] w-full object-cover"
            />
            <div className="px-6 pb-6 pt-5 sm:px-8 sm:pb-8">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Nueva vista</span>
              <h2 id="daily-board-welcome-title" className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">
                Tus pedidos, organizados por estado
              </h2>
              <p id="daily-board-welcome-description" className="mt-2 text-sm leading-6 text-gray-600">
                Revisa lo recibido, lo que está en preparación y lo listo o entregado. En el celular, desliza para avanzar de una columna a otra.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button type="button" onClick={() => closeDailyBoardWelcome(true)} className="gap-2">
                  Ver nueva vista
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" onClick={() => closeDailyBoardWelcome(false)}>
                  Más tarde
                </Button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default DashboardView;
