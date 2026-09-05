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
    window.print();
    console.log('Print dialog opened');
    return true;
  } catch (error) {
    console.error('Error opening print dialog:', error);
    throw error;
  }
};
