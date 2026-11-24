import { createClient } from "jsr:@supabase/supabase-js@2";

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

    // Notificar cuando el local inicia la preparación y cuando el pedido queda listo.
    const notifyableStatuses = ["confirmed", "ready"];
    if (!notifyableStatuses.includes(record?.status) || old_record?.status === record.status) {
      return new Response(JSON.stringify({ ignored: true, reason: "El estado no requiere notificación o no cambió" }), {
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
      .select("name, slug, whatsapp_phone_number_id")
      .eq("id", record.organization_id)
      .single();

    if (error || !org?.whatsapp_phone_number_id) {
      return new Response(JSON.stringify({ error: "Org not found or whatsapp number not configured" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const customerName = record.customer_name?.trim()?.split(/\s+/)[0] ?? "";
    const greeting = customerName ? `¡Hola, ${customerName}! 👋` : "¡Hola! 👋";
    const isReady = record.status === "ready";
    const isDelivery = record.delivery_type === "delivery";

    let message = isReady
      ? `${greeting}\n\nTu pedido *${record.order_number}* en *${org.name}* ya está listo. 🎉\n\n${isDelivery ? "En breve saldrá a despacho." : "Ya puedes pasar a retirarlo por el local."}`
      : `${greeting}\n\nEl local confirmó tu pedido *${record.order_number}* y ya está en preparación. 🍳`;

    if (isReady && record.uber_tracking_url) {
      message += `\n\n🛵 *Sigue tu delivery en vivo:*\n${record.uber_tracking_url}`;
    }

    // Registrar el aviso automático antes de enviarlo para que el eco de Kapso
    // no se interprete como una intervención humana y pause al agente.
    const sessionKey = `${record.customer_phone}_${org.slug || "pizza-nostra"}`;
    try {
      const { data: sessionRow } = await supabase
        .from("whatsapp_sessions")
        .select("session_data")
        .eq("phone", sessionKey)
        .maybeSingle();
      const session = sessionRow?.session_data ?? {
        messages: [],
        cart: [],
        collect: { active: false, step: null, data: {} },
        org_slug: org.slug || "pizza-nostra",
      };
      session.last_automated_message = message;
      session.automated_message_sent_at = new Date().toISOString();
      await supabase
        .from("whatsapp_sessions")
        .upsert(
          { phone: sessionKey, session_data: session, updated_at: new Date().toISOString() },
          { onConflict: "phone" }
        );
    } catch (err) {
      console.error("No se pudo registrar el mensaje automático:", err);
    }

    // Enviar a Kapso
    if (KAPSO_API_KEY) {
      const kapsoUrl = `https://api.kapso.ai/meta/whatsapp/v24.0/${org.whatsapp_phone_number_id}/messages`;
      const res = await fetch(kapsoUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": KAPSO_API_KEY,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
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
