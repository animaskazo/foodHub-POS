import qz from 'qz-tray';
import ReactDOMServer from 'react-dom/server';
import React from 'react';
import PrintableReceipt from '../components/pos/PrintableReceipt';
import { getQzCertificate } from '../utils/qzCert';

let isConnected = false;
let isConnecting = false;
let connectPromise = null;
let certReady = false;

// Detectar cuando QZ Tray se desconecta y resetear estado
const setupDisconnectDetection = () => {
  try {
    qz.websocket.setClosedPromise(() => {
      isConnected = false;
      console.warn('QZ Tray desconectado. Se reconectará automáticamente en el siguiente intento.');
    });
  } catch (e) {
    // setClosedPromise puede no estar disponible en todas las versiones
  }
};

setupDisconnectDetection();

// Configurar certificado para que QZ Tray recuerde la decisión de confiar
const setupCertificate = async () => {
  if (certReady) return;
  try {
    const { certPem, privateKey } = await getQzCertificate();

    qz.security.setCertificatePromise((resolve, reject) => {
      try {
        resolve(certPem);
      } catch (e) {
        reject(e);
      }
    });

    // QZ Tray 2.1+ requires setting the algorithm if not using the default.
    // Our WebCrypto key uses SHA-512.
    try {
      qz.security.setSignatureAlgorithm("SHA512");
    } catch (e) {
      console.warn("No se pudo configurar algoritmo SHA512 en QZ Tray:", e);
    }

    qz.security.setSignaturePromise((toSign) => {
      return (resolve, reject) => {
        const encoder = new TextEncoder();
        const data = encoder.encode(toSign);
        crypto.subtle.sign(
          { name: 'RSASSA-PKCS1-v1_5' },
          privateKey,
          data
        ).then((sig) => {
          resolve(btoa(String.fromCharCode(...new Uint8Array(sig))));
        }).catch(reject);
      };
    });

    certReady = true;
    console.log('Certificado QZ Tray configurado correctamente.');
  } catch (e) {
    console.error('Error configurando certificado QZ Tray:', e);
  }
};

// Conexión con protección contra llamadas concurrentes
const ensureConnection = async () => {
  if (isConnected) return;

  // Configurar certificado antes de conectar
  await setupCertificate();

  // Si ya hay una conexión en progreso, esperar a que termine
  if (isConnecting && connectPromise) {
    await connectPromise;
    return;
  }

  isConnecting = true;
  connectPromise = (async () => {
    try {
      await qz.websocket.connect({ retries: 3, delay: 1 });
      isConnected = true;
      console.log('QZ Tray conectado exitosamente.');
    } catch (error) {
      isConnected = false;
      console.error('Error conectando a QZ Tray:', error);
      throw error;
    } finally {
      isConnecting = false;
      connectPromise = null;
    }
  })();

  await connectPromise;
};

export const initPrinterService = ensureConnection;

export const getPrinters = async () => {
  try {
    await ensureConnection();
    const printers = await qz.printers.find();
    return printers;
  } catch (error) {
    console.error('Error buscando impresoras:', error);
    return [];
  }
};

