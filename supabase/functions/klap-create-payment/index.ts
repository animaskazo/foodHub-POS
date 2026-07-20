import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
    const { orderId, amount, returnUrl } = await req.json();

    if (!orderId || !amount) {
      return new Response(JSON.stringify({ error: "Faltan parámetros requeridos (orderId, amount)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Asegurar que la URL sea válida para Klap (Klap acepta localhost en Sandbox, pero requiere https para producción)
    let validReturnUrl = encodeURI((returnUrl || "").trim());
    if (!validReturnUrl || (!validReturnUrl.startsWith('https://') && !validReturnUrl.startsWith('http://localhost') && !validReturnUrl.startsWith('http://127.0.0.1'))) {
        // Fallback obligatorio para otros entornos no seguros
        validReturnUrl = "https://food-admin.digital-solutions.work"; 
    }
    
    // Klap cancel_url será la misma que la returnUrl pero con status=error 
    // para que el frontend detecte el rechazo de forma unificada.
    const cleanCancelUrl = validReturnUrl.replace('status=success', 'status=error');

    const apiKey = Deno.env.get("KLAP_API_KEY") || "mKaTZ4yBm3rVFapqNctziKCvXsjD6fDO";

    // Llamada estándar a la API de Klap (Multicaja)
    const klapResponse = await fetch("https://api-pasarela-sandbox.mcdesaqa.cl/payment-gateway/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey
      },
      body: JSON.stringify({
        // Klap no permite reutilizar el mismo reference_id en múltiples intentos de pago.
        // Agregamos un timestamp para garantizar que cada intento sea único, 
        // evitando el error engañoso "Conflicts creating order".
        reference_id: `${orderId}-${Date.now()}`,
        description: `Pago de Orden ${orderId}`,
        amount: {
          currency: "CLP",
          total: amount
        },
        methods: ["tarjetas"],
        urls: {
          return_url: validReturnUrl,
          cancel_url: cleanCancelUrl
        },
        webhooks: {
          webhook_confirm: "https://fgvhbniauzjvzeuespmf.supabase.co/functions/v1/klap-webhook",
          webhook_reject: "https://fgvhbniauzjvzeuespmf.supabase.co/functions/v1/klap-webhook"
        },
        customs: [
          { key: "tarjetas_expiration_minutes", value: "30" }
        ]
      })
    });

    const data = await klapResponse.json();

    if (!klapResponse.ok) {
      console.error("Error desde Klap:", data);
      return new Response(JSON.stringify({ error: "Error al crear pago en Klap", details: data }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Suponemos que Klap retorna la URL de pago en una propiedad como payment_url, url o redirect_url
    const redirectUrl = data.payment_url || data.url || data.redirect_url;

    if (!redirectUrl) {
      return new Response(JSON.stringify({ error: "Klap no retornó una URL de redirección válida", data }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      redirect_url: redirectUrl,
      klap_order_id: data.order_id
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Error interno:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
