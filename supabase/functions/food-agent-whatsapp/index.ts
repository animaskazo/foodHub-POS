import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-signature, x-webhook-event",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FOOD_AGENT_URL =
  "https://fgvhbniauzjvzeuespmf.supabase.co/functions/v1/food-agent";

// Regex para detectar intención de confirmar (español natural)
const CONFIRM_RE =
  /\b(confirmar?|confirmo|quiero\s+confirmar|listo(\s+para\s+pedir)?|finalizar\s+pedido?|hacer\s+el\s+pedido|pagar|checkout|cerrar\s+pedido)\b/i;

// ── Supabase client (service role para acceder a whatsapp_sessions) ──────────
function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ── Tipos ──────────────────────────────────────────────────────────────────
interface CartItem {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  notes: string;
  variant_option_ids: string[];
}

interface CollectState {
  active: boolean;
  step: "confirm_prompt" | "name" | null;
  data: { name?: string; phone?: string; notes?: string };
}

interface Session {
  messages: Array<{ role: string; content: string }>;
  cart: CartItem[];
  collect: CollectState;
  org_slug: string;
  customer_name?: string;
}

// ── Persistencia de sesiones en Supabase ────────────────────────────────────
async function resolveOrgSlug(phoneNumberId: string): Promise<string> {
  // 1. Buscar en organizations por phone_number_id (producción)
  const sb = getSupabase();
  const { data } = await sb
    .from("organizations")
    .select("slug")
    .eq("whatsapp_phone_number_id", phoneNumberId)
    .eq("is_active", true)
    .single();

  if (data?.slug) return data.slug;

  // 2. Fallback: variable de entorno (sandbox / single-tenant)
  return Deno.env.get("ORG_SLUG") ?? "pizza-nostra";
}

async function loadSession(phone: string, phoneNumberId: string): Promise<Session> {
  const sb = getSupabase();
  const { data } = await sb
    .from("whatsapp_sessions")
    .select("session_data")
    .eq("phone", phone)
    .single();

  if (data?.session_data) return data.session_data as Session;

  // Sesión nueva — resolver org_slug desde el phone_number_id
  const org_slug = await resolveOrgSlug(phoneNumberId);

  return {
    messages: [],
    cart: [],
    collect: { active: false, step: null, data: {} },
    org_slug,
  };
}

async function saveSession(phone: string, session: Session): Promise<void> {
  const sb = getSupabase();
  await sb.from("whatsapp_sessions").upsert(
    { phone, session_data: session, updated_at: new Date().toISOString() },
    { onConflict: "phone" }
  );
}

