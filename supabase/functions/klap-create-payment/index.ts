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

    // Asegurar que la URL sea válida para Klap (Klap rechaza IPs o URLs sin http/https)
    let validReturnUrl = returnUrl;
    if (!validReturnUrl || !validReturnUrl.startsWith('https://')) {
        // Fallback obligatorio para entornos locales (http://localhost, http://192.x, etc.)
        validReturnUrl = "https://tu-dominio.com/pago-completado"; 
    }
    
    // Klap a veces rechaza URLs muy largas o con parámetros complejos para el cancel_url.
    // Usamos una URL limpia para evitar el error "cancel_url is not a valid url".
    const cleanCancelUrl = validReturnUrl.split('?')[0];

    const apiKey = Deno.env.get("KLAP_API_KEY") || "mKaTZ4yBm3rVFapqNctziKCvXsjD6fDO";

    // Llamada estándar a la API de Klap (Multicaja)
    const klapResponse = await fetch("https://api-pasarela-sandbox.mcdesaqa.cl/payment-gateway/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey
      },
      body: JSON.stringify({
        reference_id: orderId.toString(),
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

    return new Response(JSON.stringify({ success: true, redirect_url: redirectUrl }), {
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
