import React, { useState, useEffect } from 'react';
import { Search, ReceiptText, TrendingUp, RefreshCcw, Menu } from 'lucide-react';
import { getOrders } from '../../services/orderService';
import TransactionList from './TransactionList';

const TransactionsView = ({ onOpenMobileMenu }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchOrders = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    const data = await getOrders();
    setOrders(data);
    if (!isBackground) setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
    // Auto-refresh cada 10 segundos en segundo plano (sin blinking)
    const interval = setInterval(() => {
      fetchOrders(true);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const filteredOrders = orders.filter(order => 
    order.order_number.toLowerCase().includes(search.toLowerCase())
  );

  const totalVentas = orders.reduce((acc, order) => acc + (order.total || 0), 0);
  const totalTransacciones = orders.length;

  const fmt = (n) => n.toLocaleString('es-CL');

  return (
    <div className="flex flex-col w-full bg-gray-50 p-6 min-h-full">
      <div className="flex items-center justify-between mb-8">
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
          onClick={fetchOrders}
          className="flex items-center gap-2 p-2.5 md:px-4 md:py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors text-sm font-semibold text-gray-700 shadow-sm select-none"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <RefreshCcw className={`h-5 w-5 md:h-4 md:w-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline">Actualizar</span>
        </button>
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
