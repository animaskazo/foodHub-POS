import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CreditCard, Timer, User, Van, PaperBag, CalendarClock, ShoppingBag, CheckCircle2, Printer, XCircle, Info, Loader2, MapPin, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Modal from '../ui/Modal';
import AddressMap from './AddressMap';
import UberDeliveryCard from './UberDeliveryCard';
import { parseOrderLocation, reverseGeocode, shortAddressLabel } from '../../utils/geo';
import { fmt, getKitchenTime, getPaymentMethod, getStatusTag, isKlapPendingOrder } from '../../utils/orderUtils';

const OrderDetailModal = ({
  isOpen,
  onClose,
  order,
  organization,
  canCancel = false,
  userRole = '',
  onCancel,
  onPrint,
  onConfirmPayment,
  onReschedule,
}) => {
  const [isPrinting, setIsPrinting] = useState(false);
  const [locationLabel, setLocationLabel] = useState('');

  // Ubicación compartida por WhatsApp (viene en las notas como link de Google Maps).
  const location = useMemo(() => parseOrderLocation(order?.notes), [order?.notes]);
  const lat = location.coords?.lat;
  const lng = location.coords?.lng;

  // Nombre de la calle a partir de las coordenadas (se consulta desde el navegador).
  useEffect(() => {
    let active = true;
    setLocationLabel('');
    if (lat == null || lng == null || !isOpen) return undefined;
    reverseGeocode(lat, lng).then((result) => {
      if (active && result) setLocationLabel(shortAddressLabel(result));
    });
    return () => { active = false; };
  }, [lat, lng, isOpen]);

  if (!order) return null;

  // Con ubicación compartida, la dirección principal es la del mapa y lo que escribió
  // el cliente queda como referencia. Sin ubicación, se muestra lo que escribió.
  const typedAddress = (order.delivery_address || '').trim();
  const deliveryAddress = location.coords
    ? {
        primary: locationLabel || 'Ubicación compartida por WhatsApp',
        // "Ubicación compartida por WhatsApp" es lo que guarda el bot si el cliente omitió la referencia.
        reference: typedAddress && typedAddress !== locationLabel && !/^ubicaci[oó]n compartida/i.test(typedAddress)
          ? typedAddress
          : '',
        mapsUrl: location.mapsUrl,
      }
    : {
        primary: typedAddress,
        reference: '',
        mapsUrl: typedAddress
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(typedAddress)}`
          : null,
      };

  const canRequestUber = ['owner', 'admin', 'superadmin'].includes(userRole);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-5xl"
      fullScreenOnMobile={true}
      title={
        <div className="flex items-center justify-between w-full">
          <h2 className="text-3xl font-black text-gray-900">{order.order_number}</h2>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            {canCancel && order.status !== 'cancelled' && order.status !== 'delivered' && onCancel && (
              <Button size="sm" variant="destructive" onClick={onCancel} aria-label="Cancelar">
                <XCircle className="w-4 h-4" />
                <span className="hidden md:inline ml-1.5">Cancelar</span>
              </Button>
            )}
            {onPrint && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  setIsPrinting(true);
                  try {
                    await onPrint();
                  } finally {
                    setIsPrinting(false);
                  }
                }}
                disabled={isPrinting}
                aria-label="Imprimir Ticket"
              >
                {isPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                <span className="hidden md:inline ml-2">{isPrinting ? 'Preparando...' : 'Imprimir Ticket'}</span>
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className={`p-6 flex flex-col gap-6 ${order.delivery_type === 'delivery' ? 'lg:flex-row lg:gap-8' : ''}`}>

        {/* Columna izquierda: datos del cliente + mapa (solo delivery) */}
        <div className={`space-y-6 ${order.delivery_type === 'delivery' ? 'lg:w-[42%] lg:min-w-[300px] lg:shrink-0' : ''}`}>

          {/* Información General */}
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {getStatusTag(order)}

            <Badge
              variant="grayOutline"
              title={order.payments?.find(p => p.reference_code)?.reference_code ? `Klap ID: ${order.payments.find(p => p.reference_code).reference_code}` : undefined}
            >
              <CreditCard className="h-3.5 w-3.5" />
              {getPaymentMethod(order)}
            </Badge>

            <Badge variant="warning">
              <Timer className="h-3.5 w-3.5" />
              {getKitchenTime(order) === '-' ? 'Sin tiempo' : getKitchenTime(order)}
            </Badge>
          </div>

          {/* Detalles del Cliente */}
          {order.customer_name && (
            <div>
              <div className="flex items-center gap-2 mb-2 text-gray-900">
                <User className="h-5 w-5 text-gray-400" />
                <h3 className="font-bold text-lg">Detalles del Cliente</h3>
              </div>
              <p className="text-sm text-gray-900 font-medium">
                {order.customer_name}
                {order.customer_phone && <span className="text-gray-500 ml-1">({order.customer_phone})</span>}
              </p>
            </div>
          )}

          {/* Información de Despacho */}
          {order.delivery_type && (
            <div>
              {order.delivery_type === 'delivery' ? (
                <div>
                  <div className="flex items-center gap-2 mb-3 text-gray-900">
                    <Van className="h-5 w-5 text-gray-400" />
                    <h3 className="font-bold text-lg">Despacho a Domicilio</h3>
                  </div>

                  {/* Tarjeta de entrega: mapa + dirección + acción, todo junto */}
                  <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                    <div className="h-40 lg:h-48 w-full border-b border-gray-200">
                      <AddressMap address={order.delivery_address} coords={location.coords} />
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <MapPin className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-base font-semibold text-gray-900 leading-snug break-words">
                            {deliveryAddress.primary || <span className="text-gray-400 italic font-normal">Dirección no especificada</span>}
                          </p>
                          {deliveryAddress.reference && (
                            <p className="text-sm text-gray-500 mt-0.5 break-words">
                              Referencia: <span className="font-medium text-gray-700">{deliveryAddress.reference}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      {order.delivery_notes && (
                        <div className="flex items-start gap-3 text-sm">
                          <Info className="w-5 h-5 text-gray-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-gray-500 font-medium text-xs mb-0.5">Referencias de entrega</p>
                            <p className="text-gray-800 font-semibold break-words">{order.delivery_notes}</p>
                          </div>
                        </div>
                      )}

                      {deliveryAddress.mapsUrl && (
                        <a
                          href={deliveryAddress.mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100 transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Abrir en Google Maps
                        </a>
                      )}
                    </div>
                  </div>

                  <UberDeliveryCard order={order} organization={organization} canRequestUber={canRequestUber} />
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-1 text-gray-900">
                    <PaperBag className="h-5 w-5 text-gray-400" />
                    <h3 className="font-bold text-lg">Retiro en Local</h3>
                  </div>
                  {order.delivery_notes && (
                    <div className="flex items-start gap-3 text-sm mt-3 pt-3 border-t border-gray-100">
                      <Info className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-gray-500 font-medium text-xs mb-0.5">Referencias de entrega</p>
                        <p className="text-gray-800 font-semibold">{order.delivery_notes}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Columna derecha: información del pedido */}
        <div className={`space-y-6 ${order.delivery_type === 'delivery' ? 'flex-1 min-w-0' : ''}`}>

          {/* Pago Klap pendiente */}
          {isKlapPendingOrder(order) && (
            <div className="flex w-fit max-w-full items-start gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3.5">
              <AlertTriangle className="size-5 text-red-600 shrink-0 mt-px" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 leading-tight">Pago pendiente en Klap</p>
                <p className="text-[13px] text-gray-900 leading-relaxed mt-0.5">
                  No entró a cocina. Se cancela solo en 1 hora.
                </p>
                {(onConfirmPayment || (canCancel && onCancel)) && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {onConfirmPayment && (
                      <Button
                        size="sm"
                        onClick={(e) => onConfirmPayment(e, order)}
                      >
                        <CheckCircle2 />
                        Confirmar pago
                      </Button>
                    )}
                    {canCancel && onCancel && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={onCancel}
                      >
                        <XCircle />
                        Cancelar pedido
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Programado */}
          {order.scheduled_at && (
            (() => {
              const d = new Date(order.scheduled_at);
              return (
                <div className="bg-purple-100 border border-purple-200 rounded-xl px-3 py-2.5 flex items-center gap-3">
                  <CalendarClock className="h-4 w-4 text-purple-700 shrink-0" />
                  <p className="text-sm font-bold text-purple-700 leading-tight">
                    Programado: {d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })} a las{' '}
                    {d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} hrs
                  </p>
                </div>
              );
            })()
          )}

          {/* Notas del cliente */}
          {location.notes && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <span className="text-amber-500 text-base shrink-0 mt-0.5">📝</span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider mb-0.5">Nota del cliente</p>
                <p className="text-sm text-amber-900 font-medium leading-relaxed break-words">{location.notes}</p>
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
              {order.order_items?.length > 0 ? (
                order.order_items
                  .filter(item => !item.parent_item_id)
                  .map((item, idx) => {
                    const childItems = order.order_items.filter(child => child.parent_item_id === item.id);
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

          {/* Cálculo del Total */}
          <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
            <div className="space-y-2 mb-4 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal</span>
                <span>${fmt(order.subtotal || 0)}</span>
              </div>
              {Number(order.discount_amount) > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Descuento (cupón)</span>
                  <span>-${fmt(order.discount_amount)}</span>
                </div>
              )}
              {order.delivery_fee > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>Despacho</span>
                  <span>${fmt(order.delivery_fee || 0)}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-500">
                <span>IVA (19%)</span>
                <span>${fmt(order.tax_amount || 0)}</span>
              </div>
            </div>
            <div className="flex justify-between items-end pt-4 border-t border-gray-200 mt-2">
              <div className="flex flex-col">
                <span className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-1">Total</span>
                <span className="font-black text-3xl text-gray-900 leading-none">${fmt(order.total || 0)}</span>
              </div>

              <div>
                {(() => {
                  const hasPending = order.payments?.some(p => p.status === 'pending');
                  const isConfirmed = order.payments?.some(p => p.status === 'paid');
                  if (isConfirmed) return (
                    <Badge variant="success" className="text-sm px-3 py-1">
                      <CheckCircle2 className="w-4 h-4" /> Pagado
                    </Badge>
                  );
                  if (hasPending && onConfirmPayment) return (
                    <Button
                      size="xs"
                      onClick={(e) => onConfirmPayment(e, order)}
                    >
                      Confirmar pago
                    </Button>
                  );
                  return null;
                })()}
              </div>
            </div>
          </div>

          {/* Info de ID, Fecha y Hora */}
          <div className="flex flex-col items-center justify-center mt-2 text-[11px] text-gray-400 font-mono space-y-1 opacity-70">
            <div className="flex items-center gap-2">
              <span>ID: {order.id}</span>
            </div>
            <div className="flex items-center gap-2">
              <span>Fecha: {new Date(order.created_at).toLocaleDateString('es-CL')}</span>
              <span>•</span>
              <span>Hora: {new Date(order.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>

        </div>
      </div>
    </Modal>
  );
};

export default OrderDetailModal;
