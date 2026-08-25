import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
declare const Deno: any;
const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const claudeKey = Deno.env.get("CLAUDE_API_KEY");
const dbHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

type CartItem = { product_id: string; quantity: number; notes?: string; variant_option_ids?: string[] };
type Product = { id: string; name: string; description: string | null; base_price: number; status: string; is_active: boolean };

async function db(path: string, init: RequestInit = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...dbHeaders, ...init.headers } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || "Error consultando la carta.");
  return payload;
}
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function toNumber(value: unknown) { const number = Number(value); return Number.isFinite(number) ? number : 0; }

async function getContext(slug: string) {
  const organizations = await db(`organizations?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id,name,slug,currency,primary_color,default_tax_rate,delivery_enabled,uber_enabled,store_lat,store_lng,delivery_radius_km,delivery_fee,delivery_min_order,address,logo_url,business_hours,phone,email`);
  const organization = organizations[0];
  if (!organization) throw new Error("No existe un negocio activo para ese enlace.");
  const branches = await db(`branches?organization_id=eq.${organization.id}&is_active=eq.true&select=id,name,accepts_online`);
  const branch = branches.find((item: { accepts_online: boolean }) => item.accepts_online) || branches[0];
  if (!branch) throw new Error("Este negocio no tiene una sucursal activa.");
  
  const categories = await db(`categories?organization_id=eq.${organization.id}&is_active=eq.true&show_in_whatsapp=eq.true&select=id`);
  const activeCatIds = categories.map((c: any) => c.id);
  
  const rawProducts = await db(`products?organization_id=eq.${organization.id}&is_active=eq.true&status=eq.available&select=id,name,description,base_price,status,is_active,product_categories(category_id)&order=name.asc`);
  const products: Product[] = rawProducts.filter((p: any) => 
    !p.product_categories?.length || 
    p.product_categories.some((pc: any) => activeCatIds.includes(pc.category_id))
  );

  const ids = products.map((product) => product.id);
  const variants = ids.length ? await db(`variant_groups?product_id=in.(${ids.join(",")})&select=id,product_id,name,is_required,variant_options(id,name,price_modifier,is_active)`) : [];
  const ingredients = ids.length ? await db(`product_ingredients?product_id=in.(${ids.join(",")})&select=product_id,ingredients(name)`) : [];
  return { organization, branch, products, variants, ingredients };
}
function validateCart(input: unknown, context: Awaited<ReturnType<typeof getContext>>) {
  const requested = Array.isArray(input) ? input : [];
  if (!requested.length) throw new Error("Agrega al menos un producto antes de confirmar.");
  const products = new Map(context.products.map((product) => [product.id, product]));
  const groups = new Map(context.variants.map((group: any) => [group.id, group]));
  return requested.map((raw: any) => {
    const product = products.get(text(raw?.product_id));
    const quantity = Math.floor(toNumber(raw?.quantity));
    if (!product || quantity < 1 || quantity > 20) throw new Error("Hay un producto o una cantidad inválida en el carrito.");
    const selected = Array.isArray(raw?.variant_option_ids) ? raw.variant_option_ids : [];
    const productGroups = context.variants.filter((group: any) => group.product_id === product.id);
    const options = selected.map((id: string) => {
      const group = Array.from(groups.values()).find((candidate: any) => candidate.product_id === product.id && candidate.variant_options?.some((option: any) => option.id === id && option.is_active));
      const option = group?.variant_options.find((candidate: any) => candidate.id === id);
      if (!group || !option) throw new Error("Una opción elegida no pertenece al producto.");
      return { group, option };
    });
    for (const group of productGroups) if (group.is_required && !options.some((option: any) => option.group.id === group.id)) throw new Error(`${product.name} requiere elegir ${group.name}.`);
    const taxRate = context.organization.default_tax_rate ? toNumber(context.organization.default_tax_rate) / 100 : 0.19;
    const grossUnitPrice = toNumber(product.base_price) + options.reduce((sum: number, item: any) => sum + toNumber(item.option.price_modifier), 0);
    const netUnitPrice = Math.round(grossUnitPrice / (1 + taxRate));
    return { product, quantity, notes: text(raw?.notes).slice(0, 280), options, netUnitPrice, grossUnitPrice };
  });
}
async function askAgent(messages: unknown[], cart: unknown[], context: Awaited<ReturnType<typeof getContext>>, phone?: string) {
  if (!claudeKey) throw new Error("Falta configurar CLAUDE_API_KEY en los secretos de la función.");
  const menu = context.products.map((product) => {
    const prodIngs = (context.ingredients || []).filter((i: any) => i.product_id === product.id).map((i: any) => i.ingredients?.name).filter(Boolean);
    return { 
      id: product.id, 
      name: product.name, 
      description: product.description, 
      ingredients: prodIngs.length > 0 ? prodIngs.join(", ") : undefined,
      price: toNumber(product.base_price), 
      variants: context.variants.filter((group: any) => group.product_id === product.id).map((group: any) => ({ id: group.id, name: group.name, required: group.is_required, options: group.variant_options?.filter((option: any) => option.is_active).map((option: any) => ({ id: option.id, name: option.name, price_modifier: toNumber(option.price_modifier) })) })) 
    };
  });
  // Formatear el horario comercial para pasarlo a Claude
  let hoursStr = "No especificado";
  if (context.organization.business_hours) {
    try {
      const bh = typeof context.organization.business_hours === "string" 
        ? JSON.parse(context.organization.business_hours) 
        : context.organization.business_hours;
      hoursStr = Object.entries(bh)
        .map(([day, val]: [string, any]) => {
          const dayName = { mon: "Lunes", tue: "Martes", wed: "Miércoles", thu: "Jueves", fri: "Viernes", sat: "Sábado", sun: "Domingo" }[day] || day;
          return val.closed ? `${dayName}: Cerrado` : `${dayName}: ${val.open} a ${val.close}`;
        })
        .join(", ");
    } catch (e) {
      console.error("Error parsing business hours:", e);
    }
  }

  // Buscar historial de pedidos si el teléfono está presente
  let ordersStr = "No se encontraron pedidos recientes.";
  if (phone) {
    try {
      // Query the database for the last 3 orders
      const orders = await db(`orders?organization_id=eq.${context.organization.id}&customer_phone=eq.${encodeURIComponent(phone)}&select=order_number,status,delivery_type,total,created_at,order_items(product_name,quantity)&order=created_at.desc&limit=3`);
      if (orders && orders.length > 0) {
        ordersStr = orders.map((o: any) => {
          const items = (o.order_items || []).map((i: any) => `${i.quantity}x ${i.product_name}`).join(", ");
          const statusMap: any = { pending: "Pendiente de aprobación", confirmed: "Preparando en cocina", ready: "Listo", delivered: "Entregado", cancelled: "Cancelado" };
          const status = statusMap[o.status] || o.status;
          return `- Pedido #${o.order_number}: ${items || "Sin detalle"} (Total: ${toNumber(o.total).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })}, Estado: ${status})`;
        }).join("\n");
      }
    } catch (e) {
      console.error("Error fetching customer history for Claude:", e);
    }
  }

  // Obtener fecha y hora actual en la zona horaria de Chile
  const now = new Date();
  const currentDate = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(now);

  const urlTienda = `https://${context.organization.slug}.foodhub.work`;
  const usesUberDirect = Boolean(context.organization.uber_enabled);
  const hasOwnDelivery = Boolean(context.organization.delivery_enabled);
  
  const instruction = `Eres el asistente de pedidos por WhatsApp de ${context.organization.name}. Responde siempre en español, de forma cercana y breve.
  
REGLAS ESTRICTAS DE HORARIO:
- Antes de ofrecer productos, DEBES revisar si el local está ABIERTO comparando la 'Fecha y Hora Actual' con el 'Horario de Atención'.
- Si el local está CERRADO, pide disculpas cordialmente e informa que no pueden tomar pedidos en este momento, indicando el horario en que volverán a abrir. NO ofrezcas armar pedidos si están cerrados.

REGLAS DE DELIVERY Y RETIRO:
- En tu primer o segundo mensaje (cuando el cliente te salude o empiece a pedir), DEBES PREGUNTAR obligatoriamente si el pedido es para "Retiro en el local" o para "Delivery/Envío a domicilio".
- Configuración de Envío de este local: UberDirect = ${usesUberDirect}, Delivery Propio = ${hasOwnDelivery}.
- SI EL CLIENTE PIDE DELIVERY Y EL LOCAL USA UBERDIRECT (UberDirect = true): ESTÁ ESTRICTAMENTE PROHIBIDO tomar pedidos de delivery por WhatsApp. Debes disculparte y decirle textualmente: "Para envíos a domicilio debes realizar tu pedido directamente en nuestra página web: ${urlTienda}".
- Solo puedes tomar el pedido completo por WhatsApp si el cliente elige RETIRO, o si el local tiene Delivery Propio (Delivery Propio = true) y NO usa UberDirect.

INSTRUCCIONES DEL CARRITO:
La carta adjunta es la única fuente de productos, precios y opciones. Nunca inventes productos, precios ni disponibilidad. Ayuda a armar el pedido y pregunta lo mínimo necesario por variantes obligatorias. Devuelve el carrito completo; conserva productos ya presentes salvo que el cliente pida cambiarlos. NUNCA calcules sumas ni el total del pedido, el sistema lo hará automáticamente. SIEMPRE que menciones o recomiendes un producto o variante, debes mostrar su precio exacto entre paréntesis. No confirmes ni cobres: la aplicación lo hace después. Cuando el pedido esté armado y correcto, pídele al cliente que diga la palabra "confirmar" para finalizar.

INFORMACIÓN DEL LOCAL:
- Dirección: ${context.organization.address || "No especificada"}
- Enlace/URL del Local para Pedidos Web: ${urlTienda}
- Teléfono: ${context.organization.phone || "No especificado"}
- Horario de Atención (Hora Chile): ${hoursStr}
- Fecha y Hora Actual (Hora Chile): ${currentDate}

PEDIDOS RECIENTES DE ESTE CLIENTE (Teléfono: ${phone || "No especificado"}):
${ordersStr}

Nota: Si el cliente pregunta por el estado de su pedido o sus pedidos anteriores, utiliza la sección de "PEDIDOS RECIENTES" de arriba para responder de forma clara y directa.

CARTA: ${JSON.stringify(menu)}

VENTA_WEB: ${Boolean(context.branch.accepts_online)}`;
  const schema = {
    type: "object", additionalProperties: false, required: ["message", "cart"], properties: {
      message: { type: "string" },
      cart: {
        type: "array", items: {
          type: "object", additionalProperties: false,
          required: ["product_id", "quantity", "notes", "variant_option_ids"],
          properties: {
            product_id: { type: "string" }, quantity: { type: "integer" }, notes: { type: "string" },
            variant_option_ids: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  };
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": claudeKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001", max_tokens: 1024, system: instruction,
      messages: [{ role: "user", content: JSON.stringify({ conversation: messages, current_cart: cart }) }],
      tools: [{ name: "return_order", description: "Devuelve el mensaje para el cliente y el carrito completo, usando solamente los IDs de la carta.", input_schema: schema }],
      tool_choice: { type: "tool", name: "return_order" },
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error("El asistente no está disponible temporalmente.");
  const toolUse = payload.content?.find((block: { type: string }) => block.type === "tool_use");
  if (!toolUse?.input) throw new Error("El asistente devolvió una respuesta no válida.");
  return toolUse.input;
}
async function confirmOrder(cart: unknown, customer: any, delivery: any, context: Awaited<ReturnType<typeof getContext>>) {
  if (!context.branch.accepts_online) throw new Error("Esta sucursal no está habilitada para recibir pedidos web.");
  const items = validateCart(cart, context);
  const customerName = text(customer?.name).trim(); const phone = text(customer?.phone).trim();
  if (!customerName || !phone) throw new Error("Indica tu nombre y teléfono para confirmar.");
  // Tu operación consolida estos pedidos como WhatsApp, incluso durante la etapa web.
  const orderType = "whatsapp";
  const taxRate = context.organization.default_tax_rate ? toNumber(context.organization.default_tax_rate) / 100 : 0.19;
  
  const deliveryType = text(delivery?.type) === "delivery" ? "delivery" : "pickup";
  const deliveryAddress = text(delivery?.address) || null;
  const deliveryFee = deliveryType === "delivery" ? toNumber(delivery?.fee) : 0;

  const itemsTotal = items.reduce((sum, item) => sum + item.grossUnitPrice * item.quantity, 0);
  const grossTotal = itemsTotal + deliveryFee;
  const netTotal = Math.round(grossTotal / (1 + taxRate));
  const taxAmount = grossTotal - netTotal;
  
  const custQuery = await db(`customers?organization_id=eq.${context.organization.id}&phone=eq.${encodeURIComponent(phone)}&select=id`);
  let customerId = custQuery?.[0]?.id;
  const customerEmail = text(customer?.email).trim();
  if (!customerId) {
    const newCust = await db("customers", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ organization_id: context.organization.id, full_name: customerName, phone: phone, email: customerEmail || null }) });
    customerId = newCust?.[0]?.id;
  } else {
    await db(`customers?id=eq.${customerId}`, { method: "PATCH", body: JSON.stringify({ full_name: customerName, email: customerEmail || null }) });
  }

  const orderRows = await db("orders", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ organization_id: context.organization.id, branch_id: context.branch.id, customer_id: customerId || null, order_type: orderType, delivery_type: deliveryType, delivery_address: deliveryAddress, delivery_fee: deliveryFee, status: "pending", customer_name: customerName, customer_phone: phone, notes: text(customer?.notes).slice(0, 280), subtotal: netTotal, tax_amount: taxAmount, total: grossTotal }) });
  const order = orderRows[0];
  const orderItems = items.map((item) => ({ order_id: order.id, product_id: item.product.id, product_name: item.product.name, quantity: item.quantity, unit_price: item.grossUnitPrice, total_price: item.grossUnitPrice * item.quantity, notes: item.notes || null }));
  await db("order_items", { method: "POST", body: JSON.stringify(orderItems) });
  const variants = items.flatMap((item, index) => item.options.map((selected: any) => ({ order_item_id: "", itemIndex: index, variant_group_id: selected.group.id, variant_option_id: selected.option.id, variant_group_name: selected.group.name, variant_option_name: selected.option.name, price_modifier: toNumber(selected.option.price_modifier) })));
  if (variants.length) { const createdItems = await db(`order_items?order_id=eq.${order.id}&select=id,product_id&order=created_at.asc`); const rows = variants.map(({ itemIndex, ...variant }: any) => ({ ...variant, order_item_id: createdItems[itemIndex]?.id })).filter((variant: any) => variant.order_item_id); if (rows.length) await db("order_item_variants", { method: "POST", body: JSON.stringify(rows) }); }
  
  await db("payments", { method: "POST", body: JSON.stringify({ order_id: order.id, method: "cash", status: "pending", amount: grossTotal }) });

  // Send confirmation email to customer
  if (customerEmail) {
    const emailData = {
      order_number: order.order_number,
      order_type: orderType,
      delivery_type: deliveryType,
      delivery_address: deliveryAddress,
      customer_name: customerName,
      total: grossTotal,
      subtotal: netTotal,
      delivery_fee: deliveryFee,
      payment_method: "cash",
      items: items.map(item => ({
        product_name: item.product.name,
        quantity: item.quantity,
        total_price: item.grossUnitPrice * item.quantity,
        image_url: null,
      })),
      branch: {
        name: context.branch.name || '',
        address: context.organization.address || '',
      },
      organization: {
        name: context.organization.name || 'FoodHub',
        logo_url: context.organization.logo_url || null,
      }
    };
    try {
      await fetch(`${url}/functions/v1/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
        body: JSON.stringify({ type: "order_confirmed", email: customerEmail, data: emailData })
      });
    } catch (e) {
      console.error("Error sending email:", e);
    }
  }

  // Send sale notification email to the business (non-blocking)
  const orgEmail = (context.organization as any).email;
  const businessEmailData = {
    order_number: order.order_number,
    order_type: orderType,
    channel: 'whatsapp',
    delivery_type: deliveryType,
    delivery_address: deliveryAddress,
    delivery_fee: deliveryFee,
    customer_name: customerName,
    customer_phone: phone,
    total: grossTotal,
    subtotal: netTotal,
    payment_method: 'cash',
    notes: text((context as any).notes) || null,
    items: items.map(item => ({
      product_name: item.product.name,
      quantity: item.quantity,
      total_price: item.grossUnitPrice * item.quantity,
    })),
    organization: {
      id: context.organization.id,
      name: context.organization.name || 'FoodHub',
      logo_url: context.organization.logo_url || null,
    },
    branch: {
      name: context.branch.name || '',
      address: context.organization.address || '',
    },
  };
  // fire-and-forget: do not await so it never blocks the order confirmation
  fetch(`${url}/functions/v1/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
    body: JSON.stringify({ type: 'sale_notification', email: orgEmail || null, data: businessEmailData }),
  }).catch(e => console.error('[Business email] Error sending sale notification from WhatsApp agent:', e));

  return { order_id: order.id, order_number: order.order_number, total: grossTotal };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
  try {
    const body = await request.json(); const slug = text(body.organization_slug); if (!slug || !/^[a-z0-9-]{2,80}$/.test(slug)) throw new Error("El enlace del negocio no es válido.");
    const context = await getContext(slug);
    if (body.action === "welcome") return json({ organization: { name: context.organization.name, currency: context.organization.currency, online_enabled: Boolean(context.branch.accepts_online) }, message: `¡Hola! Soy el asistente de ${context.organization.name}. ¿Qué te gustaría pedir hoy?` });
    if (body.action === "chat") { const reply = await askAgent(Array.isArray(body.messages) ? body.messages.slice(-10) : [], body.cart, context, text(body.phone)); const requestedCart = Array.isArray(reply.cart) ? reply.cart : []; const validCart = requestedCart.length ? validateCart(requestedCart, context) : []; return json({ message: text(reply.message), cart: validCart.map((item) => ({ product_id: item.product.id, name: item.product.name, quantity: item.quantity, notes: item.notes, variant_option_ids: item.options.map((option: any) => option.option.id), unit_price: item.grossUnitPrice })) }); }
    if (body.action === "confirm") return json(await confirmOrder(body.cart, body.customer, body.delivery, context));
    return json({ error: "Acción no reconocida." }, 400);
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Ocurrió un error inesperado." }, 400); }
});
