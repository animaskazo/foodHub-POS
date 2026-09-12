const PYTHON_API = 'http://localhost:8088';
const RASTER_WIDTH = 576;

const findMountedReceipt = (order) => {
  const els = Array.from(document.querySelectorAll('.print-receipt-container')) || [];
  if (els.length <= 1) return els[0] || null;
  const needle = String(order?.id ?? order?.order_number ?? '').trim();
  if (needle) {
    const exact = els.find(el => {
      const num = el.querySelector('[class*="receipt-order-number"]')?.textContent?.trim() || '';
      return num.endsWith(needle);
    });
    if (exact) return exact;
  }
  return els[0] || null;
};

// Mensaje del segundo ticket (tras el corte). Vacío = solo voucher.
export const getExtraTicketMessage = (organization) =>
  (organization?.ticket_extra_message || '').trim();

const mountNode = async (Component, props, containerClass) => {
  const React = (await import('react')).default;
  const { createRoot } = await import('react-dom/client');
  const { flushSync } = await import('react-dom');
  const holder = document.createElement('div');
  holder.className = containerClass;
  holder.style.cssText =
    'position:fixed;left:-10000px;top:0;opacity:1;pointer-events:none;z-index:-1;background:#fff;width:80mm;';
  document.body.appendChild(holder);
  const root = createRoot(holder);
  flushSync(() => {
    root.render(React.createElement(Component, props));
  });
  holder.__unmount = () => root.unmount();
  return holder;
};

const buildReceiptNode = async (order, organization) => {
  // Montaje React real (no static markup): así corren los useEffect y el
  // <canvas> del QR de WhatsApp queda pintado con sus píxeles.
  const { default: PrintableReceipt } = await import('../components/pos/PrintableReceipt');
  const holder = await mountNode(PrintableReceipt, { order, organization }, 'print-receipt-container');
  // Un tick para asegurar paint del canvas del QR antes de capturar.
  await new Promise((r) => setTimeout(r, 30));
  return holder;
};

const buildExtraTicketNode = async (order, organization, message) => {
  const { default: PrintableExtraTicket } = await import('../components/pos/PrintableExtraTicket');
  const holder = await mountNode(
    PrintableExtraTicket,
    { organization, customerName: order?.customer_name || '', message },
    'print-extra-ticket-container'
  );
  await new Promise((r) => setTimeout(r, 30));
  return holder;
};

// cloneNode(true) NO copia los píxeles de los <canvas> (el QR sale en blanco).
// Hay que pintar cada canvas del clon desde su original.
const copyCanvasBitmaps = (src, dest) => {
  try {
    const from = src.querySelectorAll('canvas');
    const to = dest.querySelectorAll('canvas');
    const n = Math.min(from.length, to.length);
    for (let i = 0; i < n; i++) {
      try {
        const w = from[i].width, h = from[i].height;
        if (!w || !h) continue;
        if (to[i].width !== w) to[i].width = w;
        if (to[i].height !== h) to[i].height = h;
        to[i].getContext('2d').drawImage(from[i], 0, 0);
      } catch {
        /* canvas individual no copiable: se deja como está */
      }
    }
  } catch {
    /* sin canvas o DOM no disponible */
  }
};

// Detecta un canvas en blanco (todo fondo) para no imprimir/PDF vacío.
const isBlankCanvas = (canvas) => {
  try {
    const w = canvas.width, h = canvas.height;
    if (!w || !h) return true;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const data = ctx.getImageData(0, 0, w, h).data;
    const nx = 24, ny = Math.max(1, Math.round((24 * h) / w));
    for (let ix = 0; ix < nx; ix++) {
      for (let iy = 0; iy < ny; iy++) {
        const x = Math.min(w - 1, Math.floor(((ix + 0.5) / nx) * w));
        const y = Math.min(h - 1, Math.floor(((iy + 0.5) / ny) * h));
        const o = (y * w + x) * 4;
        if (data[o] < 250 || data[o + 1] < 250 || data[o + 2] < 250) return false;
      }
    }
    return true;
  } catch {
    return false; // canvas "tainted": no se puede leer, asumir con contenido
  }
};

