import React, { useState, useEffect } from 'react';
import { Search, ReceiptText, TrendingUp, RefreshCcw, X, Clock, CreditCard, ShoppingBag, Menu } from 'lucide-react';
import Modal from '../ui/Modal';
import { getOrders } from '../../services/orderService';

const TransactionsView = ({ onOpenMobileMenu }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
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

  return (
    <div className="flex flex-col h-full bg-gray-50 p-6 overflow-y-auto">
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
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <p className="text-gray-500 text-sm font-medium">Ventas Totales</p>
            <p className="text-2xl font-bold text-gray-900">${fmt(totalVentas)}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-200 flex items-center gap-4">
          <div className="w-12 h-12 bg-green-100 text-green-600 rounded-xl flex items-center justify-center">
            <ReceiptText className="h-6 w-6" />
          </div>
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

        {/* Desktop Table View */}
        <div className="hidden md:block flex-1 overflow-x-auto">
          <table className="w-full text-left border-collapse">
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
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-400">
                    Cargando transacciones...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-400">
                    No se encontraron transacciones.
                  </td>
                </tr>
              ) : (
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
                      className="border-b border-gray-50 hover:bg-gray-50 transition-colors text-sm cursor-pointer active:bg-gray-100"
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
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile/Simple Cards View */}
        <div className="md:hidden pb-8 space-y-3">
          {loading ? (
            <div className="text-center py-12 text-gray-400 font-medium">Cargando transacciones...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-gray-400 font-medium">No se encontraron transacciones.</div>
          ) : (
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
                  <div>{getStatusTag(selectedOrder.status)}</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <div className="flex items-center gap-2 mb-2 text-gray-500">
                    <CreditCard className="h-4 w-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Pago</span>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-1 bg-white text-gray-700 rounded-lg font-bold text-sm border border-gray-200 shadow-sm">
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
                            <p className="font-medium text-gray-900 text-sm">{item.product_name}</p>
                            <p className="text-xs text-gray-500">${fmt(Math.round(item.unit_price * 1.19))} c/u</p>
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
              <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                <span className="font-bold text-gray-900 text-lg">Total</span>
                <span className="font-black text-2xl text-blue-600">${fmt(selectedOrder.total || 0)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default TransactionsView;
