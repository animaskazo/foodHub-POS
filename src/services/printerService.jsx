const PYTHON_API = 'http://localhost:8088';

const sendToPythonPrinter = async (printerName, order, organization) => {
  const payload = {
    store_name: organization?.name || '',
    store_address: organization?.address || '',
    store_phone: organization?.phone || '',
    store_footer: organization?.footer || '¡Gracias por su compra!',
    store_message: organization?.message || '',
    order_number: order?.id || order?.order_number || '',
    order_date: order?.created_at || order?.date || new Date().toLocaleString(),
    table_name: order?.table_name || order?.table || '',
    customer_name: order?.customer_name || order?.customer || '',
    items: (order?.items || []).map(item => ({
      name: item.name || item.product_name || 'Item',
      quantity: item.quantity || item.qty || 1,
      price: item.price || item.unit_price || 0,
    })),
    subtotal: order?.subtotal || 0,
    tax: order?.tax || 0,
    total: order?.total || order?.grand_total || 0,
    printer_name: printerName,
  };

  const response = await fetch(`${PYTHON_API}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Print failed');
  }

  return response.json();
};

export const initPrinterService = async () => {
  try {
    const res = await fetch(`${PYTHON_API}/health`);
    if (!res.ok) throw new Error('Print server not running');
    const data = await res.json();
    console.log('FoodHub Print Server connected:', data);
    return true;
  } catch (error) {
    console.error('Print server not available:', error);
    return false;
  }
};

export const getPrinters = async () => {
  try {
    const res = await fetch(`${PYTHON_API}/printers`);
    if (!res.ok) throw new Error('Failed to get printers');
    const data = await res.json();
    return data.printers || [];
  } catch (error) {
    console.error('Error getting printers:', error);
    return [];
  }
};

export const printReceipt = async (order, organization, printerName, _retry = false) => {
  if (!printerName) throw new Error('No hay impresora configurada');

  try {
    await sendToPythonPrinter(printerName, order, organization);
    console.log('Ticket impreso exitosamente en', printerName);
    return true;
  } catch (error) {
    console.error('Error al imprimir con Python Print Server:', error);

    if (!_retry) {
      console.log('Reintentando impresion...');
      try {
        await sendToPythonPrinter(printerName, order, organization);
        console.log('Ticket impreso exitosamente en (reintento)', printerName);
        return true;
      } catch (retryError) {
        console.error('Reintento de impresion tambien falló:', retryError);
        throw retryError;
      }
    }

    throw error;
  }
};

export const printReceiptAsPDF = async (order, organization) => {
  try {
    const printJS = (await import('print-js')).default;

    const receiptEl = document.querySelector('.print-receipt-container');
    if (!receiptEl) throw new Error('No se encontró el ticket en el DOM');
    if (!receiptEl.id) receiptEl.id = 'foodhub-print-ticket';

    printJS({
      printable: receiptEl.id,
      type: 'html',
      scanStyles: false,
      style: `
        @page { size: 80mm auto; margin: 0; }
        body { width: 80mm; margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.4; color: black; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        #foodhub-print-ticket { position: static !important; left: auto !important; top: auto !important; opacity: 1 !important; pointer-events: auto !important; z-index: auto !important; display: block !important; width: 80mm !important; margin: 0 !important; padding: 0 !important; background: white !important; }
        #foodhub-print-ticket, #foodhub-print-ticket * { visibility: visible !important; }

        /* ── Ticket ── */
        .receipt-content { width: 76mm; margin: 0 auto; padding: 5mm 2mm; }
        .receipt-header { text-align: center; margin-bottom: 5mm; }
        .receipt-title-box { background: black; color: white; padding: 4mm 2mm; margin-bottom: 2mm; border-radius: 4px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .receipt-title { font-size: 20px; font-weight: 900; text-align: center; text-transform: uppercase; letter-spacing: 1px; margin: 0; }
        .receipt-logo { max-width: 45mm; margin: 0 auto 3mm auto; display: block; filter: grayscale(100%) contrast(1.2); }
        .receipt-order-type { font-size: 20px; font-weight: 900; text-align: center; text-transform: uppercase; margin-top: 3mm; margin-bottom: 3mm; padding: 2mm 0; border-top: 2px dashed #000; border-bottom: 2px dashed #000; }
        .receipt-order-number { font-size: 40px; font-weight: 900; text-align: center; margin: 4mm 0 0 0; line-height: 1; }
        .receipt-order-date { font-size: 12px; color: #333; text-align: center; margin-bottom: 4mm; }
        .receipt-address { text-align: center; font-size: 12px; font-weight: 500; margin-top: 2mm; }
        .receipt-divider { border-bottom: 1.5px dashed black; margin: 3mm 0; }
        .receipt-divider-solid { border-bottom: 2px solid black; margin: 3mm 0; }
        .receipt-section-title { font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 1mm; }
        .receipt-items { width: 100%; text-align: left; border-collapse: collapse; }
        .receipt-items th { font-weight: bold; font-size: 12px; border-bottom: 1.5px solid black; padding-bottom: 2mm; }
        .receipt-items td { padding: 2mm 0 1mm 0; border-bottom: 1px dashed #999; }
        .receipt-items tbody tr:last-child td { border-bottom: none; }
        .receipt-items tbody tr { page-break-inside: avoid; }
        .receipt-items .item-name { font-size: 13px; font-weight: 700; }
        .receipt-totals { margin-top: 4mm; page-break-inside: avoid; }
        .receipt-total-row { display: flex; justify-content: space-between; font-size: 22px; font-weight: 900; margin-top: 2mm; padding-top: 2mm; border-top: 2px solid black; }
        .receipt-qr-section { page-break-inside: avoid; }
        .receipt-unpaid-warning { font-size: 18px; font-weight: 900; text-align: center; text-transform: uppercase; color: #fff; background: #000; margin-top: 4mm; margin-bottom: 4mm; padding: 3mm 0; border: 2px solid #000; }

        /* ── Utilidades del ticket (sin Tailwind dentro del iframe) ── */
        .text-center { text-align: center; }
        .text-left { text-align: left; }
        .text-right { text-align: right; }
        .mt-0\\.5 { margin-top: 2px; }
        .mt-1 { margin-top: 4px; }
        .mt-2 { margin-top: 8px; }
        .mt-4 { margin-top: 16px; }
        .mb-1 { margin-bottom: 4px; }
        .mb-2 { margin-bottom: 8px; }
        .mb-4 { margin-bottom: 16px; }
        .mb-6 { margin-bottom: 24px; }
        .ml-1 { margin-left: 4px; }
        .flex { display: flex; }
        .flex-col { flex-direction: column; }
        .flex-1 { flex: 1; }
        .justify-between { justify-content: space-between; }
        .items-center { align-items: center; }
        .items-start { align-items: flex-start; }
        .gap-2 { gap: 8px; }
        .shrink-0 { flex-shrink: 0; }
        .w-full { width: 100%; }
        .w-8 { width: 32px; }
        .align-top { vertical-align: top; }
        .font-bold { font-weight: 700; }
        .font-medium { font-weight: 500; }
        .font-semibold { font-weight: 600; }
        .text-sm { font-size: 14px; }
        .text-xs { font-size: 12px; }
        .text-lg { font-size: 18px; }
        .text-\\[6px\\] { font-size: 6px; }
        .text-\\[10px\\] { font-size: 10px; }
        .text-white { color: #fff; }
        .text-gray-800 { color: #1f2937; }
        .text-gray-500 { color: #6b7280; }
        .uppercase { text-transform: uppercase; }
        .leading-none { line-height: 1; }
        .leading-tight { line-height: 1.25; }
        .tracking-tight { letter-spacing: -0.025em; }
        .tracking-widest { letter-spacing: 0.1em; }
        .pl-1 { padding-left: 4px; }
        .pl-2 { padding-left: 8px; }
        .pt-2 { padding-top: 8px; }
        .p-1 { padding: 4px; }
        .p-2 { padding: 8px; }
        .border { border-width: 1px; border-style: solid; }
        .border-t { border-top-width: 1px; border-top-style: solid; }
        .border-l { border-left-width: 1px; border-left-style: solid; }
        .border-black { border-color: black; }
        .border-gray-300 { border-color: #d1d5db; }
        .border-gray-400 { border-color: #9ca3af; }
        .rounded { border-radius: 4px; }
        .inline-block { display: inline-block; }
        .bg-white { background: #fff; }
        .bg-black { background: #000; }
        .bg-gray-100 { background: #f3f4f6; }
      `,
      onPrintDialogClose: () => console.log('Print dialog closed'),
      onError: (e) => { throw e; },
    });

    console.log('Print dialog opened via print-js');
    return true;
  } catch (error) {
    console.error('Error opening print dialog:', error);
    throw error;
  }
};
