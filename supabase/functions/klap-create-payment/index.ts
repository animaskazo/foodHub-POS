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

    const apiKey = Deno.env.get("KLAP_API_KEY") || "mKaTZ4yBm3rVFapqNctziKCvXsjD6fDO";

    // Llamada estándar a la API de Klap (Multicaja)
    // Nota: El endpoint exacto y payload podrían requerir ajustes menores según la documentación final.
    const klapResponse = await fetch("https://api.pasarela.multicaja.cl/api/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        amount: amount,
        buy_order: orderId,
        session_id: `session-${orderId}`,
        return_url: returnUrl
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
