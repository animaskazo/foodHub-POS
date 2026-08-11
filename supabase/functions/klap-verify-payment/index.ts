import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

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
    const { klapOrderId } = await req.json();

    if (!klapOrderId) {
      return new Response(JSON.stringify({ isApproved: false, error: "Falta klapOrderId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const apiKey = Deno.env.get("KLAP_API_KEY") || "mKaTZ4yBm3rVFapqNctziKCvXsjD6fDO";

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
