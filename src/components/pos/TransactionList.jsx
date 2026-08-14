import React, { useState } from 'react';
import { Store, ShoppingBag, Globe, MessageCircle, Clock, CreditCard, Timer, CheckCircle2, Loader2, ReceiptText, Van, User, PaperBag, Printer, ExternalLink, CalendarClock, Ban, Trash2, CheckSquare, Square, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Modal from '../ui/Modal';
import PaymentModal from './PaymentModal';
import AddressMap from './AddressMap';
import PrintableReceipt from './PrintableReceipt';
import { useAuth } from '../AuthContext';
import { supabase } from '../../lib/supabase';
import { updateOrderStatus, deleteOrder, bulkDeleteOrders, bulkCancelOrders } from '../../services/orderService';
import { fmt, getKitchenTime, getPaymentMethod, getStatusTag } from '../../utils/orderUtils';
import UberDeliveryCard from './UberDeliveryCard';
import OrderDetailModal from './OrderDetailModal';

const TransactionList = ({ orders, loading, onOrderUpdated }) => {
  const { organization, role, isSuperAdmin } = useAuth();
  const canCancel = role === 'owner' || role === 'admin' || isSuperAdmin;
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingPaymentOrder, setPendingPaymentOrder] = useState(null);
  const [isPaymentConfirmOpen, setIsPaymentConfirmOpen] = useState(false);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  
  // Selección masiva y eliminación
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isBulkCancelConfirmOpen, setIsBulkCancelConfirmOpen] = useState(false);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const toggleSelectAll = () => {
    if (selectedOrderIds.length === orders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(orders.map(o => o.id));
    }
  };

  const toggleSelectOrder = (e, orderId) => {
    e.stopPropagation();
    setSelectedOrderIds(prev =>
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

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

  const handleOpenPaymentConfirm = (e, order) => {
    e.stopPropagation();
    setPendingPaymentOrder(order);
    setIsPaymentConfirmOpen(true);
  };

  const handleClosePaymentConfirm = () => {
    setPendingPaymentOrder(null);
    setIsPaymentConfirmOpen(false);
  };

  const handleCancelOrder = async () => {
    if (!selectedOrder) return;
    setIsCancelling(true);
    try {
      await updateOrderStatus(selectedOrder.id, 'cancelled');
      setIsCancelConfirmOpen(false);
      handleCloseModal();
      if (onOrderUpdated) {
        await onOrderUpdated();
      }
    } catch (err) {
      console.error('Error cancelando pedido:', err);
      alert(`No se pudo cancelar el pedido: ${err.message || JSON.stringify(err)}`);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDeleteSingleOrder = async () => {
    if (!selectedOrder) return;
    setIsDeleting(true);
    try {
      await deleteOrder(selectedOrder.id);
      setIsDeleteConfirmOpen(false);
      handleCloseModal();
      if (onOrderUpdated) await onOrderUpdated();
    } catch (err) {
      console.error('Error eliminando pedido:', err);
      alert(`No se pudo eliminar el pedido: ${err.message || JSON.stringify(err)}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkCancel = async () => {
    if (selectedOrderIds.length === 0) return;
    setIsCancelling(true);
    try {
      await bulkCancelOrders(selectedOrderIds);
      setIsBulkCancelConfirmOpen(false);
      setSelectedOrderIds([]);
      if (onOrderUpdated) await onOrderUpdated();
    } catch (err) {
      console.error('Error cancelando pedidos masivamente:', err);
      alert(`Error al cancelar pedidos: ${err.message || JSON.stringify(err)}`);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedOrderIds.length === 0) return;
    setIsDeleting(true);
    try {
      await bulkDeleteOrders(selectedOrderIds);
      setIsBulkDeleteConfirmOpen(false);
      setSelectedOrderIds([]);
      if (onOrderUpdated) await onOrderUpdated();
    } catch (err) {
      console.error('Error eliminando pedidos masivamente:', err);
      alert(`Error al eliminar pedidos: ${err.message || JSON.stringify(err)}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmOnlinePayment = async (method) => {
    if (!pendingPaymentOrder) return;
    try {
      const payment = pendingPaymentOrder.payments?.find(p => p.status === 'pending');
      const now = new Date().toISOString();
      if (payment) {
        const { error } = await supabase
          .from('payments')
          .update({ method, status: 'paid', paid_at: now })
          .eq('id', payment.id);
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
      
      // Free table if applicable
      if (pendingPaymentOrder.table_id) {
        await supabase
          .from('restaurant_tables')
          .update({ status: 'free' })
          .eq('id', pendingPaymentOrder.table_id);
      }

      setIsPaymentConfirmOpen(false);
      setPendingPaymentOrder(null);
      if (onOrderUpdated) {
        await onOrderUpdated();
      }
    } catch (err) {
      console.error('Error confirmando pago:', err);
      alert(`No se pudo confirmar el pago: ${err.message || JSON.stringify(err)}`);
    }
  };

  return (
    <>
      {/* Vista de Escritorio - Tabla */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-100 mt-6 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {canCancel && (
                <th className="pl-6 pr-2 py-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={orders.length > 0 && selectedOrderIds.length === orders.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded text-black border-gray-300 focus:ring-black cursor-pointer"
                    title="Seleccionar todos"
                  />
                </th>
              )}
              <th className="px-6 py-3 w-44 text-xs font-semibold text-gray-500 uppercase tracking-wider">Orden</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Cliente</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Hora</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Canal</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Envío</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Total</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Acción</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" className="px-6 py-12 text-center text-gray-500">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Cargando ventas...
                </td>
              </tr>
            ) : orders.length > 0 ? (
              orders.map((order) => {
                const date = new Date(order.created_at);
                const day = String(date.getDate()).padStart(2, '0');
                const month = date.toLocaleDateString('es-CL', { month: 'long' });
                const monthCapitalized = month.charAt(0).toUpperCase() + month.slice(1);
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                const formattedDate = `${day}/${monthCapitalized} ${hours}:${minutes}`;
                const isChecked = selectedOrderIds.includes(order.id);
                return (
                  <tr
                    key={order.id}
                    onClick={() => handleOpenModal(order)}
                    className={`border-b border-gray-50 hover:bg-gray-50 transition-colors text-sm cursor-pointer active:bg-gray-100 group ${isChecked ? 'bg-amber-50/40 hover:bg-amber-50/70' : ''}`}
                  >
                    {canCancel && (
                      <td className="pl-6 pr-2 py-5 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => toggleSelectOrder(e, order.id)}
                          className="w-4 h-4 rounded text-black border-gray-300 focus:ring-black cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-6 py-5 text-base font-bold text-gray-900">
                      <span>{order.order_number}</span>
                    </td>
                    <td className="px-8 py-5">
                      {order.customer_name ? (
                        <span className="font-medium text-gray-900 leading-tight">{order.customer_name}</span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-8 py-5 text-gray-600">{formattedDate}</td>
                    <td className="px-8 py-5">
                      {getStatusTag(order)}
                    </td>
                    <td className="px-8 py-5">
                      {(() => {
                        const channelMap = {
                          table: { label: 'Local', Icon: Store },
                          takeaway: { label: 'Llevar', Icon: ShoppingBag },
                          pickup: { label: 'Retiro', Icon: ShoppingBag },
                          online: { label: 'Online', Icon: Globe },
                          whatsapp: { label: 'WhatsApp', Icon: MessageCircle },
                        };
                        const ch = channelMap[order.order_type];
                        if (!ch) return <span className="text-gray-400 text-xs">{order.order_type}</span>;
                        return (
                          <Badge variant="grayOutline">
                            <ch.Icon className="h-3.5 w-3.5" />
                            {ch.label}
                          </Badge>
                        );
                      })()}
                    </td>
                    <td className="px-8 py-5">
                      {order.order_type !== 'table' ? (
                        order.delivery_type === 'delivery' ? (
                          <span className="text-[11px] px-2 py-1 rounded font-black uppercase tracking-wider bg-amber-500 text-black flex items-center gap-1 w-fit">
                            <Van className="h-3.5 w-3.5 shrink-0" /> Delivery
                          </span>
                        ) : (
                          <span className="text-[11px] px-2 py-1 rounded font-bold uppercase tracking-wider bg-zinc-800 text-zinc-300 flex items-center gap-1 w-fit">
                            <ShoppingBag className="h-3.5 w-3.5 shrink-0" /> Retiro
                          </span>
                        )
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-8 py-5 text-right font-bold text-gray-900">${fmt(order.total || 0)}</td>
                    <td className="px-8 py-5 text-center">
                      {(() => {
                        const hasPending = order.payments?.some(p => p.status === 'pending');
                        const isConfirmed = order.payments?.some(p => p.status === 'paid');
                        if (isConfirmed) return (
                          <Badge variant="success">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Pagado
                          </Badge>
                        );
                        if (hasPending) return (
                          <div className="flex flex-col items-center gap-1.5">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-bold w-fit">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-60" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                              </span>
                              Pago pendiente
                            </span>
                            <Button
                              variant="secondary"
                              size="xs"
                              onClick={(e) => { e.stopPropagation(); handleOpenPaymentConfirm(e, order); }}
                            >
                              Confirmar pago
                            </Button>
                          </div>
                        );
                        return null;
                      })()}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="8" className="px-6 py-12 text-center text-gray-500">
                  No hay órdenes para los filtros seleccionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Vista Móvil - Tarjetas */}
      <div className="md:hidden flex flex-col gap-4 mt-4 w-full">
        {loading ? (
          <div className="py-12 text-center text-gray-500">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            Cargando ventas...
          </div>
        ) : orders.length > 0 ? (
          orders.map((order) => {
            const date = new Date(order.created_at);
            const day = String(date.getDate()).padStart(2, '0');
            const month = date.toLocaleDateString('es-CL', { month: 'long' });
            const monthCapitalized = month.charAt(0).toUpperCase() + month.slice(1);
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const formattedDate = `${day}/${monthCapitalized} ${hours}:${minutes}`;
            return (
              <div
                key={order.id}
                onClick={() => handleOpenModal(order)}
                className="bg-white/90 backdrop-blur-md border border-gray-200 rounded-2xl p-5 flex flex-col gap-4.5 cursor-pointer"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {/* Header: Order Number & Status */}
                <div className="flex justify-between items-start">
                  <div className="flex flex-col gap-1.5">
                    {order.order_type !== 'table' && (
                      <div className="flex items-center gap-2 mb-2">
                        {order.delivery_type === 'delivery' ? (
                          <span className="text-[11px] px-2 py-1 rounded font-black uppercase tracking-wider bg-amber-500 text-black flex items-center gap-1">
                            <Van className="h-3.5 w-3.5 shrink-0" /> Delivery
                          </span>
                        ) : (
                          <span className="text-[11px] px-2 py-1 rounded font-bold uppercase tracking-wider bg-zinc-800 text-zinc-300 flex items-center gap-1">
                            <PaperBag className="h-3.5 w-3.5 shrink-0" /> Retiro
                          </span>
                        )}
                      </div>
                    )}
                    <span className="font-black text-gray-900 text-2xl leading-none">{order.order_number}</span>
                    {order.customer_name && (
                      <span className="text-base font-bold text-gray-900 truncate max-w-[180px]">
                        {order.customer_name}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col items-end">
                    {getStatusTag(order)}
                  </div>
                </div>

                {/* Middle: Order Details (Time, Payment, Kitchen) */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-gray-700">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    {formattedDate}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-700">
                    <CreditCard className="w-3.5 h-3.5 shrink-0" />
                    {getPaymentMethod(order)}
                  </div>
                  {order.payments?.find(p => p.reference_code)?.reference_code && (
                    <div
                      title="ID de transacción Klap (clic para copiar)"
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(order.payments.find(p => p.reference_code).reference_code); }}
                      className="flex items-center gap-1.5 text-xs text-blue-700 cursor-pointer hover:underline w-fit"
                    >
                      <span className="font-bold">Klap:</span>
                      <span className="font-mono truncate max-w-[180px]">{order.payments.find(p => p.reference_code).reference_code}</span>
                    </div>
                  )}
                  {order.scheduled_at && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-700">
                      <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                      {(() => {
                        const d = new Date(order.scheduled_at);
                        const month = d.toLocaleDateString('es-CL', { month: 'long' });
                        return `Pedido programado para el ${d.getDate()} de ${month.charAt(0).toUpperCase() + month.slice(1)}`;
                      })()}
                    </div>
                  )}
                  {order.ready_at && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-700">
                      <Timer className="w-3.5 h-3.5 shrink-0" />
                      Cocina: {getKitchenTime(order)}
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="h-px bg-gray-100 w-full my-2.5"></div>

                {/* Bottom: Total & Actions */}
                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <div className="flex items-center mb-1">
                      {['online', 'whatsapp'].includes(order.order_type) && order.payments?.some(p => p.status === 'pending') ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-60" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
                          </span>
                          Pago pendiente
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Total</span>
                      )}
                    </div>
                    <span className="font-black text-xl leading-none text-gray-900">
                      ${fmt(order.total || 0)}
                    </span>
                  </div>

                  <div>
                    {['online', 'whatsapp'].includes(order.order_type) && (() => {
                      const hasPending = order.payments?.some(p => p.status === 'pending');
                      const isConfirmed = order.payments?.some(p => p.status === 'paid');
                      if (isConfirmed) return (
                        <Badge variant="success">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Pagado
                        </Badge>
                      );
                      if (hasPending) return (
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={(e) => { e.stopPropagation(); handleOpenPaymentConfirm(e, order); }}
                        >
                          Confirmar pago
                        </Button>
                      );
                      return null;
                    })()}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-12 text-gray-400 font-medium bg-white rounded-xl border border-gray-100">
            No hay órdenes registradas.
          </div>
        )}
      </div>

      {/* Modal de Detalles de Orden */}
      <OrderDetailModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        order={selectedOrder}
        organization={organization}
        canCancel={canCancel}
        onCancel={() => setIsCancelConfirmOpen(true)}
        onPrint={() => {
          const originalTitle = document.title;
          document.title = `Orden_#${selectedOrder.order_number}`;
          window.print();
          document.title = originalTitle;
        }}
        onConfirmPayment={(e, order) => { e.stopPropagation(); handleOpenPaymentConfirm(e, order); }}
      />

      {/* Ticket imprimible invisible */}
      {selectedOrder && (
        <PrintableReceipt order={selectedOrder} organization={organization} />
      )}

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

      {/* Modal confirmar cancelación de pedido individual */}
      <Modal
        isOpen={isCancelConfirmOpen}
        onClose={() => setIsCancelConfirmOpen(false)}
        title="Cancelar pedido"
        maxWidth="max-w-sm"
      >
        <div className="p-6">
          <p className="text-gray-600 mb-6">
            ¿Estás seguro de que deseas cancelar la orden <strong>#{selectedOrder?.order_number}</strong>?
            Al cancelarla, <strong>quedará fuera de los reportes y contabilidad de ventas</strong>.
          </p>
          <div className="flex gap-3">
            <Button
              onClick={() => setIsCancelConfirmOpen(false)}
              className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition-colors"
            >
              Volver
            </Button>
            <Button
              onClick={handleCancelOrder}
              disabled={isCancelling}
              className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-colors"
            >
              {isCancelling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Cancelar'
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal eliminar pedido individual */}
      <Modal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        title="Eliminar pedido definitivamente"
        maxWidth="max-w-sm"
      >
        <div className="p-6">
          <p className="text-gray-600 mb-6">
            ¿Estás seguro de que deseas <strong>eliminar permanentemente</strong> la orden <strong>#{selectedOrder?.order_number}</strong> de la base de datos?
            Esta acción la borrará por completo y no entrará en la contabilidad.
          </p>
          <div className="flex gap-3">
            <Button
              onClick={() => setIsDeleteConfirmOpen(false)}
              className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition-colors"
            >
              Volver
            </Button>
            <Button
              onClick={handleDeleteSingleOrder}
              disabled={isDeleting}
              className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-colors"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Eliminar Pedido'
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal cancelación masiva */}
      <Modal
        isOpen={isBulkCancelConfirmOpen}
        onClose={() => setIsBulkCancelConfirmOpen(false)}
        title="Cancelar pedidos seleccionados"
        maxWidth="max-w-sm"
      >
        <div className="p-6">
          <p className="text-gray-600 mb-6">
            ¿Estás seguro de que deseas cancelar <strong>{selectedOrderIds.length}</strong> {selectedOrderIds.length === 1 ? 'pedido' : 'pedidos'}?
            Las órdenes pasarán a estado cancelado y <strong>quedarán excluidas de la contabilidad</strong>.
          </p>
          <div className="flex gap-3">
            <Button
              onClick={() => setIsBulkCancelConfirmOpen(false)}
              className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition-colors"
            >
              Volver
            </Button>
            <Button
              onClick={handleBulkCancel}
              disabled={isCancelling}
              className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-colors"
            >
              {isCancelling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Cancelar'
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal eliminación masiva */}
      <Modal
        isOpen={isBulkDeleteConfirmOpen}
        onClose={() => setIsBulkDeleteConfirmOpen(false)}
        title="Eliminar pedidos seleccionados"
        maxWidth="max-w-sm"
      >
        <div className="p-6">
          <p className="text-gray-600 mb-6">
            ¿Estás seguro de que deseas <strong>eliminar definitivamente {selectedOrderIds.length} {selectedOrderIds.length === 1 ? 'pedido' : 'pedidos'}</strong> de la base de datos?
            Esta acción es irreversible y no entrarán en la contabilidad.
          </p>
          <div className="flex gap-3">
            <Button
              onClick={() => setIsBulkDeleteConfirmOpen(false)}
              className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition-colors"
            >
              Volver
            </Button>
            <Button
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-colors"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Eliminar Definitivamente'
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Barra Flotante de Acciones Masivas */}
      {selectedOrderIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-black text-white px-6 py-3.5 rounded-2xl shadow-2xl flex flex-wrap items-center gap-4 animate-in fade-in slide-in-from-bottom-5 border border-zinc-800">
          <span className="font-bold text-sm">
            {selectedOrderIds.length} {selectedOrderIds.length === 1 ? 'pedido seleccionado' : 'pedidos seleccionados'}
          </span>
          <div className="h-4 w-px bg-zinc-700 hidden sm:block" />
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              className="bg-red-600 hover:bg-red-700 text-white font-bold gap-1.5"
              onClick={() => setIsBulkCancelConfirmOpen(true)}
            >
              <XCircle className="w-3.5 h-3.5" />
              Cancelar
            </Button>
            <Button
              size="xs"
              className="bg-red-700 hover:bg-red-800 text-white font-bold gap-1.5"
              onClick={() => setIsBulkDeleteConfirmOpen(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar definitivamente
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className="text-zinc-400 hover:text-white"
              onClick={() => setSelectedOrderIds([])}
            >
              Deseleccionar
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

export default TransactionList;