const buildReceiptHtml = (order, organization) => {
  const receiptHtml = ReactDOMServer.renderToString(
    <PrintableReceipt order={order} organization={organization} />
  );

  const styles = `
    <style>
      @page { margin: 0; size: 80mm auto; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }

      body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.4; margin: 0; padding: 0; color: black; background: white; width: 80mm; }
      .print-receipt-container { width: 100%; margin: 0; padding: 0; background: white; }
      .receipt-content { width: 72mm; margin: 0 auto; padding: 2mm; overflow: hidden; }
      .receipt-header { text-align: center; margin-bottom: 3mm; }
      .receipt-title-box { background: black; color: white !important; padding: 3mm 2mm; margin-bottom: 2mm; border-radius: 4px; }
      .receipt-title { font-size: 18px; font-weight: 900; text-align: center; text-transform: uppercase; letter-spacing: 1px; margin: 0; }
      .receipt-order-number { font-size: 32px; font-weight: 900; text-align: center; margin-top: 2mm; margin-bottom: 0; line-height: 1; }
      .receipt-order-type { font-size: 18px; font-weight: 900; text-align: center; text-transform: uppercase; margin-top: 2mm; margin-bottom: 2mm; padding: 1.5mm 0; border-top: 2px dashed #000; border-bottom: 2px dashed #000; }
      .receipt-unpaid-warning { font-size: 16px; font-weight: 900; text-align: center; text-transform: uppercase; color: #fff; background: #000; margin-top: 2mm; margin-bottom: 2mm; padding: 2mm 0; border: 2px solid #000; }
      .receipt-order-date { font-size: 11px; color: #333; text-align: center; margin-bottom: 2mm; }
      .receipt-logo { max-width: 40mm; margin: 0 auto 2mm auto; display: block; filter: grayscale(100%) contrast(1.2); }
      .receipt-divider { border-bottom: 1.5px dashed black; margin: 2mm 0; }
      .receipt-divider-solid { border-bottom: 2px solid black; margin: 2mm 0; }
      .receipt-section-title { font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 1mm; }
      .receipt-items th { font-weight: bold; font-size: 12px; border-bottom: 1.5px solid black; padding-bottom: 1mm; }
      .receipt-items td { padding-top: 1.5mm; }
      .receipt-items .item-name { font-size: 12px; font-weight: 700; }
      .receipt-totals { margin-top: 2mm; }
      .receipt-total-row { display: flex; justify-content: space-between; font-size: 18px; font-weight: 900; margin-top: 1.5mm; padding-top: 1.5mm; border-top: 2px solid black; }

      .text-right { text-align: right; }
      .text-center { text-align: center; }
      .font-bold { font-weight: bold; }
      .text-sm { font-size: 0.85em; }
      .mt-1 { margin-top: 1mm; }
      .mt-2 { margin-top: 2mm; }
      .mt-4 { margin-top: 4mm; }
      .mb-1 { margin-bottom: 1mm; }
      .mb-2 { margin-bottom: 2mm; }
      .mb-4 { margin-bottom: 4mm; }
      .mb-6 { margin-bottom: 6mm; }
      .flex { display: flex; }
      .justify-between { justify-content: space-between; }
      .uppercase { text-transform: uppercase; }
      .inline-block { display: inline-block; }
      .items-start { align-items: flex-start; }
      .items-center { align-items: center; }
      .flex-col { flex-direction: column; }
      .flex-1 { flex: 1; }
      .shrink-0 { flex-shrink: 0; }
      .gap-1 { gap: 1mm; }
      .gap-2 { gap: 2mm; }
      .leading-tight { line-height: 1.2; }
      .border-t { border-top: 1px solid #ccc; }
      .pt-2 { padding-top: 2mm; }
      .tracking-wider { letter-spacing: 0.5px; }
      .tracking-widest { letter-spacing: 2px; }
      .border-gray-300 { border-color: #d1d5db; }
      .border-gray-400 { border-color: #9ca3af; }
      .text-gray-400 { color: #9ca3af; }
      .text-gray-500 { color: #6b7280; }
      .text-gray-800 { color: #1f2937; }
      .bg-gray-100 { background: #f3f4f6; }
      .bg-black { background: black; }
      .bg-white { background: white; }
      .rounded { border-radius: 4px; }
      .p-1 { padding: 1mm; }
      .p-2 { padding: 2mm; }
      .pl-1 { padding-left: 1mm; }
      .pl-2 { padding-left: 2mm; }
      .pr-4 { padding-right: 4mm; }
      .ml-1 { margin-left: 1mm; }
      .border-l { border-left: 1px solid #9ca3af; }
      .border-b { border-bottom: 1px solid #9ca3af; }
      .border { border: 1px solid #9ca3af; }
      .font-medium { font-weight: 500; }
      .font-semibold { font-weight: 600; }
      .font-extrabold { font-weight: 800; }
      .text-left { text-align: left; }
      .text-xs { font-size: 10px; }
      .text-lg { font-size: 18px; }
      .text-\[8px\] { font-size: 8px; }
      .text-\[10px\] { font-size: 10px; }
      .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .align-top { vertical-align: top; }
      .mt-0_5, .mt-0\.5 { margin-top: 0.5mm; }
      .inline-flex { display: inline-flex; }
      .w-full { width: 100%; }

      ul { list-style: none; padding-left: 10px; margin: 0; font-size: 0.9em; }
      table { width: 100%; border-collapse: collapse; text-align: left; }
      svg { display: block; margin: 0 auto; }
      img { display: block; margin: 0 auto; }
    </style>
  `;

  return `
    <!DOCTYPE html>
    <html>
      <head>${styles}</head>
      <body>
        <div class="print-receipt-container">
          ${receiptHtml}
        </div>
      </body>
    </html>
  `;
};

const sendToQz = async (printerName, fullHtml) => {
  const config = qz.configs.create(printerName, {
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });

  const printData = [{
    type: 'html',
    format: 'plain',
    data: fullHtml,
    options: { pageWidth: '80mm' }
  }];

  await qz.print(config, printData);
};

// Impresión con retry automático (1 reintento tras reconexión)
export const printReceipt = async (order, organization, printerName, _retry = false) => {
  if (!printerName) throw new Error('No hay impresora configurada');

  // Asegurar conexión
  if (!isConnected) {
    await ensureConnection();
  }

  const fullHtml = buildReceiptHtml(order, organization);

  try {
    await sendToQz(printerName, fullHtml);
    console.log('Ticket impreso exitosamente en', printerName);
    return true;
  } catch (error) {
    console.error('Error al imprimir con QZ Tray:', error);

    // Si falló y no hemos reintentado, reconectar e intentar una vez más
    if (!_retry) {
      console.log('Reintentando impresión tras reconexión...');
      isConnected = false;
      try {
        await ensureConnection();
        await sendToQz(printerName, fullHtml);
        console.log('Ticket impreso exitosamente en (reintento)', printerName);
        return true;
      } catch (retryError) {
        console.error('Reintento de impresión también falló:', retryError);
        throw retryError;
      }
    }

    throw error;
  }
};
