import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log("Klap Webhook Payload recibido:", JSON.stringify(payload, null, 2));

    const { 
      order_id, reference_id, code, message, amount, payment_method,
      card_type, brand, last_digits, mc_code
    } = payload;

    if (!reference_id || !order_id) {
      console.error("Payload inválido: faltan order_id o reference_id");
      return new Response(JSON.stringify({ status: "error", message: "Invalid payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ── Verificar autenticidad del webhook ────────────────────────────────────
    // Klap envía un header 'Apikey' = sha256(reference_id + order_id + private_apikey)
    // Necesitamos buscar la API key de la organización dueña de esta orden
    const globalApiKey = Deno.env.get("KLAP_API_KEY") || "mKaTZ4yBm3rVFapqNctziKCvXsjD6fDO";

    // Extraer el UUID original de la orden desde reference_id
    // El reference_id se genera como `${orderId}-${Date.now()}`, entonces
    // los primeros 5 segmentos separados por guion forman el UUID v4.
    const orderId = reference_id.split('-').slice(0, 5).join('-');

    // Buscar la API key de la organización
    let privateApiKey = globalApiKey;
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      const supabaseForAuth = createClient(supabaseUrl, supabaseKey);

      const { data: orderData } = await supabaseForAuth
        .from('orders')
        .select('organization_id')
        .eq('id', orderId)
        .single();

      if (orderData?.organization_id) {
        const { data: orgData } = await supabaseForAuth
          .from('organizations')
          .select('klap_api_key')
          .eq('id', orderData.organization_id)
          .single();

        if (orgData?.klap_api_key) {
          privateApiKey = orgData.klap_api_key;
          console.log("Webhook: usando API key de la organización:", orderData.organization_id);
        }
      }
    } catch (e) {
      console.error("Webhook: error obteniendo API key de la organización, usando global:", e);
    }

    const receivedApikey = req.headers.get("Apikey") || req.headers.get("apikey") || "";

    if (receivedApikey) {
      const rawKey = reference_id + order_id + privateApiKey;
      const encoded = new TextEncoder().encode(rawKey);
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
      const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

      if (hashHex !== receivedApikey) {
        console.error("Webhook: Apikey no válida. Recibida:", receivedApikey, "Esperada:", hashHex);
        return new Response(JSON.stringify({ status: "ok", message: "Unauthorized (ignored to prevent refund)" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ── Determinar si es confirm o reject ────────────────────────────────────
    // Usamos el query param ?event= que enviamos al crear la orden en Klap,
    // o como fallback miramos si el payload trae payment_method (solo en confirm)
    const url = new URL(req.url);
    const eventParam = url.searchParams.get("event"); // "confirm" | "reject"
    const isConfirm = eventParam === "confirm" || (!eventParam && !!payment_method);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (isConfirm) {
      // ── Pago exitoso: marcar como pagado ──
      console.log(`Klap CONFIRM: orden ${orderId} | klap_order: ${order_id} | monto: ${amount}`);

      // Calcular comisión estimada según tarifas
      let comisionEstimada = 0;
      let montoLiquidado = 0;
      const amountNum = Number(amount) || 0;
      
      if (amountNum > 0) {
        let variableRate = 0;
        const fixedFee = 90; // $90 CLP fijo por transacción
        const ivaRate = 1.19; // 19% IVA sobre la comisión

        if (card_type === 'CREDIT') {
          variableRate = 0.0164; // 1.64%
        } else if (card_type === 'DEBIT') {
          variableRate = 0.0071; // 0.71%
        } else if (card_type === 'PREPAID') {
          variableRate = 0.0121; // 1.21%
        } else {
          // Fallback a débito por defecto si no viene
          variableRate = 0.0071;
        }

        const comisionNeta = Math.round((amountNum * variableRate) + fixedFee);
        comisionEstimada = Math.round(comisionNeta * ivaRate);
        montoLiquidado = amountNum - comisionEstimada;
      }

      const { error } = await supabase
        .from('payments')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          reference_code: mc_code || order_id, // Usamos mc_code como primary ref, fallback order_id
          method: 'online_gateway',
          payment_details: {
            card_type,
            brand,
            last_digits,
            klap_order_id: order_id,
            estimated_commission: comisionEstimada,
            estimated_liquidated: montoLiquidado,
            gross_amount: amountNum
          }
        })
        .eq('order_id', orderId);

      if (error) {
        console.error("Error actualizando pago:", error);
        // Do not throw error, we must return status: "ok" so Klap doesn't refund.
      } else {
        console.log(`Orden ${orderId} marcada como pagada exitosamente.`);
        
        // Update the order status from pending to confirmed or scheduled
        const { data: orderData } = await supabase
          .from('orders')
          .select('scheduled_at, status')
          .eq('id', orderId)
          .single();
          
        if (orderData && orderData.status === 'pending') {
          const newStatus = orderData.scheduled_at ? 'scheduled' : 'confirmed';
          await supabase
            .from('orders')
            .update({ status: newStatus })
            .eq('id', orderId);
            
          console.log(`Estado de la orden ${orderId} actualizado a ${newStatus}`);
        }
      }
    } else {
      // ── Pago rechazado: registrar detalle en el pago y en logs ──
      console.log(`Klap REJECT: orden ${orderId} | code: ${code} | message: ${message}`);
      try {
        await supabase
          .from('payments')
          .update({
            status: 'failed',
            error_details: JSON.stringify({
              paso: 'webhook_reject',
              klap_order_id: order_id,
              reference_id,
              code,
              message,
            }).slice(0, 4000),
          })
          .eq('order_id', orderId);
      } catch (pe) {
        console.error("Webhook: no se pudo registrar el rechazo:", pe.message);
      }
    }

    // Klap requiere respuesta JSON entre 200-299 dentro de 10 segundos
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Webhook error:", error.message);
    // Responder 200 y status: "ok" SIEMPRE para evitar que Klap haga refund automático
    return new Response(JSON.stringify({ status: "ok", message: "Caught error but returning ok" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

