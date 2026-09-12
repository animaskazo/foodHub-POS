import React from 'react';

// Segundo ticket: se imprime tras el corte del voucher.
// Sin número de pedido: solo saludo (si hay nombre de cliente) + mensaje
// personalizado del negocio + despedida.
const PrintableExtraTicket = React.forwardRef(({ organization, customerName, message }, ref) => {
  if (!message || !String(message).trim()) return null;

  const name = (customerName || '').trim();

  return (
    <div ref={ref} className="print-extra-ticket-container">
      <div className="receipt-content">
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

        <div className="text-center mt-4 mb-4">
          {name && (
            <p className="font-bold text-lg leading-tight mb-2">
              Hola {name},
            </p>
          )}
          <p className="text-sm leading-tight" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>
            {String(message).trim()}
          </p>
          <p className="font-bold text-lg mt-4">¡Gracias por su visita!</p>
        </div>

        <div className="receipt-divider mt-4 mb-4"></div>

        <div className="text-center">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest">Powered by FoodHub POS</p>
        </div>
      </div>
    </div>
  );
});

export default PrintableExtraTicket;
