import React from 'react';

const formatCurrency = (value) => {
  return '$' + Number(value || 0).toLocaleString('es-CL');
};

const formatDateTime = (isoString) => {
  const date = new Date(isoString);
  return date.toLocaleString('es-CL', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit', 
    minute: '2-digit' 
  });
};

const PrintableShiftReport = ({ shift, salesData, reportedBalance, organization, closedBy, closedAt }) => {
  const startingBalance = Number(shift?.starting_balance || 0);
  const totalSales = Number(salesData?.totalSales || 0);
  const cashSales = Number(salesData?.cashSales || 0);
  const cardSales = Number(salesData?.cardSales || 0);
  const transferSales = Number(salesData?.transferSales || 0);
  const onlineSales = Number(salesData?.onlineSales || 0);
  const otherSales = Number(salesData?.otherSales || 0);
  const electronicSales = cardSales + transferSales + onlineSales + otherSales;
  const expectedCashInRegister = startingBalance + cashSales;
  const difference = Number(reportedBalance || 0) - expectedCashInRegister;
  const isShort = difference < 0;
  const isOver = difference > 0;

  return (
    <div className="receipt-content" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: '13px', lineHeight: '1.4', color: 'black', background: 'white', width: '76mm', margin: '0 auto', padding: '5mm 2mm' }}>
      <div className="receipt-header" style={{ textAlign: 'center', marginBottom: '5mm' }}>
        <div className="receipt-title-box" style={{ background: 'black', color: 'white', padding: '4mm 2mm', marginBottom: '2mm', borderRadius: '4px' }}>
          <h1 className="receipt-title" style={{ fontSize: '20px', fontWeight: '900', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
            REPORTE Z - CIERRE DE CAJA
          </h1>
        </div>
        
        {organization?.logo_url && (
          <img 
            src={organization.logo_url} 
            alt={organization.name} 
            className="receipt-logo" 
            style={{ maxWidth: '45mm', margin: '0 auto 3mm auto', display: 'block', filter: 'grayscale(100%) contrast(1.2)' }}
          />
        )}
        
        <div className="receipt-order-type" style={{ fontSize: '14px', fontWeight: '700', textAlign: 'center', textTransform: 'uppercase', marginTop: '3mm', marginBottom: '3mm', padding: '2mm 0', borderTop: '2px dashed #000', borderBottom: '2px dashed #000' }}>
          {organization?.name || 'FoodHub POS'}
        </div>
        
        <div className="receipt-address" style={{ textAlign: 'center', fontSize: '12px', fontWeight: '500', marginTop: '2mm' }}>
          {organization?.address || ''}
        </div>
        
        {organization?.phone && (
          <div className="receipt-address" style={{ textAlign: 'center', fontSize: '12px', marginTop: '1mm' }}>
            Tel: {organization.phone}
          </div>
        )}
      </div>

      <div className="receipt-divider" style={{ borderBottom: '1.5px dashed black', margin: '3mm 0' }} />

      <div className="receipt-section" style={{ marginBottom: '4mm' }}>
        <div className="receipt-section-title" style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1mm' }}>
          Información del Turno
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2mm', fontSize: '12px' }}>
          <span>Apertura:</span>
          <span style={{ fontWeight: '600' }}>{formatDateTime(shift?.start_time)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2mm', fontSize: '12px' }}>
          <span>Cierre:</span>
          <span style={{ fontWeight: '600' }}>{formatDateTime(closedAt)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2mm', fontSize: '12px' }}>
          <span>Abierto por:</span>
          <span style={{ fontWeight: '600' }}>{shift?.opened_by_name || 'Usuario'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2mm', fontSize: '12px' }}>
          <span>Cerrado por:</span>
          <span style={{ fontWeight: '600' }}>{closedBy || 'Usuario actual'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2mm', fontSize: '12px' }}>
          <span>Órdenes:</span>
          <span style={{ fontWeight: '600' }}>{salesData?.orderCount || 0}</span>
        </div>
      </div>

      <div className="receipt-divider" style={{ borderBottom: '1.5px dashed black', margin: '3mm 0' }} />

      <div className="receipt-section" style={{ marginBottom: '4mm' }}>
        <div className="receipt-section-title" style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1mm' }}>
          Desglose de Ventas
        </div>
        <table className="receipt-items" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr>
              <th style={{ fontWeight: 'bold', borderBottom: '1.5px solid black', paddingBottom: '2mm', textAlign: 'left' }}>Método</th>
              <th style={{ fontWeight: 'bold', borderBottom: '1.5px solid black', paddingBottom: '2mm', textAlign: 'right' }}>Monto</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '2mm 0 1mm 0', borderBottom: '1px dashed #999' }}>Efectivo</td>
              <td style={{ padding: '2mm 0 1mm 0', borderBottom: '1px dashed #999', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(cashSales)}</td>
            </tr>
            <tr>
              <td style={{ padding: '2mm 0 1mm 0', borderBottom: '1px dashed #999' }}>Tarjeta</td>
              <td style={{ padding: '2mm 0 1mm 0', borderBottom: '1px dashed #999', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(cardSales)}</td>
            </tr>
            <tr>
              <td style={{ padding: '2mm 0 1mm 0', borderBottom: '1px dashed #999' }}>Transferencia</td>
              <td style={{ padding: '2mm 0 1mm 0', borderBottom: '1px dashed #999', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(transferSales)}</td>
            </tr>
            <tr>
              <td style={{ padding: '2mm 0 1mm 0', borderBottom: '1px dashed #999' }}>Online</td>
              <td style={{ padding: '2mm 0 1mm 0', borderBottom: '1px dashed #999', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(onlineSales)}</td>
            </tr>
            {otherSales > 0 && (
              <tr>
                <td style={{ padding: '2mm 0 1mm 0', borderBottom: '1px dashed #999' }}>Otros</td>
                <td style={{ padding: '2mm 0 1mm 0', borderBottom: '1px dashed #999', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(otherSales)}</td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="receipt-total-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: '900', marginTop: '2mm', paddingTop: '2mm', borderTop: '2px solid black' }}>
          <span>TOTAL VENTAS</span>
          <span>{formatCurrency(totalSales)}</span>
        </div>
      </div>

      <div className="receipt-divider-solid" style={{ borderBottom: '2px solid black', margin: '3mm 0' }} />

      <div className="receipt-section" style={{ marginBottom: '4mm' }}>
        <div className="receipt-section-title" style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1mm' }}>
          Cuadre de Caja
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2mm', fontSize: '13px' }}>
          <span>Efectivo Inicial</span>
          <span style={{ fontWeight: '600' }}>{formatCurrency(startingBalance)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2mm', fontSize: '12px', color: '#666' }}>
          <span>+ Ventas en Efectivo</span>
          <span style={{ fontWeight: '600' }}>{formatCurrency(cashSales)}</span>
        </div>
        <div style={{ borderTop: '1px solid black', paddingTop: '2mm', display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold', marginBottom: '3mm' }}>
          <span>Efectivo Esperado</span>
          <span>{formatCurrency(expectedCashInRegister)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2mm', fontSize: '13px' }}>
          <span>Efectivo Declarado</span>
          <span style={{ fontWeight: '600' }}>{formatCurrency(reportedBalance)}</span>
        </div>
        <div style={{ borderTop: '2px solid black', paddingTop: '2mm', display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: '900', color: isShort ? '#dc2626' : isOver ? '#d97706' : '#059669' }}>
          <span>
            {isShort ? 'FALTANTE: ' : isOver ? 'SOBRANTE: ' : 'CUADRE EXACTO'}
          </span>
          <span>{formatCurrency(Math.abs(difference))}</span>
        </div>
      </div>

      <div className="receipt-divider-solid" style={{ borderBottom: '2px solid black', margin: '3mm 0' }} />

      <div className="receipt-section" style={{ marginBottom: '4mm' }}>
        <div className="receipt-section-title" style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1mm' }}>
          Resumen Final
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2mm', fontSize: '11px' }}>
          <div style={{ textAlign: 'center', padding: '2mm', background: '#f3f4f6', borderRadius: '4px' }}>
            <div style={{ color: '#6b7280', textTransform: 'uppercase', fontSize: '9px', fontWeight: '600', letterSpacing: '0.5px' }}>Total Ventas</div>
            <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{formatCurrency(totalSales)}</div>
          </div>
          <div style={{ textAlign: 'center', padding: '2mm', background: '#f3f4f6', borderRadius: '4px' }}>
            <div style={{ color: '#6b7280', textTransform: 'uppercase', fontSize: '9px', fontWeight: '600', letterSpacing: '0.5px' }}>Efectivo Neto</div>
            <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{formatCurrency(cashSales)}</div>
          </div>
          <div style={{ textAlign: 'center', padding: '2mm', background: '#f3f4f6', borderRadius: '4px' }}>
            <div style={{ color: '#6b7280', textTransform: 'uppercase', fontSize: '9px', fontWeight: '600', letterSpacing: '0.5px' }}>Electrónico</div>
            <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{formatCurrency(electronicSales)}</div>
          </div>
          <div style={{ textAlign: 'center', padding: '2mm', background: '#f3f4f6', borderRadius: '4px' }}>
            <div style={{ color: '#6b7280', textTransform: 'uppercase', fontSize: '9px', fontWeight: '600', letterSpacing: '0.5px' }}>En Caja (Final)</div>
            <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{formatCurrency(reportedBalance)}</div>
          </div>
        </div>
      </div>

      {organization?.footer && (
        <div style={{ textAlign: 'center', marginTop: '5mm', paddingTop: '3mm', borderTop: '1px dashed #999', fontSize: '11px', color: '#6b7280' }}>
          {organization.footer}
        </div>
      )}
    </div>
  );
};

export default PrintableShiftReport;