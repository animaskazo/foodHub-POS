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
    const { klapOrderId, orderId } = await req.json();

    if (!klapOrderId) {
      return new Response(JSON.stringify({ isApproved: false, error: "Falta klapOrderId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ── Obtener API key de la organización ────────────────────────────────────
    const globalApiKey = Deno.env.get("KLAP_API_KEY") || "mKaTZ4yBm3rVFapqNctziKCvXsjD6fDO";
    let apiKey = globalApiKey;

    if (orderId) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data: orderData } = await supabase
          .from('orders')
          .select('organization_id')
          .eq('id', orderId)
          .single();

        if (orderData?.organization_id) {
          const { data: orgData } = await supabase
            .from('organizations')
            .select('klap_api_key')
            .eq('id', orderData.organization_id)
            .single();

          if (orgData?.klap_api_key) {
            apiKey = orgData.klap_api_key;
            console.log("[Klap Verify] Usando API key de la organización:", orderData.organization_id);
          }
        }
      } catch (e) {
        console.error("[Klap Verify] Error obteniendo API key de la organización, usando global:", e);
      }
    }

    const klapResponse = await fetch(`https://api.pasarela.multicaja.cl/payment-gateway/v1/orders/${klapOrderId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey
      }
    });

    const responseText = await klapResponse.text();
    console.log("[Klap Verify Status]:", klapResponse.status, responseText);

    let data: any;
    try { data = JSON.parse(responseText); } catch { data = { raw: responseText }; }

    if (!klapResponse.ok) {
      return new Response(JSON.stringify({ isApproved: false, error: "Error consultando Klap API", details: data }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const rawStatus = (data.status || data.code || "").toString().toUpperCase();
    const approvedStatuses = ["APPROVED", "PAID", "CONFIRMED", "COMPLETED", "SUCCESS", "0"];

    const isApproved = approvedStatuses.includes(rawStatus) || data.payment_status === "APPROVED";

    return new Response(JSON.stringify({
      isApproved,
      status: rawStatus,
      klapData: data
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("[Klap Verify Error]:", error.message);
    return new Response(JSON.stringify({ isApproved: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
