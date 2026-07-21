import { createClient } from "jsr:@supabase/supabase-js@2";

const KAPSO_API_URL = "https://api.kapso.io/v1/messages";
const KAPSO_API_KEY = Deno.env.get("KAPSO_API_KEY");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const payload = await req.json();

    // Validar payload de Supabase Webhook
    if (payload.type !== "UPDATE" || payload.table !== "orders") {
      return new Response(JSON.stringify({ ignored: true, reason: "No es un update de orders" }), {
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const { record, old_record } = payload;

    // Solo enviar si el estado cambió a 'ready'
    if (record.status !== "ready" || old_record.status === "ready") {
      return new Response(JSON.stringify({ ignored: true, reason: "Status no es ready o ya era ready" }), {
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    if (!record.customer_phone) {
      return new Response(JSON.stringify({ ignored: true, reason: "Order has no customer_phone" }), {
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    // Obtener configuración de la organización (nombre y whatsapp id)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: org, error } = await supabase
      .from("organizations")
      .select("name, whatsapp_phone_number_id")
      .eq("id", record.organization_id)
      .single();

    if (error || !org?.whatsapp_phone_number_id) {
      return new Response(JSON.stringify({ error: "Org not found or whatsapp number not configured" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    let customerName = record.customer_name ? record.customer_name.split(" ")[0] : "";
    const greeting = customerName ? `¡Hola, ${customerName}! 👋` : "¡Hola! 👋";
    
    let instructions = "Ya puedes pasar a retirarlo.";
    if (record.order_type === "online" || record.order_type === "whatsapp") {
      instructions = "En breve te contactarán para la entrega.";
    } else if (record.order_type === "table") {
      instructions = "En breve te lo llevaremos a la mesa.";
    }

    const message = `${greeting}\n\nTe avisamos que tu pedido *${record.order_number}* en *${org.name}* ya está listo. 🎉\n\n${instructions}`;

    // Enviar a Kapso
    if (KAPSO_API_KEY) {
      const res = await fetch(KAPSO_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${KAPSO_API_KEY}`,
        },
        body: JSON.stringify({
          phone_number_id: org.whatsapp_phone_number_id,
          to: record.customer_phone,
          type: "text",
          text: {
            body: message,
          },
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        console.error("Error Kapso:", txt);
        throw new Error(`Kapso error: ${res.status}`);
      }
    } else {
      console.warn("No KAPSO_API_KEY configurado. Simulando envío:", message);
    }

    return new Response(JSON.stringify({ ok: true, sent: true }), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
});
