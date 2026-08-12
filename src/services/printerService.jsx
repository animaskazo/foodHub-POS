import qz from 'qz-tray';
import ReactDOMServer from 'react-dom/server';
import React from 'react';
import PrintableReceipt from '../components/pos/PrintableReceipt';

let isConnected = false;

// Configuración de QZ Tray
export const initPrinterService = async () => {
  if (isConnected) return;
  try {
    // Aquí puedes configurar algoritmos de firma si tienes certificados (producción)
    // qz.security.setCertificatePromise((resolve, reject) => { ... });
    // qz.security.setSignatureAlgorithm("SHA512");
    // qz.security.setSignaturePromise((toSign) => { ... });

    await qz.websocket.connect({ retries: 5, delay: 1 });
    isConnected = true;
    console.log('QZ Tray conectado exitosamente.');
  } catch (error) {
    console.error('Error conectando a QZ Tray:', error);
    throw error;
  }
};

export const getPrinters = async () => {
  try {
    if (!isConnected) await initPrinterService();
    const printers = await qz.printers.find();
    return printers;
  } catch (error) {
    console.error('Error buscando impresoras:', error);
    return [];
  }
};

export const printReceipt = async (order, organization, printerName) => {
  try {
    if (!isConnected) await initPrinterService();
    if (!printerName) throw new Error('No hay impresora configurada');

    // 1. Renderizar el componente de React a un string HTML
    const receiptHtml = ReactDOMServer.renderToString(
      <PrintableReceipt order={order} organization={organization} />
    );

    // 2. Extraer los estilos del index.css para que QZ Tray los pueda usar
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

    const fullHtml = `
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

    // 3. Crear configuración de QZ
    const config = qz.configs.create(printerName, {
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });

    // 4. Enviar a imprimir como HTML
    const printData = [{
      type: 'html',
      format: 'plain',
      data: fullHtml
    }];

    await qz.print(config, printData);
    console.log('Ticket impreso exitosamente en', printerName);
    return true;
  } catch (error) {
    console.error('Error al imprimir ticket con QZ Tray:', error);
    throw error;
  }
};