// ── Food Agent ───────────────────────────────────────────────────────────────
async function callFoodAgent(body: Record<string, unknown>) {
  const res = await fetch(FOOD_AGENT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── Enviar mensaje por Kapso ─────────────────────────────────────────────────
async function sendWhatsApp(
  phoneNumberId: string,
  to: string,
  text: string
): Promise<void> {
  const apiKey = Deno.env.get("KAPSO_API_KEY");
  if (!apiKey) {
    console.warn("KAPSO_API_KEY no configurada — respuesta no enviada");
    return;
  }
  const res = await fetch(
    `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: text },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    console.error(`Kapso send error ${res.status}:`, err);
  }
}

// ── Formatear dinero ─────────────────────────────────────────────────────────
function money(amount: number, currency = "CLP"): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ── Procesar un mensaje entrante ─────────────────────────────────────────────
async function processMessage(
  userPhone: string,
  phoneNumberId: string,
  userText: string
): Promise<void> {
  const session = await loadSession(userPhone, phoneNumberId);
  const { collect } = session;
  let replyText = "";

  // ── Flujo de recolección conversacional ─────────────────────────────────
  if (collect.active) {
    if (/^cancelar|no|espera|modificar$/i.test(userText.trim())) {
      collect.active = false;
      collect.step = null;
      collect.data = {};
      replyText = "Entendido, no confirmamos el pedido. ¿Deseas modificar algo en tu carrito?";
    } else if (collect.step === "name") {
      const name = userText.trim();
      session.customer_name = name;
      collect.active = false;
      collect.step = null;
      
      const welcome = await callFoodAgent({
        organization_slug: session.org_slug,
        action: "welcome",
      });
      replyText = `¡Gracias, ${name}! ${welcome.message ?? "¿Qué te gustaría pedir hoy?"}`;
      session.messages.push({ role: "assistant", content: replyText });
    } else if (collect.step === "confirm_prompt") {
      // Verificar si respondió afirmativamente
      if (/^(si|sí|ok|perfecto|dale|confirmo|listo|ya|bueno|claro|confirmar|yes|yep|s)$/i.test(userText.trim())) {
        const cartSnapshot = [...session.cart];
        const confirmData = await callFoodAgent({
          organization_slug: session.org_slug,
          action: "confirm",
          channel: "whatsapp",
          cart: cartSnapshot,
          customer: {
            name: session.customer_name || "Cliente WhatsApp",
            phone: userPhone,
            notes: "",
          },
        });

        if (confirmData.order_number) {
          const itemLines = cartSnapshot
            .map((i) => `• ${i.quantity} × ${i.name}`)
            .join("\n");
          const totalAmount = confirmData.total ?? cartSnapshot.reduce((s, i) => s + i.unit_price * i.quantity, 0);
          const total = money(totalAmount);

          // Generar link de pago Klap
          let paymentLinkMsg = "";
          if (confirmData.order_id) {
            try {
              const klapRes = await fetch("https://fgvhbniauzjvzeuespmf.supabase.co/functions/v1/klap-create-payment", {
                method: "POST",
                headers: { 
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
                },
                body: JSON.stringify({
                  orderId: confirmData.order_id,
                  amount: totalAmount,
                  returnUrl: `https://food-admin.digital-solutions.work/order/${session.org_slug}?orderId=${confirmData.order_id}&status=success`
                })
              });
              const klapData = await klapRes.json();
              if (klapData.redirect_url) {
                paymentLinkMsg = `\n💳 *Paga en línea aquí:*\n${klapData.redirect_url}\n`;
              }
            } catch (e) {
              console.error("Error generando link de pago Klap:", e);
            }
          }

          replyText =
            `✅ *Pedido confirmado*\n` +
            `Número: *${confirmData.order_number}*\n\n` +
            `${itemLines}\n\n` +
            `Total: *${total}*\n` +
            paymentLinkMsg +
            `\nA nombre de: *${session.customer_name || "Cliente WhatsApp"}*\n` +
            `El local te contactará pronto para coordinar 🙌`;

          // Limpiar sesión tras confirmación exitosa
          session.cart = [];
          session.messages = [];
          collect.active = false;
          collect.data = {};
        } else {
          replyText =
            "⚠ " +
            (confirmData.error ?? "Error al confirmar.") +
            "\nTu carrito sigue guardado, inténtalo de nuevo.";
          collect.active = false;
          collect.data = {};
        }
      } else {
        // No fue un "sí" ni un "no" claro, asumimos que quiere seguir charlando/modificando
        collect.active = false;
        collect.step = null;
        collect.data = {};
        
        session.messages.push({ role: "user", content: userText });
        const d = await callFoodAgent({
          organization_slug: session.org_slug,
          action: "chat",
          messages: session.messages.slice(-10),
          cart: session.cart,
        });
        replyText = d.message ?? "(sin respuesta)";
        session.messages.push({ role: "assistant", content: replyText });
        if (d.cart) session.cart = d.cart;
      }
    }

  // ── Intención de confirmar ────────────────────────────────────────────────
  } else if (CONFIRM_RE.test(userText) && session.cart.length > 0) {
    collect.active = true;
    collect.step = "confirm_prompt";
    collect.data = {};
    
    const itemLines = session.cart
      .map((i) => `• ${i.quantity} × ${i.name} (${money(i.unit_price * i.quantity)})`)
      .join("\n");
    const total = money(session.cart.reduce((s, i) => s + i.unit_price * i.quantity, 0));

    replyText =
      `🧾 *Resumen de tu pedido:*\n\n` +
      `${itemLines}\n\n` +
      `*Total: ${total}*\n` +
      `A nombre de: *${session.customer_name || "Cliente"}*\n\n` +
      `¿Deseas confirmar el pedido? (Responde Sí o No)`;

  } else if (CONFIRM_RE.test(userText) && session.cart.length === 0) {
    replyText =
      "Aún no tienes productos en tu pedido. ¡Cuéntame qué quieres pedir! 😊";

  // ── Chat normal con el agente ─────────────────────────────────────────────
  } else {
    // Si no tenemos el nombre, lo intentamos buscar o pedir
    if (!session.customer_name) {
      const supabase = getSupabase();
      const { data: orgData } = await supabase.from("organizations").select("id").eq("slug", session.org_slug).maybeSingle();
      if (orgData) {
        const { data: custData } = await supabase.from("customers").select("full_name").eq("organization_id", orgData.id).eq("phone", userPhone).maybeSingle();
        if (custData && custData.full_name) {
          session.customer_name = custData.full_name;
        }
      }
      
      if (!session.customer_name) {
        collect.active = true;
        collect.step = "name";
        replyText = "¡Hola! Bienvenido. Para brindarte una mejor atención, ¿cuál es tu nombre y apellido?";
        await saveSession(userPhone, session);
        await sendWhatsApp(phoneNumberId, userPhone, replyText);
        return;
      }
    }

    // Si el usuario inicia con "hola" sin sesión, hacer welcome primero
    const isGreeting = /^(hola|hi|buenas|hey|buenos\s+(días|dias|tardes|noches))\b/i.test(userText.trim());
    if (isGreeting && session.messages.length === 0) {
      const welcome = await callFoodAgent({
        organization_slug: session.org_slug,
        action: "welcome",
      });
      replyText = `¡Hola, ${session.customer_name}! ${welcome.message ?? "¿Qué te gustaría pedir hoy?"}`;
      session.messages.push({ role: "assistant", content: replyText });
    } else {
      session.messages.push({ role: "user", content: userText });
      const d = await callFoodAgent({
        organization_slug: session.org_slug,
        action: "chat",
        messages: session.messages.slice(-10),
        cart: session.cart,
      });
      replyText = d.message ?? "(sin respuesta)";
      session.messages.push({ role: "assistant", content: replyText });
      if (d.cart) session.cart = d.cart;
    }
  }

  // Guardar sesión y enviar respuesta
  await Promise.all([
    saveSession(userPhone, session),
    replyText
      ? sendWhatsApp(phoneNumberId, userPhone, replyText)
      : Promise.resolve(),
  ]);
}

// ── Handler principal ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const body = await req.json();
    const event =
      req.headers.get("x-webhook-event") ?? body.type ?? "";

    // Solo procesar mensajes entrantes
    if (!event.includes("message.received")) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Kapso puede enviar batch=true (array) o evento individual
    const events: unknown[] = body.batch ? (body.data ?? []) : [body];

    // Procesar en paralelo (cada mensaje es independiente por número)
    await Promise.all(
      events.map(async (evt: any) => {
        const message = evt.message;
        if (!message || message.type !== "text") return;

        const userText = message.text?.body?.trim();
        if (!userText) return;

        const userPhone: string =
          message.from ?? evt.contact?.wa_id ?? "";
        const phoneNumberId: string =
          evt.phone_number_id ?? message.kapso?.phone_number_id ?? "";

        if (!userPhone || !phoneNumberId) {
          console.warn("Evento sin userPhone o phoneNumberId:", JSON.stringify(evt));
          return;
        }

        await processMessage(userPhone, phoneNumberId, userText);
      })
    );

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("food-agent-whatsapp error:", err);
    // Siempre 200 para que Kapso no reintente indefinidamente
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      }
    );
  }
});
