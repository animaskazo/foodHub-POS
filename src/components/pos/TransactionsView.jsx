import React, { useState, useEffect, useCallback } from 'react';
import { Search, ReceiptText, TrendingUp, RefreshCcw, Menu, CalendarDays, ChevronDown } from 'lucide-react';
import { getOrders } from '../../services/orderService';
import TransactionList from './TransactionList';

const PRESETS = [
  { key: 'today', label: 'Hoy' },
  { key: 'yesterday', label: 'Ayer' },
  { key: '7days', label: 'Últimos 7 días' },
  { key: '30days', label: 'Últimos 30 días' },
  { key: 'month', label: 'Este mes' },
  { key: 'prevMonth', label: 'Mes anterior' },
  { key: 'all', label: 'Todo' },
]

const getDateRange = (preset) => {
  const start = new Date()
  const end = new Date()
  end.setHours(23, 59, 59, 999)

  switch (preset) {
    case 'today':
      start.setHours(0, 0, 0, 0)
      return { start: start.toISOString(), end: end.toISOString() }
    case 'yesterday':
      start.setDate(start.getDate() - 1)
      start.setHours(0, 0, 0, 0)
      end.setDate(end.getDate() - 1)
      return { start: start.toISOString(), end: end.toISOString() }
    case '7days':
      start.setDate(start.getDate() - 6)
      start.setHours(0, 0, 0, 0)
      return { start: start.toISOString(), end: end.toISOString() }
    case '30days':
      start.setDate(start.getDate() - 29)
      start.setHours(0, 0, 0, 0)
      return { start: start.toISOString(), end: end.toISOString() }
    case 'month':
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      return { start: start.toISOString(), end: end.toISOString() }
    case 'prevMonth':
      start.setMonth(start.getMonth() - 1, 1)
      start.setHours(0, 0, 0, 0)
      end.setDate(0)
      end.setHours(23, 59, 59, 999)
      return { start: start.toISOString(), end: end.toISOString() }
    case 'all':
    default:
      return { start: null, end: null }
  }
}

const TransactionsView = ({ onOpenMobileMenu }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activePreset, setActivePreset] = useState('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const fetchOrders = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    let startISO = null;
    let endISO = null;

    if (customStart && customEnd) {
      startISO = new Date(customStart + 'T00:00:00').toISOString()
      endISO = new Date(customEnd + 'T23:59:59').toISOString()
    } else {
      const range = getDateRange(activePreset)
      startISO = range.start
      endISO = range.end
    }

    const data = await getOrders(startISO, endISO);
    setOrders(data);
    if (!isBackground) setLoading(false);
  }, [activePreset, customStart, customEnd]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(() => {
      fetchOrders(true);
    }, 30000);

    const handleReload = () => fetchOrders(true);
    window.addEventListener('reload-orders', handleReload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('reload-orders', handleReload);
    };
  }, [fetchOrders]);

  const handlePresetChange = (key) => {
    setActivePreset(key);
    setCustomStart('');
    setCustomEnd('');
    setShowCustom(false);
  };

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      setActivePreset('custom');
      fetchOrders();
    }
  };

  const filteredOrders = orders.filter(order => 
    order.order_number.toLowerCase().includes(search.toLowerCase())
  );

  const totalVentas = orders.reduce((acc, order) => acc + (order.total || 0), 0);
  const totalTransacciones = orders.length;

  const fmt = (n) => n.toLocaleString('es-CL');

  return (
    <div className="flex flex-col w-full bg-gray-50 p-6 min-h-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onPointerDown={onOpenMobileMenu}
            className="md:hidden p-2 rounded-lg text-gray-700 active:bg-gray-200 shrink-0 select-none bg-gray-100"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Menu className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Transacciones</h1>
            <p className="text-gray-500 text-sm">Gestiona y revisa todas tus ventas</p>
          </div>
        </div>
        <button
          onClick={() => fetchOrders()}
          className="flex items-center gap-2 p-2.5 md:px-4 md:py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors text-sm font-semibold text-gray-700 shadow-sm select-none"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <RefreshCcw className={`h-5 w-5 md:h-4 md:w-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline">Actualizar</span>
        </button>
      </div>

      {/* Date Range Selector */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-600">Período</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => handlePresetChange(p.key)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all select-none ${
                activePreset === p.key
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 active:bg-gray-100'
              }`}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setShowCustom(!showCustom)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all select-none flex items-center gap-1.5 ${
              activePreset === 'custom'
                ? 'bg-gray-900 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 active:bg-gray-100'
            }`}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            Rango personalizado
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showCustom ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {showCustom && (
          <div className="mt-3 flex flex-wrap items-center gap-3 bg-white p-3 rounded-xl border border-gray-200">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 font-medium">Desde</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 font-medium">Hasta</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>
            <button
              onClick={handleCustomApply}
              disabled={!customStart || !customEnd}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Aplicar
            </button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-gray-200 flex items-center gap-4">
          <TrendingUp className="h-8 w-8 text-gray-900" />
          <div>
            <p className="text-gray-500 text-sm font-medium">Ventas Totales</p>
            <p className="text-2xl font-bold text-gray-900">${fmt(totalVentas)}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-200 flex items-center gap-4">
          <ReceiptText className="h-8 w-8 text-gray-900" />
          <div>
            <p className="text-gray-500 text-sm font-medium">Transacciones</p>
            <p className="text-2xl font-bold text-gray-900">{totalTransacciones}</p>
          </div>
        </div>
      </div>

      {/* Transactions Table/Cards Area */}
      <div className="md:bg-white md:rounded-2xl md:border md:border-gray-200 flex flex-col flex-1 min-h-[400px]">
        <div className="py-4 md:p-4 md:border-b border-gray-100 flex items-center justify-between sticky top-0 bg-gray-50 md:bg-white z-10">
          <h2 className="text-lg font-bold text-gray-800">Transacciones</h2>
          <div className="relative w-40 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white md:bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
            />
          </div>
        </div>

        <TransactionList 
          orders={filteredOrders} 
          loading={loading} 
          onOrderUpdated={() => fetchOrders(true)} 
        />
      </div>
    </div>
  );
};

export default TransactionsView;
