import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthContext';
import { 
  TrendingUp, 
  ShoppingCart, 
  Receipt,
  Filter,
  Loader2,
  Store,
  Smartphone,
  Globe,
  MessageCircle,
  Clock,
  CreditCard,
  ShoppingBag,
  ReceiptText
} from 'lucide-react';
import Modal from '../components/ui/Modal';

const DashboardView = () => {
  const { organization, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [channelFilter, setChannelFilter] = useState('all'); // all, table, pickup, online, whatsapp
  const [dateRange, setDateRange] = useState('today'); // today, 7days, 30days
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpenModal = (order) => {
    setSelectedOrder(order);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setTimeout(() => {
      setSelectedOrder(null);
    }, 300);
  };

  useEffect(() => {
    if (authLoading) return;
    
    if (organization?.id) {
      fetchOrders();
    } else {
      setLoading(false);
      setError('No tienes una organización asignada.');
    }
  }, [organization?.id, authLoading, dateRange]);

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
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
          order_items (*),
          payments (*)
        `)
        .eq('organization_id', organization.id)
        .gte('created_at', startOfRange.toISOString())
        .lte('created_at', endOfDay.toISOString())
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setOrders(data || []);
    } catch (err) {
      console.error('Error fetching today orders:', err);
      setError('No se pudieron cargar las ventas de hoy.');
    } finally {
      setLoading(false);
    }
  };

  // Filter orders based on selected channel
  const filteredOrders = useMemo(() => {
    if (channelFilter === 'all') return orders;
    return orders.filter(order => order.order_type === channelFilter);
  }, [orders, channelFilter]);

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
  const fmt = (n) => n.toLocaleString('es-CL');

  const getPaymentMethod = (order) => {
    const payment = order.payments?.[0];
    if (!payment) return '-';
    const methodMap = {
      cash: 'Efectivo',
      card: 'Tarjeta',
      transfer: 'Transferencia',
      online_gateway: 'Online',
      whatsapp_pay: 'WhatsApp'
    };
    return methodMap[payment.method] || payment.method;
  };

  const getStatusTag = (status) => {
    const statusMap = {
      pending: { label: 'Pendiente', classes: 'bg-gray-100 text-gray-700' },
      confirmed: { label: 'Confirmado', classes: 'bg-blue-100 text-blue-700' },
      preparing: { label: 'Preparando', classes: 'bg-orange-100 text-orange-700' },
      ready: { label: 'Listo', classes: 'bg-green-100 text-green-700' },
      delivered: { label: 'Entregado', classes: 'bg-purple-100 text-purple-700' },
      cancelled: { label: 'Cancelado', classes: 'bg-red-100 text-red-700' },
      refunded: { label: 'Reembolsado', classes: 'bg-red-100 text-red-700' },
    };
    
    const mapped = statusMap[status] || { label: status, classes: 'bg-gray-100 text-gray-700' };
    
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg font-medium text-xs ${mapped.classes}`}>
        {mapped.label}
      </span>
    );
  };

  // Helper for channel icons
  const getChannelIcon = (type) => {
    switch (type) {
      case 'table': return <Store className="h-4 w-4" />;
      case 'pickup': return <ShoppingCart className="h-4 w-4" />;
      case 'online': return <Globe className="h-4 w-4" />;
      case 'whatsapp': return <MessageCircle className="h-4 w-4" />;
      default: return <Filter className="h-4 w-4" />;
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {organization ? organization.name : 'Cargando Negocio...'}
          </h1>
          <p className="text-gray-500">
            {dateRange === 'today' ? 'Resumen de ventas del día de hoy.' : 
             dateRange === '7days' ? 'Resumen de ventas de los últimos 7 días.' : 
             'Resumen de ventas de los últimos 30 días.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <select 
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-lg font-semibold outline-none focus:ring-2 focus:ring-gray-200 cursor-pointer shadow-sm appearance-none pr-8 relative"
            style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
          >
            <option value="today">Hoy</option>
            <option value="7days">Últimos 7 días</option>
            <option value="30days">Últimos 30 días</option>
          </select>
          <Link to="/pos" className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition shadow-sm">
            Abrir POS
          </Link>
          <Link to="/kitchen" className="bg-orange-500 text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-orange-600 transition shadow-sm">
            KDS (Cocina)
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl border border-red-100">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar mb-6">
        <button 
          onClick={() => setChannelFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${channelFilter === 'all' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          Todos
        </button>
        <button 
          onClick={() => setChannelFilter('table')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${channelFilter === 'table' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          <Store className="h-4 w-4" /> Local
        </button>
        <button 
          onClick={() => setChannelFilter('pickup')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${channelFilter === 'pickup' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          <ShoppingCart className="h-4 w-4" /> Retiro
        </button>
        <button 
          onClick={() => setChannelFilter('online')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${channelFilter === 'online' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          <Globe className="h-4 w-4" /> Online
        </button>
        <button 
          onClick={() => setChannelFilter('whatsapp')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${channelFilter === 'whatsapp' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </button>
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
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-200">
          <div className="flex items-center gap-3 text-gray-500 mb-2">
            <ShoppingCart className="h-5 w-5 text-gray-900" />
            <span className="font-medium">Órdenes Totales</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {loading ? <Loader2 className="h-8 w-8 animate-spin text-gray-300" /> : metrics.totalOrders}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-200">
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
        <div className="pb-4 md:p-6 md:border-b">
          <h2 className="text-lg font-semibold text-gray-900">Registro Diario</h2>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-sm border-b border-gray-100">
                <th className="px-6 py-4 font-semibold w-24">N° Orden</th>
                <th className="px-6 py-4 font-semibold">Fecha</th>
                <th className="px-6 py-4 font-semibold">Estado</th>
                <th className="px-6 py-4 font-semibold">Método</th>
                <th className="px-6 py-4 font-semibold text-right">Subtotal</th>
                <th className="px-6 py-4 font-semibold text-right">IVA (19%)</th>
                <th className="px-6 py-4 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Cargando ventas...
                  </td>
                </tr>
              ) : filteredOrders.length > 0 ? (
                filteredOrders.map((order) => {
                  const date = new Date(order.created_at);
                  const formattedDate = date.toLocaleDateString('es-CL', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  });
                  return (
                    <tr 
                      key={order.id} 
                      onClick={() => handleOpenModal(order)}
                      className="border-b border-gray-50 hover:bg-gray-50 transition-colors text-sm cursor-pointer active:bg-gray-100 group"
                    >
                      <td className="px-6 py-4 font-semibold text-gray-900">#{order.order_number}</td>
                      <td className="px-6 py-4 text-gray-600">{formattedDate}</td>
                      <td className="px-6 py-4">
                        {getStatusTag(order.status)}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 text-gray-700 rounded-lg font-medium text-xs">
                          {getPaymentMethod(order)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-gray-600">${fmt(order.subtotal || 0)}</td>
                      <td className="px-6 py-4 text-right text-gray-600">${fmt(order.tax_amount || 0)}</td>
                      <td className="px-6 py-4 text-right font-bold text-gray-900">${fmt(order.total || 0)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                    No hay ventas registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View */}
        <div className="md:hidden flex flex-col gap-3 pb-8 px-4 mt-4">
          {loading ? (
            <div className="py-12 text-center text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Cargando ventas...
            </div>
          ) : filteredOrders.length > 0 ? (
            filteredOrders.map((order) => {
              const date = new Date(order.created_at);
              const formattedDate = date.toLocaleDateString('es-CL', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
              });
              return (
                <div 
                  key={order.id} 
                  onClick={() => handleOpenModal(order)}
                  className="bg-white p-4 rounded-xl border border-gray-200 flex justify-between items-center cursor-pointer hover:border-blue-300 active:bg-gray-50 transition-all select-none"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 text-lg">#{order.order_number}</span>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md font-medium">
                        {getPaymentMethod(order)}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">{formattedDate}</span>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="font-black text-gray-900 text-lg">${fmt(order.total || 0)}</span>
                    {getStatusTag(order.status)}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-gray-500">
              No hay ventas registradas.
            </div>
          )}
        </div>
      </div>
      
      {/* Modal de Detalles de Orden */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        maxWidth="max-w-lg"
        title={
          selectedOrder ? (
            <div>
              <h2 className="text-xl font-bold text-gray-900">Orden #{selectedOrder.order_number}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Clock className="h-3.5 w-3.5 text-gray-400" />
                <p className="text-sm text-gray-500">
                  {new Date(selectedOrder.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })} a las {new Date(selectedOrder.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ) : "Detalles de Orden"
        }
      >
        {selectedOrder && (
          <div className="flex flex-col h-full">
            {/* Contenido desplazable */}
            <div className="p-6 space-y-6">
              
              {/* Información General */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <div className="flex items-center gap-2 mb-2 text-gray-500">
                    <ReceiptText className="h-4 w-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Estado</span>
                  </div>
                  <div>
                    {getStatusTag(selectedOrder.status)}
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <div className="flex items-center gap-2 mb-2 text-gray-500">
                    <CreditCard className="h-4 w-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Pago</span>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-1 bg-white text-gray-700 rounded-lg font-bold text-sm border border-gray-200">
                    {getPaymentMethod(selectedOrder)}
                  </span>
                </div>
              </div>

              {/* Lista de Productos */}
              <div>
                <div className="flex items-center gap-2 mb-4 text-gray-900">
                  <ShoppingBag className="h-5 w-5 text-gray-400" />
                  <h3 className="font-bold text-lg">Productos</h3>
                </div>
                
                <div className="space-y-3">
                  {selectedOrder.order_items?.length > 0 ? (
                    selectedOrder.order_items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600 font-bold flex items-center justify-center text-sm">
                            {item.quantity}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 text-sm">
                              {item.product_name}
                              {item.order_item_variants && item.order_item_variants.length > 0 && (
                                <span className="text-gray-500 font-normal"> ({item.order_item_variants[0].variant_option_name})</span>
                              )}
                            </p>
                            {item.order_item_ingredients && item.order_item_ingredients.length > 0 && (
                              <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">
                                + {item.order_item_ingredients.map(ing => ing.ingredient_name).join(', ')}
                              </p>
                            )}
                            <p className="text-xs text-gray-500 mt-0.5">${fmt(Math.round(item.unit_price * 1.19))} c/u</p>
                          </div>
                        </div>
                        <span className="font-semibold text-gray-900 text-sm">
                          ${fmt(Math.round(item.total_price * 1.19))}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-400 text-sm italic">Detalle de productos no disponible.</p>
                  )}
                </div>
              </div>

            </div>

            {/* Footer con Totales */}
            <div className="bg-gray-50 p-6 border-t border-gray-100 mt-auto">
              <div className="space-y-2 mb-4 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Subtotal</span>
                  <span>${fmt(selectedOrder.subtotal || 0)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>IVA (19%)</span>
                  <span>${fmt(selectedOrder.tax_amount || 0)}</span>
                </div>
              </div>
              <div className="flex justify-between items-center text-lg font-black text-gray-900 pt-4 border-t border-gray-200">
                <span>Total</span>
                <span>${fmt(selectedOrder.total || 0)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default DashboardView;
