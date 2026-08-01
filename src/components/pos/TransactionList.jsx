import React, { useState } from 'react';
import { Store, ShoppingBag, Globe, MessageCircle, Clock, CreditCard, Timer, CheckCircle2, Loader2, ReceiptText, Van, User, PaperBag, Printer, ExternalLink, CalendarClock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Modal from '../ui/Modal';
import PaymentModal from './PaymentModal';
import PrintableReceipt from './PrintableReceipt';
import { useAuth } from '../AuthContext';
import { supabase } from '../../lib/supabase';
import { fmt, getKitchenTime, getPaymentMethod, getStatusTag } from '../../utils/orderUtils';

const TransactionList = ({ orders, loading, onOrderUpdated }) => {
  const { organization } = useAuth();
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingPaymentOrder, setPendingPaymentOrder] = useState(null);
  const [isPaymentConfirmOpen, setIsPaymentConfirmOpen] = useState(false);

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
              <th className="px-8 py-3 w-48 text-xs font-semibold text-gray-500 uppercase tracking-wider">Orden</th>
              <th className="px-8 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Cliente</th>
              <th className="px-8 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Hora</th>
              <th className="px-8 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
              <th className="px-8 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Canal</th>
              <th className="px-8 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Envío</th>
              <th className="px-8 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Total</th>
              <th className="px-8 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Acción</th>
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
                return (
                  <tr
                    key={order.id}
                    onClick={() => handleOpenModal(order)}
                    className="border-b border-gray-50 hover:bg-gray-50 transition-colors text-sm cursor-pointer active:bg-gray-100 group"
                  >
                    <td className="px-8 py-5 text-base font-bold text-gray-900">
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
                      <span className="text-xs font-medium text-gray-500 truncate max-w-[150px]">
                        {order.customer_name}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col items-end">
                    {getStatusTag(order)}
                  </div>
                </div>

                {/* Middle: Order Details (Time, Payment, Kitchen) */}
                <div className="flex flex-wrap gap-3.5 items-center">
                  <Badge variant="grayOutline">
                    <Clock className="w-3.5 h-3.5" />
                    {formattedDate}
                  </Badge>
                  <Badge
                    title={order.payments?.find(p => p.reference_code)?.reference_code ? `ID Klap: ${order.payments.find(p => p.reference_code).reference_code}` : ''}
                    variant={order.payments?.find(p => p.reference_code) ? 'info' : 'grayOutline'}
                    className={order.payments?.find(p => p.reference_code) ? 'cursor-help' : ''}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    {getPaymentMethod(order)}
                  </Badge>
                  {order.scheduled_at && (
                    <Badge variant="purple">
                      <CalendarClock className="w-3.5 h-3.5" />
                      {new Date(order.scheduled_at).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Badge>
                  )}
                  {order.ready_at && (
                    <Badge variant="warning">
                      <Timer className="w-3.5 h-3.5" />
                      Cocina: {getKitchenTime(order)}
                    </Badge>
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
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        maxWidth="max-w-2xl"
        fullScreenOnMobile={true}
        title={
          selectedOrder ? (
            <div className="flex items-start justify-between w-full pr-8">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Orden #{selectedOrder.order_number}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="h-3.5 w-3.5 text-gray-400" />
                  <p className="text-sm text-gray-500">
                    {new Date(selectedOrder.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })} a las {new Date(selectedOrder.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => {
                const originalTitle = document.title;
                document.title = `Orden_#${selectedOrder.order_number}`;
                window.print();
                document.title = originalTitle;
              }} className="shrink-0">
                <Printer className="w-4 h-4 mr-2" />
                Imprimir Ticket
              </Button>
            </div>
          ) : "Detalles de Orden"
        }
      >
        {selectedOrder && (
          <div className="flex flex-col h-full">
            {/* Contenido desplazable */}
            <div className="p-6 space-y-6">

              {/* Información General */}
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {getStatusTag(selectedOrder)}

                <Badge variant="grayOutline">
                  <CreditCard className="h-3.5 w-3.5" />
                  {getPaymentMethod(selectedOrder)}
                </Badge>

                <Badge variant="warning">
                  <Timer className="h-3.5 w-3.5" />
                  {getKitchenTime(selectedOrder) === '-' ? 'Sin tiempo' : getKitchenTime(selectedOrder)}
                </Badge>
              </div>

              {/* Día y hora del pedido programado */}
              {selectedOrder.scheduled_at && (
                (() => {
                  const d = new Date(selectedOrder.scheduled_at);
                  return (
                    <div className="bg-purple-50 border border-purple-200 rounded-xl px-3 py-2.5 flex items-center gap-3">
                      <CalendarClock className="h-4.5 w-4.5 text-purple-700 shrink-0" />
                      <p className="text-sm font-bold text-purple-900 capitalize leading-tight">
                        Programado: {d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })} a las{' '}
                        {d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} hrs
                      </p>
                    </div>
                  );
                })()
              )}

              {/* Detalles del Cliente */}
              {selectedOrder.customer_name && (
                <div>
                  <div className="flex items-center gap-2 mb-2 text-gray-900">
                    <User className="h-5 w-5 text-gray-400" />
                    <h3 className="font-bold text-lg">Detalles del Cliente</h3>
                  </div>
                  <p className="text-sm text-gray-900 font-medium">
                    {selectedOrder.customer_name}
                    {selectedOrder.customer_phone && <span className="text-gray-500 ml-1">({selectedOrder.customer_phone})</span>}
                  </p>
                </div>
              )}

              {/* Información de Despacho */}
              {selectedOrder.delivery_type && (
                <div>
                  {selectedOrder.delivery_type === 'delivery' ? (
                    <div>
                      <div className="flex items-center gap-2 mb-2 text-gray-900">
                        <Van className="h-5 w-5 text-gray-400" />
                        <h3 className="font-bold text-lg">Despacho a Domicilio</h3>
                      </div>
                      {selectedOrder.delivery_address ? (
                        <p className="text-sm text-gray-600 leading-relaxed">{selectedOrder.delivery_address}</p>
                      ) : (
                        <p className="text-sm text-gray-400 italic">Dirección no especificada</p>
                      )}
                      {selectedOrder.uber_tracking_url && (
                        <a
                          href={selectedOrder.uber_tracking_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-green-600 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg border border-green-200 transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Seguir delivery en vivo
                        </a>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2 mb-1 text-gray-900">
                        <PaperBag className="h-5 w-5 text-gray-400" />
                        <h3 className="font-bold text-lg">Retiro en Local</h3>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Notas del cliente */}
              {selectedOrder.notes && (
                <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <span className="text-amber-500 text-base shrink-0 mt-0.5">📝</span>
                  <div>
                    <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider mb-0.5">Nota del cliente</p>
                    <p className="text-sm text-amber-900 font-medium leading-relaxed">{selectedOrder.notes}</p>
                  </div>
                </div>
              )}

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
                          <div key={idx} className="flex flex-col py-2 border-b border-gray-50 last:border-0">
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
                                      + {item.order_item_ingredients.map(ing => ing.price > 0 ? `${ing.ingredient_name} (+$${fmt(Math.round(ing.price))})` : ing.ingredient_name).join(', ')}
                                    </p>
                                  )}
                                  <p className="text-xs text-gray-500 mt-0.5">${fmt(Math.round(item.unit_price))} c/u</p>
                                </div>
                              </div>
                              <span className="font-semibold text-gray-900 text-sm">
                                ${fmt(Math.round(item.unit_price) * item.quantity)}
                              </span>
                            </div>

                            {/* Componentes anidados del combo */}
                            {childItems.length > 0 && (
                              <div className="ml-11 mt-2 pl-3 border-l-2 border-gray-200 space-y-1">
                                {childItems.map((child, cIdx) => (
                                  <div key={cIdx} className="text-xs text-gray-500 font-medium">
                                    <span className="font-bold text-gray-700">{child.quantity / item.quantity}x</span> {child.product_name}
                                    {child.order_item_variants && child.order_item_variants.length > 0 && (
                                      <span className="text-gray-400"> ({child.order_item_variants[0].variant_option_name})</span>
                                    )}
                                    {child.order_item_ingredients && child.order_item_ingredients.length > 0 && (
                                      <span className="text-orange-500 ml-1">
                                        (+ {child.order_item_ingredients.map(i => i.price > 0 ? `${i.ingredient_name} (+$${fmt(Math.round(i.price))})` : i.ingredient_name).join(', ')})
                                      </span>
                                    )}
                                    {child.unit_price > 0 && (
                                      <span className="text-gray-400 font-bold ml-1">(+${fmt(Math.round(child.unit_price))})</span>
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
                {selectedOrder.delivery_fee > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>Despacho</span>
                    <span>${fmt(selectedOrder.delivery_fee || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-500">
                  <span>IVA (19%)</span>
                  <span>${fmt(selectedOrder.tax_amount || 0)}</span>
                </div>
              </div>
              <div className="flex justify-between items-end pt-4 border-t border-gray-200 mt-2">
                <div className="flex flex-col">
                  <span className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-1">Total</span>
                  <span className="font-black text-3xl text-gray-900 leading-none">${fmt(selectedOrder.total || 0)}</span>
                </div>

                <div>
                  {(() => {
                    const hasPending = selectedOrder.payments?.some(p => p.status === 'pending');
                    const isConfirmed = selectedOrder.payments?.some(p => p.status === 'paid');
                    if (isConfirmed) return (
                      <Badge variant="success">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Pagado
                      </Badge>
                    );
                    if (hasPending) return (
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => {
                          setPendingPaymentOrder(selectedOrder);
                          setIsPaymentConfirmOpen(true);
                        }}
                      >
                        Confirmar pago
                      </Button>
                    );
                    return null;
                  })()}
                </div>
              </div>
              
              {/* Printable Receipt (Hidden by default, shown when printing) */}
              <PrintableReceipt order={selectedOrder} organization={organization} />
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
    </>
  );
};

export default TransactionList;
