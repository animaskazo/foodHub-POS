import React, { useState, useEffect } from 'react';
import { Search, ReceiptText, TrendingUp, RefreshCcw, X, Clock, CreditCard, ShoppingBag, Menu, Store, Globe, MessageCircle } from 'lucide-react';
import Modal from '../ui/Modal';
import { getOrders } from '../../services/orderService';
import { supabase } from '../../lib/supabase';
import PaymentModal from './PaymentModal';

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

  const [pendingPaymentOrder, setPendingPaymentOrder] = useState(null);
  const [isPaymentConfirmOpen, setIsPaymentConfirmOpen] = useState(false);

  const handleConfirmOnlinePayment = async (method) => {
    if (!pendingPaymentOrder) return;
    try {
      const payment = pendingPaymentOrder.payments?.find(p => p.status === 'pending');
      const now = new Date().toISOString();
      if (payment) {
        const { error } = await supabase
          .from('payments')
          .update({ method, status: 'paid', paid_at: now })
          .eq('order_id', pendingPaymentOrder.id)
          .eq('status', 'pending');
        if (error) throw error;
      } else {
        const { error } = await supabase.from('payments').insert({
          order_id: pendingPaymentOrder.id,
          method,
          amount: pendingPaymentOrder.total,
          status: 'paid',
          paid_at: now,
        });
        if (error) throw error;
      }
      setIsPaymentConfirmOpen(false);
      setPendingPaymentOrder(null);
      setIsModalOpen(false);
      setSelectedOrder(null);
      await fetchOrders();
    } catch (err) {
      console.error('Error confirmando pago:', err);
      alert(`No se pudo confirmar el pago: ${err.message || JSON.stringify(err)}`);
    }
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

  const getKitchenTime = (order) => {
    if (!order.ready_at) return '-';
    const start = new Date(order.created_at);
    const end = new Date(order.ready_at);
    const diffMins = Math.floor((end - start) / 60000);
    return diffMins < 1 ? '< 1 min' : `${diffMins} min`;
  };

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

        {/* Desktop Table View */}
        <div className="hidden md:block flex-1 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-sm border-b border-gray-100">
                <th className="px-6 py-4 font-semibold w-[10%]">N° Orden</th>
                <th className="px-6 py-4 font-semibold w-[20%]">Cliente</th>
                <th className="px-6 py-4 font-semibold w-[15%]">Fecha</th>
                <th className="px-6 py-4 font-semibold w-[12%]">Estado</th>
                <th className="px-6 py-4 font-semibold text-center w-[10%]">T. Cocina</th>
                <th className="px-6 py-4 font-semibold w-[10%]">Canal</th>
                <th className="px-6 py-4 font-semibold w-[10%]">Estado Pago</th>
                <th className="px-6 py-4 font-semibold w-[10%]">Método</th>
                <th className="px-6 py-4 font-semibold text-right w-[8%]">Total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" className="px-6 py-12 text-center text-gray-400">
                    Cargando transacciones...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-6 py-12 text-center text-gray-400">
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
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-gray-900 leading-tight">
                            {order.customer_name || <span className="text-gray-400">—</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{formattedDate}</td>
                      <td className="px-6 py-4">
                        {getStatusTag(order.status)}
                      </td>
                      <td className="px-6 py-4 text-center text-gray-600 font-medium whitespace-nowrap">{getKitchenTime(order)}</td>
                      <td className="px-6 py-4">
                        {(() => {
                          const channelMap = {
                            table:    { label: 'Local',    Icon: Store },
                            takeaway: { label: 'Llevar',   Icon: ShoppingBag },
                            pickup:   { label: 'Retiro',   Icon: ShoppingBag },
                            online:   { label: 'Online',   Icon: Globe },
                            whatsapp: { label: 'WhatsApp', Icon: MessageCircle },
                          };
                          const ch = channelMap[order.order_type];
                          if (!ch) return <span className="text-gray-400 text-xs">{order.order_type}</span>;
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-700 rounded-lg font-medium text-xs">
                              <ch.Icon className="h-3.5 w-3.5" />
                              {ch.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4">
                        {order.payments?.some(p => p.status === 'pending') ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-700 rounded-lg font-bold text-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                            Pendiente
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 bg-green-100 text-green-700 rounded-lg font-bold text-xs">
                            Pagado
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 text-gray-700 rounded-lg font-medium text-xs">
                          {getPaymentMethod(order)}
                        </span>
                      </td>
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
                    {order.customer_name && (
                      <span className="text-sm font-medium text-gray-900 mt-0.5">{order.customer_name}</span>
                    )}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {order.order_type === 'online' && (
                        <span className="inline-flex items-center px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-bold">
                          🌐 Online
                        </span>
                      )}
                      {order.order_type === 'online' && order.payments?.some(p => p.status === 'pending') && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                          Pago pendiente
                        </span>
                      )}
                    </div>
                    {order.ready_at && (
                      <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md font-semibold w-max border border-orange-100 mt-1">
                        Cocina: {getKitchenTime(order)}
                      </span>
                    )}
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
              <div className="grid grid-cols-3 gap-4">
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
                  <div className="flex flex-col gap-1 items-start">
                    <span className="inline-flex items-center px-2.5 py-1 bg-white text-gray-700 rounded-lg font-bold text-sm border border-gray-200 shadow-sm">
                      {getPaymentMethod(selectedOrder)}
                    </span>
                    {selectedOrder.payments?.some(p => p.status === 'pending') && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                        Pendiente
                      </span>
                    )}
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <div className="flex items-center gap-2 mb-2 text-gray-500">
                    <Clock className="h-4 w-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">T. Cocina</span>
                  </div>
                  <span className="font-bold text-gray-900 text-sm">
                    {getKitchenTime(selectedOrder)}
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
                    selectedOrder.order_items
                      .filter(item => !item.parent_item_id)
                      .map((item, idx) => {
                        const childItems = selectedOrder.order_items.filter(child => child.parent_item_id === item.id);
                        return (
                          <div key={idx} className="py-2.5 border-b border-gray-50 last:border-0">
                            <div className="flex justify-between items-center">
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
                                ${fmt(Math.round(item.unit_price * 1.19) * item.quantity)}
                              </span>
                            </div>

                            {/* Renderizar componentes del combo de forma anidada */}
                            {childItems.length > 0 && (
                              <div className="ml-11 mt-2 pl-3 border-l-2 border-gray-250 space-y-1">
                                {childItems.map((child, cIdx) => (
                                  <div key={cIdx} className="text-xs text-gray-500 font-medium">
                                    <span className="font-bold text-gray-700">{child.quantity / item.quantity}x</span> {child.product_name}
                                    {child.order_item_variants && child.order_item_variants.length > 0 && (
                                      <span className="text-gray-400"> ({child.order_item_variants[0].variant_option_name})</span>
                                    )}
                                    {child.order_item_ingredients && child.order_item_ingredients.length > 0 && (
                                      <span className="text-orange-500 ml-1">
                                        (+ {child.order_item_ingredients.map(i => i.ingredient_name).join(', ')})
                                      </span>
                                    )}
                                    {child.unit_price > 0 && (
                                      <span className="text-gray-400 font-bold ml-1">(+${fmt(Math.round(child.unit_price * 1.19))})</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
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
                <div>
                  <span className="font-bold text-gray-900 text-lg">Total</span>
                  {selectedOrder.payments?.some(p => p.status === 'pending') && (
                    <button
                      onClick={() => {
                        setPendingPaymentOrder(selectedOrder);
                        setIsPaymentConfirmOpen(true);
                      }}
                      className="ml-4 px-4 py-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-white rounded-lg font-bold text-sm transition-colors shadow-sm"
                    >
                      Marcar como Pagado
                    </button>
                  )}
                </div>
                <span className="font-black text-2xl text-blue-600">${fmt(selectedOrder.total || 0)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal confirmar pago online en caja */}
      {pendingPaymentOrder && (
        <PaymentModal
          isOpen={isPaymentConfirmOpen}
          onClose={() => { setIsPaymentConfirmOpen(false); setPendingPaymentOrder(null); }}
          cartItems={pendingPaymentOrder.order_items?.map(i => ({ price: i.unit_price, quantity: i.quantity })) || []}
          onConfirm={handleConfirmOnlinePayment}
          confirmOnly={true}
          confirmTotal={pendingPaymentOrder.total}
        />
      )}
    </div>
  );
};

export default TransactionsView;
