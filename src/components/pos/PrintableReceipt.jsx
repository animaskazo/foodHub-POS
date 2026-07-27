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
    <div ref={ref} className="print-receipt-container hidden">
      <div className="receipt-content">
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
        <div>
          <div className="receipt-order-number">#{order.order_number}</div>
          <div className="receipt-order-type">{order.delivery_type || order.order_type}</div>
          <div className="receipt-order-date">{formattedDate} - {formattedTime}</div>
        </div>

        <div className="receipt-divider"></div>

        {/* Customer Info */}
        {(order.customer_name || order.customer_phone || order.delivery_address) && (
          <div className="mb-4">
            <div className="receipt-section-title">Datos del Cliente</div>
            {order.customer_name && <p className="font-bold text-sm uppercase">{order.customer_name}</p>}
            {order.delivery_address && order.delivery_type === 'delivery' && (
              <p className="mt-1 leading-tight">{order.delivery_address}</p>
            )}
            {order.customer_phone && <p className="mt-1">Tel: {order.customer_phone}</p>}
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
              {order.order_items?.filter(i => !i.parent_item_id).map((item, idx) => (
                <React.Fragment key={idx}>
                  <tr>
                    <td className="align-top font-bold">{item.quantity}x</td>
                    <td className="align-top">
                      <div className="item-name">{item.product_name}</div>
                      {item.order_item_variants?.map((v, vidx) => (
                        <div key={`v-${vidx}`} className="text-xs pl-1 text-gray-800">- {v.variant_option_name}</div>
                      ))}
                      {item.order_item_ingredients?.map((ing, iidx) => (
                        <div key={`i-${iidx}`} className="text-xs pl-1 text-gray-800">+ {ing.ingredient_name}</div>
                      ))}
                    </td>
                    <td className="text-right align-top font-medium">${fmt(Math.round(item.unit_price) * item.quantity)}</td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="receipt-totals">
          <div className="flex justify-between mb-1">
            <span>Subtotal</span>
            <span>${fmt(order.subtotal || order.total - (order.delivery_fee || 0))}</span>
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

        {/* Payment */}
        <div className="text-center mb-6">
          <div className="receipt-section-title">Medio de Pago</div>
          <p className="font-bold text-sm uppercase">{getPaymentMethod(order)}</p>
        </div>

        {/* Footer & QR */}
        <div className="text-center flex flex-col items-center">
          {waLink ? (
            <div className="mb-4 flex flex-col items-center">
              <div className="bg-white p-2 border-2 border-black rounded-lg inline-block">
                <QRCodeSVG value={waLink} size={100} level="M" />
              </div>
              <p className="text-xs font-bold mt-2 uppercase tracking-wide">Escanear para WhatsApp</p>
            </div>
          ) : null}
          <p className="font-bold text-lg mb-1">¡Gracias por preferirnos!</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-2 border-t border-gray-300 pt-2 inline-block">Powered by FoodHub POS</p>
        </div>
      </div>
    </div>
  );
});

export default PrintableReceipt;
