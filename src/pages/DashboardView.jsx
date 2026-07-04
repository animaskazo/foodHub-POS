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
  MessageCircle
} from 'lucide-react';

const DashboardView = () => {
  const { organization, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [channelFilter, setChannelFilter] = useState('all'); // all, table, pickup, online, whatsapp

  useEffect(() => {
    if (authLoading) return;
    
    if (organization?.id) {
      fetchTodayOrders();
    } else {
      setLoading(false);
      setError('No tienes una organización asignada.');
    }
  }, [organization?.id, authLoading]);

  const fetchTodayOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      // Get start and end of current day in local timezone
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const { data, error: fetchError } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          order_type,
          status,
          total,
          created_at
        `)
        .eq('organization_id', organization.id)
        .gte('created_at', startOfDay.toISOString())
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

  // Helper for status colors
  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-blue-100 text-blue-800',
      preparing: 'bg-purple-100 text-purple-800',
      ready: 'bg-green-100 text-green-800',
      delivered: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-red-100 text-red-800',
      refunded: 'bg-red-50 text-red-600'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
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
          <p className="text-gray-500">Resumen de ventas del día de hoy.</p>
        </div>
        <div className="flex flex-wrap gap-3">
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

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 text-gray-500 mb-2">
            <div className="p-2 bg-green-50 text-green-600 rounded-lg">
              <TrendingUp className="h-5 w-5" />
            </div>
            <span className="font-medium">Ventas de Hoy</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {loading ? <Loader2 className="h-8 w-8 animate-spin text-gray-300" /> : formatCurrency(metrics.totalRevenue)}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 text-gray-500 mb-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <span className="font-medium">Órdenes Totales</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {loading ? <Loader2 className="h-8 w-8 animate-spin text-gray-300" /> : metrics.totalOrders}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 text-gray-500 mb-2">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <Receipt className="h-5 w-5" />
            </div>
            <span className="font-medium">Ticket Promedio</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {loading ? <Loader2 className="h-8 w-8 animate-spin text-gray-300" /> : formatCurrency(metrics.averageTicket)}
          </div>
        </div>
      </div>

      {/* Sales Record & Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 md:px-6 md:py-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-gray-900">Registro Diario</h2>
          
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 hide-scrollbar">
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
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-gray-50 border-b text-sm font-medium text-gray-500">
                <th className="px-6 py-4">Orden #</th>
                <th className="px-6 py-4">Hora</th>
                <th className="px-6 py-4">Canal</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Cargando ventas...
                  </td>
                </tr>
              ) : filteredOrders.length > 0 ? (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {order.order_number}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600 capitalize">
                        {getChannelIcon(order.order_type)}
                        {order.order_type}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-gray-900">
                      {formatCurrency(order.total)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center">
                    <div className="text-gray-400 mb-2 flex justify-center">
                      <Receipt className="h-8 w-8" />
                    </div>
                    <p className="text-gray-500">No hay ventas registradas en este canal hoy.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
    </div>
  );
};

export default DashboardView;
