import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Falta SUPABASE_URL o SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const klapApiKey = process.env.KLAP_API_KEY || 'mKaTZ4yBm3rVFapqNctziKCvXsjD6fDO'; // Sandbox fallback

async function backfill() {
  console.log('Iniciando backfill de transacciones Klap...');
  
  const { data: payments, error } = await supabase
    .from('payments')
    .select('id, amount, reference_code, order_id')
    .eq('method', 'online_gateway')
    .not('reference_code', 'is', null);

  if (error) {
    console.error('Error obteniendo pagos:', error);
    return;
  }

  console.log(`Encontrados ${payments.length} pagos para procesar.`);

  for (const payment of payments) {
    if (!payment.reference_code) continue;

    console.log(`\nConsultando orden ${payment.reference_code} a Klap...`);
    try {
      const klapResponse = await fetch(`https://api.pasarela.multicaja.cl/payment-gateway/v1/orders/${payment.reference_code}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "apikey": klapApiKey
        }
      });

      let klapData = {};
      if (!klapResponse.ok) {
        console.warn(`Error consultando Klap para ${payment.reference_code}: ${klapResponse.status}. Usando DEBIT por defecto.`);
      } else {
        const data = await klapResponse.json();
        klapData = data.payment_details || data;
      }
      
      const card_type = klapData.card_type || klapData.payment_method || 'DEBIT'; // Fallback a DEBIT
      const amountNum = Number(payment.amount) || 0;
      
      let comisionEstimada = 0;
      let montoLiquidado = 0;

      if (amountNum > 0) {
        let variableRate = 0;
        const fixedFee = 90; 
        const ivaRate = 1.19;

        if (card_type === 'CREDIT') {
          variableRate = 0.0164;
        } else if (card_type === 'DEBIT') {
          variableRate = 0.0071;
        } else if (card_type === 'PREPAID') {
          variableRate = 0.0121;
        } else {
          variableRate = 0.0071;
        }

        const comisionNeta = Math.round((amountNum * variableRate) + fixedFee);
        comisionEstimada = Math.round(comisionNeta * ivaRate);
        montoLiquidado = amountNum - comisionEstimada;
      }

      const payment_details = {
        card_type,
        brand: klapData.brand || null,
        last_digits: klapData.last_digits || null,
        klap_order_id: payment.reference_code,
        estimated_commission: comisionEstimada,
        estimated_liquidated: montoLiquidado,
        gross_amount: amountNum
      };

      console.log(`-> Tarjeta: ${card_type} | Neto: ${amountNum} | Comision: ${comisionEstimada} | Liquida: ${montoLiquidado}`);

      const { error: updateError } = await supabase
        .from('payments')
        .update({ payment_details })
        .eq('id', payment.id);

      if (updateError) {
        console.error(`Error actualizando db para ${payment.id}:`, updateError);
      } else {
        console.log(`Pago ${payment.id} actualizado.`);
      }

    } catch (e) {
      console.error(`Excepción procesando ${payment.reference_code}:`, e.message);
    }
    
    // Pause briefly to not hammer the API
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\nBackfill terminado.');
}

backfill();
