import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { fmt, getPaymentMethod } from '../../utils/orderUtils';

const PrintableReceipt = React.forwardRef(({ order, organization }, ref) => {
  if (!order) return null;

  const date = new Date(order.created_at);
  const formattedDate = date.toLocaleDateString('es-CL');
  const formattedTime = date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

  // Format customer phone for WhatsApp link
  let waLink = '';
  if (order.customer_phone) {
    const cleanPhone = order.customer_phone.replace(/\D/g, '');
    const phoneWithCode = cleanPhone.startsWith('56') ? cleanPhone : `56${cleanPhone}`;
    waLink = `https://wa.me/${phoneWithCode}`;
  }

  return (
    <div ref={ref} className="print-receipt-container">
      <div className="receipt-content">
        {/* Order Type prominent at the very top */}
        <div className="receipt-order-type">
          {(() => {
            const actualType = ['online', 'whatsapp'].includes(order.order_type) ? order.delivery_type : order.order_type;
            if (actualType === 'delivery') return 'DELIVERY';
            if (actualType === 'pickup') return 'RETIRO EN LOCAL';
            if (actualType === 'table') return 'MESA';
            return actualType ? actualType.toUpperCase() : '';
          })()}
        </div>

        {/* Header Vanguardista */}
        <div className="receipt-header">
          {organization?.logo_url ? (
            <img src={organization.logo_url} alt="Logo" className="receipt-logo" />
          ) : (
            <div className="receipt-title-box">
              <h1 className="receipt-title">{organization?.name || 'FoodHub POS'}</h1>
            </div>
          )}
        </div>

        <div className="receipt-divider-solid"></div>

        {/* Order Info */}
        <div className="text-center mt-2 mb-4">
          <div className="receipt-order-number">#{order.order_number}</div>
          <div className="receipt-order-date">{formattedDate} - {formattedTime}</div>
        </div>

        <div className="receipt-divider"></div>

        {/* Customer Info */}
        {(order.customer_name || order.customer_phone || order.delivery_address) && (
          <div className="mb-4 flex justify-between items-start gap-2">
            <div className="flex-1">
              <div className="receipt-section-title">Datos del Cliente</div>
              {order.customer_name && <p className="font-bold text-sm uppercase">{order.customer_name}</p>}
              {order.delivery_address && (
                <p className="mt-1 leading-tight">{order.delivery_address}</p>
              )}
              {order.customer_phone && <p className="mt-1">Tel: {order.customer_phone}</p>}
            </div>
            {waLink && (
              <div className="flex flex-col items-center shrink-0">
                <div className="bg-white p-1 border border-black rounded inline-block">
                  <QRCodeSVG value={waLink} size={50} level="M" />
                </div>
                <p className="text-[8px] font-bold mt-1 uppercase tracking-tight text-center leading-none">WhatsApp</p>
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {order.notes && (
          <div className="mb-4">
            <div className="receipt-section-title">Comentarios</div>
            <p className="font-bold text-sm uppercase leading-tight bg-gray-100 p-2 rounded">{order.notes}</p>
          </div>
        )}

        {/* Items */}
        <div className="mb-4">
          <div className="receipt-section-title mb-2">Detalle de Compra</div>
          <table className="w-full text-left receipt-items">
            <thead>
              <tr>
                <th className="w-8">Cant</th>
                <th>Descripción</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.order_items?.filter(i => !i.parent_item_id).map((item, idx) => {
                const childItems = order.order_items.filter(child => child.parent_item_id === item.id);
                return (
                  <React.Fragment key={idx}>
                    <tr>
                      <td className="align-top font-bold">{item.quantity}x</td>
                      <td className="align-top">
                        <div className="item-name">{item.product_name}</div>
                        {item.order_item_variants?.map((v, vidx) => (
                          <div key={`v-${vidx}`} className="text-xs pl-1 text-gray-800">- {v.variant_option_name}</div>
                        ))}
                        {item.order_item_ingredients?.map((ing, iidx) => (
                          <div key={`i-${iidx}`} className="text-xs pl-1 text-gray-800">
                            + {ing.ingredient_name} {ing.price > 0 && `(+$${fmt(Math.round(ing.price))})`}
                          </div>
                        ))}
                        
                        {/* Nested combo items */}
                        {childItems.map((child, cIdx) => (
                          <div key={`c-${cIdx}`} className="text-xs pl-2 mt-0.5 border-l border-gray-400 ml-1">
                            {child.quantity / item.quantity}x {child.product_name}
                            {child.order_item_variants?.map(v => (
                              <span key={v.id}> ({v.variant_option_name})</span>
                            ))}
                            {child.order_item_ingredients?.map(ing => (
                              <span key={ing.id}> (+ {ing.ingredient_name} {ing.price > 0 && `(+$${fmt(Math.round(ing.price))})`})</span>
                            ))}
                            {child.unit_price > 0 && <span> (+${fmt(Math.round(child.unit_price))})</span>}
                          </div>
                        ))}
                      </td>
                      <td className="text-right align-top font-medium">${fmt(Math.round(item.unit_price) * item.quantity)}</td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="receipt-totals">
          <div className="flex justify-between mb-1">
            <span>Subtotal</span>
            <span>${fmt(order.total - (order.delivery_fee || 0))}</span>
          </div>
          {order.delivery_fee > 0 && (
            <div className="flex justify-between mb-1">
              <span>Despacho</span>
              <span>${fmt(order.delivery_fee)}</span>
            </div>
          )}
          <div className="receipt-total-row">
            <span>TOTAL</span>
            <span>${fmt(order.total)}</span>
          </div>
        </div>

        <div className="receipt-divider mt-4 mb-4"></div>

        {order.payments?.some(p => p.status === 'pending') ? (
          <div className="receipt-unpaid-warning">
            NO PAGADO<br/>COBRAR AL CLIENTE
          </div>
        ) : (
          <div className="text-center mb-6">
            <div className="receipt-section-title">Medio de Pago</div>
            <p className="font-bold text-sm uppercase">{getPaymentMethod(order)}</p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center flex flex-col items-center">
          <p className="font-bold text-lg mb-1">¡Gracias por preferirnos!</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-2 border-t border-gray-300 pt-2 inline-block">Powered by FoodHub POS</p>
        </div>
      </div>
    </div>
  );
});

export default PrintableReceipt;
