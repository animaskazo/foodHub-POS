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

    qz.security.setSignaturePromise((toSign, resolve, reject) => {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(toSign);
        crypto.subtle.sign(
          { name: 'RSASSA-PKCS1-v1_5' },
          privateKey,
          data
        ).then((sig) => {
          resolve(btoa(String.fromCharCode(...new Uint8Array(sig))));
        }).catch(reject);
      } catch (e) {
        reject(e);
      }
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
      body { font-family: monospace; font-size: 12px; margin: 0; padding: 0; }
      .receipt-content { width: 100%; max-width: 300px; margin: 0 auto; text-align: left; padding: 10px 0; }
      .receipt-order-type { font-weight: bold; font-size: 1.5em; text-align: center; margin-bottom: 10px; }
      .receipt-header { display: flex; flex-direction: column; align-items: center; justify-content: center; margin-bottom: 15px; }
      .receipt-logo { max-width: 120px; max-height: 80px; object-fit: contain; }
      .receipt-title { font-weight: 800; font-size: 1.25em; text-transform: uppercase; margin: 0; text-align: center; }
      .receipt-divider-solid { border-top: 2px solid black; margin: 10px 0; }
      .receipt-divider { border-top: 1px dashed black; margin: 10px 0; }
      .receipt-order-number { font-size: 1.5em; font-weight: bold; }
      .receipt-order-date { font-size: 0.9em; color: #333; }
      .receipt-section-title { font-weight: bold; text-transform: uppercase; font-size: 1em; text-align: left; margin-bottom: 4px; }
      table { width: 100%; border-collapse: collapse; text-align: left; }
      th { border-bottom: 1px solid black; padding-bottom: 2px; }
      td { padding: 4px 0; vertical-align: top; }
      .text-right { text-align: right; }
      .text-center { text-align: center; }
      .font-bold { font-weight: bold; }
      .text-sm { font-size: 0.85em; }
      .mt-1 { margin-top: 4px; }
      .mb-2 { margin-bottom: 8px; }
      .mb-4 { margin-bottom: 16px; }
      .flex { display: flex; }
      .justify-between { justify-content: space-between; }
      .uppercase { text-transform: uppercase; }
      ul { list-style: none; padding-left: 10px; margin: 0; font-size: 0.9em; }
      svg { display: block; margin: 0 auto; }
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
    data: fullHtml
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