const rasterizeNode = async (src, width = RASTER_WIDTH) => {
  const hold = src.cloneNode(true);
  hold.id = 'foodhub-print-capture';
  // OJO: debe quedar DENTRO del viewport. html-to-image rasteriza con el motor
  // del navegador y lo fuera de pantalla sale en blanco. Se esconde detrás de
  // todo (z-index muy negativo) en vez de moverlo a -10000px.
  hold.style.cssText =
    'position:fixed;left:0;top:0;opacity:1;pointer-events:none;z-index:-10000;background:#fff;width:80mm;margin:0;';
  document.body.appendChild(hold);
  copyCanvasBitmaps(src, hold);
  try {
    const elW = Math.max(hold.getBoundingClientRect().width || 1, 1);
    const pixelRatio = Math.max(1.5, width / elW);
    // 1) Captura fiel con el motor real del navegador (respeta Tailwind v4,
    //    oklch, mm, flex). Sin esto el simulador/PDF sale sin estilos.
    try {
      const { toCanvas } = await import('html-to-image');
      // skipFonts: el ticket usa Arial/Helvetica del sistema; así se evita
      // descargar e incrustar la fuente variable Geist en cada captura.
      const canvas = await toCanvas(hold, { pixelRatio, backgroundColor: '#ffffff', skipFonts: true });
      if (!isBlankCanvas(canvas)) return canvas;
      console.warn('html-to-image devolvió lienzo en blanco, reintentando con html2canvas');
    } catch (e) {
      console.warn('html-to-image falló, reintentando con html2canvas:', e?.message || e);
    }
    // 2) Fallback: html2canvas-pro
    const { default: html2canvas } = await import('html2canvas-pro');
    return await html2canvas(hold, {
      scale: pixelRatio,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });
  } finally {
    hold.remove();
  }
};

const unmountBuilt = (built) => {
  if (!built) return;
  try {
    built.__unmount?.();
  } catch {
    /* noop */
  }
  built.remove();
};

const captureReceiptCanvas = async (order, organization, width = RASTER_WIDTH) => {
  let src = findMountedReceipt(order);
  let built = null;
  if (!src) {
    built = await buildReceiptNode(order, organization);
    src = built;
  }
  try {
    return await rasterizeNode(src, width);
  } finally {
    unmountBuilt(built);
  }
};

const captureExtraTicketCanvas = async (order, organization, message, width = RASTER_WIDTH) => {
  const built = await buildExtraTicketNode(order, organization, message);
  try {
    return await rasterizeNode(built, width);
  } finally {
    unmountBuilt(built);
  }
};

const saveSimulatedPdf = async (order, organization) => {
  const canvas = await captureReceiptCanvas(order, organization);
  const jsPdfMod = await import('jspdf');
  const JSPDF = jsPdfMod.default || jsPdfMod;
  const imgW = 76;
  const imgH = (canvas.height / canvas.width) * imgW;
  const pdf = new JSPDF({ unit: 'mm', format: [80, imgH + 10], compress: true });
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 2, 5, imgW, imgH);
  const extraMessage = getExtraTicketMessage(organization);
  if (extraMessage) {
    const extraCanvas = await captureExtraTicketCanvas(order, organization, extraMessage);
    const extraH = (extraCanvas.height / extraCanvas.width) * imgW;
    pdf.addPage([80, extraH + 10]);
    pdf.addImage(extraCanvas.toDataURL('image/png'), 'PNG', 2, 5, imgW, extraH);
  }
  const ticketId = order?.id || order?.order_number || 'ticket';
  const safeId = String(ticketId).replace(/[^\w-]/g, '') || 'ticket';
  pdf.save(`FoodHub-Ticket-${safeId}.pdf`);
  return true;
};

const getPaymentMethodFromOrder = (order) => {
  if (order.payments?.some(p => p.status === 'pending')) return '';
  const method = (order.payment_method || order.payments?.[0]?.gateway || '')
    .toString().toLowerCase();
  if (method.includes('klap')) return 'Online - Klap';
  if (order.payments?.[0]?.status === 'pending') return 'Pendiente';
  return order.payment_method || '';
};

