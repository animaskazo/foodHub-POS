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

    // ── Construir URLs de retorno internamente ────────────────────────────────
    // Klap requiere URLs https:// públicas. No confiamos en el returnUrl del cliente
    // ya que puede ser localhost en desarrollo.
    // El cliente envía el returnUrl como referencia para extraer el slug y el orderId.
    const rawReturnUrl = (returnUrl || "").trim();
    
    // Extraer el slug del returnUrl del cliente (ej: "pizza-nostra" de "/order/pizza-nostra")
    let slug = "";
    try {
      const urlObj = new URL(rawReturnUrl);
      const match = urlObj.pathname.match(/\/order\/([^/?]+)/);
      if (match) slug = match[1];
    } catch { /* ignore */ }

    // Usar APP_URL del entorno, o la URL de producción por defecto
    const appBaseUrl = (Deno.env.get("APP_URL") || "https://food-admin.digital-solutions.work").replace(/\/$/, "");
    
    const validReturnUrl = slug
      ? `${appBaseUrl}/order/${slug}?orderId=${orderId}&status=success`
      : `${appBaseUrl}?orderId=${orderId}&status=success`;

    const cancelUrl = slug
      ? `${appBaseUrl}/order/${slug}?orderId=${orderId}&status=error`
      : `${appBaseUrl}?status=error`;

    console.log("return_url →", validReturnUrl);
    console.log("cancel_url →", cancelUrl);



    const apiKey = Deno.env.get("KLAP_API_KEY") || "mKaTZ4yBm3rVFapqNctziKCvXsjD6fDO";

    // Llamada estándar a la API de Klap (Multicaja)
    const klapResponse = await fetch("https://api-pasarela-sandbox.mcdesaqa.cl/payment-gateway/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey
      },
      body: JSON.stringify({
        // Klap no permite reutilizar el mismo reference_id en múltiples intentos.
        reference_id: `${orderId}-${Date.now()}`,
        description: `Pago de Orden ${orderId}`,
        amount: {
          currency: "CLP",
          total: amount
        },
        methods: ["tarjetas"],
        urls: {
          return_url: validReturnUrl,
          cancel_url: cancelUrl
        },
        webhooks: {
          webhook_confirm: "https://fgvhbniauzjvzeuespmf.supabase.co/functions/v1/klap-webhook?event=confirm",
          webhook_reject:  "https://fgvhbniauzjvzeuespmf.supabase.co/functions/v1/klap-webhook?event=reject"
        },
        customs: [
          { key: "tarjetas_expiration_minutes", value: "30" }
        ]
      })
    });

    const responseText = await klapResponse.text();
    console.log("Klap HTTP Status:", klapResponse.status);
    console.log("Klap Raw Response:", responseText);

    let data: any;
    try { data = JSON.parse(responseText); } catch { data = { raw: responseText }; }

    if (!klapResponse.ok) {
      console.error("Error desde Klap:", data);
      // Retornamos 200 con success:false para que el cliente pueda leer el error
      return new Response(JSON.stringify({ success: false, error: "Error al crear pago en Klap", details: data }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Suponemos que Klap retorna la URL de pago en una propiedad como payment_url, url o redirect_url
    const redirectUrl = data.payment_url || data.url || data.redirect_url;

    if (!redirectUrl) {
      console.error("Klap no retornó redirect_url. Data:", data);
      return new Response(JSON.stringify({ success: false, error: "Klap no retornó una URL de redirección válida", data }), {
        status: 200,
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
