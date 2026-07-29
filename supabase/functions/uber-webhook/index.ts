const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
    });
  }

  try {
    const payload = await req.json();
    const deliveryId = payload.delivery_id || payload.data?.id;
    const deliveryStatus = payload.status || payload.data?.status;

    if (!deliveryId || !deliveryStatus) {
      return new Response(JSON.stringify({ ok: true, ignored: true }));
    }

    console.log(`[UberWebhook] ${deliveryId} -> ${deliveryStatus}`);

    const statusMap = {
      pending: "pending",
      pickup: "pickup",
      pickup_complete: "pickup_complete",
      dropoff: "dropoff",
      delivered: "delivered",
      canceled: "canceled",
    };
    const mappedStatus = statusMap[deliveryStatus] || deliveryStatus;

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?uber_delivery_id=eq.${encodeURIComponent(deliveryId)}&select=id`,
      {
        headers: {
          "apikey": SUPABASE_SERVICE_KEY,
          "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      }
    );

    const orders = await res.json();
    if (!orders?.length) {
      console.log(`[UberWebhook] No order found for ${deliveryId}`);
      return new Response(JSON.stringify({ ok: true, ignored: true }));
    }

    const orderId = orders[0].id;
    await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`, {
      method: "PATCH",
      headers: {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({ uber_status: mappedStatus }),
    });

    console.log(`[UberWebhook] Order ${orderId} uber_status -> ${mappedStatus}`);

    return new Response(JSON.stringify({ ok: true }));
  } catch (error) {
    console.error("[UberWebhook] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }
});