const sendToPythonPrinter = async (printerName, order, organization, imageDataUrl = null) => {
  const created = order?.created_at ? new Date(order.created_at)
    : (order?.date ? new Date(order.date) : new Date());
  const formattedDate = created.toLocaleDateString('es-CL');
  const formattedTime = created.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

  const paymentDisplay = getPaymentMethodFromOrder(order);
  const paymentRef = order?.payments?.[0]?.reference_code;
  const isPaid = !(order?.payments?.some(p => p.status === 'pending'));
  // Segundo ticket (solo lo usa el servidor en modo texto; en modo raster
  // el frontend envía el ticket extra como una segunda petición /print).
  const extraMessage = getExtraTicketMessage(organization);
  const extraGreeting = (order?.customer_name || '').trim()
    ? `Hola ${(order.customer_name || '').trim()},`
    : '';

  const payload = {
    store_name: organization?.name || '',
    store_address: organization?.address || '',
    store_phone: organization?.phone || '',
    store_footer: organization?.footer || '¡Gracias por su compra!',
    store_message: organization?.message || '',
    order_number: order?.id || order?.order_number || '',
    order_date: `${formattedDate} - ${formattedTime}`,
    order_type: order?.order_type || '',
    delivery_type: order?.delivery_type || '',
    table_name: order?.table_name || order?.table || '',
    customer_name: order?.customer_name || order?.customer || '',
    customer_phone: order?.customer_phone || '',
    delivery_address: order?.delivery_address || '',
    notes: order?.notes || '',
    items: (order?.items || []).map(item => ({
      name: item.name || item.product_name || 'Item',
      quantity: item.quantity || item.qty || 1,
      price: item.price || item.unit_price || 0,
    })),
    order_items: order?.order_items || order?.items || [],
    subtotal: order?.subtotal || 0,
    tax: order?.tax || 0,
    delivery_fee: order?.delivery_fee || 0,
    total: order?.total || order?.grand_total || 0,
    payments: order?.payments || [],
    is_paid: isPaid,
    payment_display: isPaid && paymentDisplay ? `${paymentDisplay}${paymentRef ? ` · ID ${paymentRef}` : ''}` : '',
    printer_name: printerName,
    extra_message: extraMessage,
    extra_greeting: extraGreeting,
  };
  if (imageDataUrl) {
    payload.image = imageDataUrl;
    payload.image_width = RASTER_WIDTH;
  }

  // Timeout: si la impresora está apagada/sin papel el spooler puede colgarse
  // y el fetch quedaría esperando para siempre. OJO: el servidor podría igual
  // alcanzar a imprimir, así que ante este error revisa el ticket antes de reintentar.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  let response;
  try {
    response = await fetch(`${PYTHON_API}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new Error('Tiempo de espera agotado (60s): revisa si el ticket salió antes de reintentar');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Print failed');
  }

  const result = await response.json();
  if (result?.mode === 'texto') {
    console.warn(
      'Ticket impreso en modo TEXTO (sin estilos). ' +
      'Causa: ' + (result?.detail || 'desconocida') +
      ' | Pillow: ' + (result?.pillow_available ? 'sí' : 'NO') +
      ' | Imagen navegador: ' + (result?.had_image ? 'sí' : 'no') +
      '. Revisa http://localhost:8088/debug (pillow_available debe ser true) y actualiza el programa de impresión.'
    );
  }
  return result;
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
  const isSimulator = printerName.includes('Simulador');

  try {
    if (isSimulator) {
      await saveSimulatedPdf(order, organization);
      console.log('Ticket simulado guardado como PDF (misma vista del navegador)');
      return true;
    }

    const canvas = await captureReceiptCanvas(order, organization);
    const image = canvas.toDataURL('image/png');
    const result = await sendToPythonPrinter(printerName, order, organization, image);
    console.log('Ticket impreso (HTML -> raster) en', printerName, '| modo:', result?.mode);

    // Segundo ticket con el mensaje personalizado (tras el corte del voucher).
    const extraMessage = getExtraTicketMessage(organization);
    if (extraMessage) {
      try {
        const extraCanvas = await captureExtraTicketCanvas(order, organization, extraMessage);
        await sendToPythonPrinter(printerName, order, organization, extraCanvas.toDataURL('image/png'));
        console.log('Segundo ticket (mensaje) impreso en', printerName);
      } catch (extraError) {
        console.error('Error al imprimir el segundo ticket:', extraError);
        throw new Error('Voucher impreso, pero falló el segundo ticket (mensaje). Revisa la impresora antes de reintentar solo el mensaje.');
      }
    }
    return true;
  } catch (error) {
    console.error('Error al imprimir:', error);

    if (!isSimulator && !_retry) {
      console.log('Reintentando impresion con formato de texto...');
      try {
        await sendToPythonPrinter(printerName, order, organization, null);
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
  let combined = null;
  let builtExtra = null;
  try {
    const printJS = (await import('print-js')).default;

    const receiptEl = document.querySelector('.print-receipt-container');
    if (!receiptEl) throw new Error('No se encontró el ticket en el DOM');

    let printableId = receiptEl.id || 'foodhub-print-ticket';
    receiptEl.id = printableId;

    // Segundo ticket con el mensaje: se anexa como segunda página.
    const extraMessage = getExtraTicketMessage(organization);
    if (extraMessage) {
      builtExtra = await buildExtraTicketNode(order, organization, extraMessage);
      combined = document.createElement('div');
      combined.id = 'foodhub-print-combined';
      combined.style.cssText =
        'position:fixed;left:0;top:0;pointer-events:none;z-index:-10000;background:#fff;width:80mm;margin:0;';
      const receiptClone = receiptEl.cloneNode(true);
      receiptClone.removeAttribute('id');
      const breakEl = document.createElement('div');
      breakEl.className = 'extra-ticket-break';
      combined.appendChild(receiptClone);
      combined.appendChild(breakEl);
      combined.appendChild(builtExtra.cloneNode(true));
      document.body.appendChild(combined);
      printableId = combined.id;
    }

    printJS({
      printable: printableId,
      type: 'html',
      scanStyles: false,
      style: `
        @page { size: 80mm auto; margin: 0; }
        .extra-ticket-break { page-break-before: always; break-before: page; }
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
  } finally {
    if (combined) combined.remove();
    unmountBuilt(builtExtra);
  }
};
