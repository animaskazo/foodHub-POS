import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
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
  const organizations = await db(`organizations?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id,name,currency,primary_color,default_tax_rate`);
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
      const group = [...groups.values()].find((candidate: any) => candidate.product_id === product.id && candidate.variant_options?.some((option: any) => option.id === id && option.is_active));
      const option = group?.variant_options.find((candidate: any) => candidate.id === id);
      if (!group || !option) throw new Error("Una opción elegida no pertenece al producto.");
      return { group, option };
    });
    for (const group of productGroups) if (group.is_required && !options.some((option: any) => option.group.id === group.id)) throw new Error(`${product.name} requiere elegir ${group.name}.`);
    const netUnitPrice = toNumber(product.base_price) + options.reduce((sum: number, item: any) => sum + toNumber(item.option.price_modifier), 0);
    const taxRate = context.organization.default_tax_rate ? toNumber(context.organization.default_tax_rate) / 100 : 0.19;
    const grossUnitPrice = Math.round(netUnitPrice * (1 + taxRate));
    return { product, quantity, notes: text(raw?.notes).slice(0, 280), options, netUnitPrice, grossUnitPrice };
  });
}
async function askAgent(messages: unknown[], cart: unknown[], context: Awaited<ReturnType<typeof getContext>>) {
  if (!claudeKey) throw new Error("Falta configurar CLAUDE_API_KEY en los secretos de la función.");
  const taxRate = context.organization.default_tax_rate ? toNumber(context.organization.default_tax_rate) / 100 : 0.19;
  const toGross = (net: number) => Math.round(net * (1 + taxRate));
  const menu = context.products.map((product) => {
    const prodIngs = (context.ingredients || []).filter((i: any) => i.product_id === product.id).map((i: any) => i.ingredients?.name).filter(Boolean);
    return { 
      id: product.id, 
      name: product.name, 
      description: product.description, 
      ingredients: prodIngs.length > 0 ? prodIngs.join(", ") : undefined,
      price: toGross(toNumber(product.base_price)), 
      variants: context.variants.filter((group: any) => group.product_id === product.id).map((group: any) => ({ id: group.id, name: group.name, required: group.is_required, options: group.variant_options?.filter((option: any) => option.is_active).map((option: any) => ({ id: option.id, name: option.name, price_modifier: toGross(toNumber(option.price_modifier)) })) })) 
    };
  });
  const instruction = `Eres el asistente de pedidos de ${context.organization.name}. Responde siempre en español, de forma cercana y breve. La carta adjunta es la única fuente de productos, precios y opciones. Nunca inventes productos, precios ni disponibilidad. Ayuda a armar el pedido y pregunta lo mínimo necesario por variantes obligatorias. Devuelve el carrito completo; conserva productos ya presentes salvo que el cliente pida cambiarlos. NUNCA calcules sumas ni el total del pedido, el sistema lo hará automáticamente. No confirmes ni cobres: la aplicación lo hace después. Cuando el pedido esté armado y correcto, pídele al cliente que diga la palabra "confirmar" para finalizar. Si la venta web está desactivada, igual responde preguntas sobre la carta, recomienda productos y puede armar el carrito, pero aclara que no se podrá confirmar el pedido todavía.\n\nCARTA: ${JSON.stringify(menu)}\n\nVENTA_WEB: ${Boolean(context.branch.accepts_online)}`;
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
async function confirmOrder(cart: unknown, customer: any, context: Awaited<ReturnType<typeof getContext>>) {
  if (!context.branch.accepts_online) throw new Error("Esta sucursal no está habilitada para recibir pedidos web.");
  const items = validateCart(cart, context);
  const customerName = text(customer?.name).trim(); const phone = text(customer?.phone).trim();
  if (!customerName || !phone) throw new Error("Indica tu nombre y teléfono para confirmar.");
  // Tu operación consolida estos pedidos como WhatsApp, incluso durante la etapa web.
  const orderType = "whatsapp";
  const taxRate = context.organization.default_tax_rate ? toNumber(context.organization.default_tax_rate) / 100 : 0.19;
  const netTotal = items.reduce((sum, item) => sum + item.netUnitPrice * item.quantity, 0);
  const grossTotal = Math.round(netTotal * (1 + taxRate));
  const taxAmount = grossTotal - netTotal;
  
  const custQuery = await db(`customers?organization_id=eq.${context.organization.id}&phone=eq.${encodeURIComponent(phone)}&select=id`);
  let customerId = custQuery?.[0]?.id;
  if (!customerId) {
    const newCust = await db("customers", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ organization_id: context.organization.id, full_name: customerName, phone: phone }) });
    customerId = newCust?.[0]?.id;
  } else {
    await db(`customers?id=eq.${customerId}`, { method: "PATCH", body: JSON.stringify({ full_name: customerName }) });
  }

  const orderRows = await db("orders", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ organization_id: context.organization.id, branch_id: context.branch.id, customer_id: customerId || null, order_type: orderType, status: "pending", customer_name: customerName, customer_phone: phone, notes: text(customer?.notes).slice(0, 280), subtotal: netTotal, tax_amount: taxAmount, total: grossTotal }) });
  const order = orderRows[0];
  const orderItems = items.map((item) => ({ order_id: order.id, product_id: item.product.id, product_name: item.product.name, quantity: item.quantity, unit_price: item.netUnitPrice, total_price: item.netUnitPrice * item.quantity, notes: item.notes || null }));
  await db("order_items", { method: "POST", body: JSON.stringify(orderItems) });
  const variants = items.flatMap((item, index) => item.options.map((selected: any) => ({ order_item_id: "", itemIndex: index, variant_group_id: selected.group.id, variant_option_id: selected.option.id, variant_group_name: selected.group.name, variant_option_name: selected.option.name, price_modifier: toNumber(selected.option.price_modifier) })));
  if (variants.length) { const createdItems = await db(`order_items?order_id=eq.${order.id}&select=id,product_id&order=created_at.asc`); const rows = variants.map(({ itemIndex, ...variant }: any) => ({ ...variant, order_item_id: createdItems[itemIndex]?.id })).filter((variant: any) => variant.order_item_id); if (rows.length) await db("order_item_variants", { method: "POST", body: JSON.stringify(rows) }); }
  
  await db("payments", { method: "POST", body: JSON.stringify({ order_id: order.id, method: "cash", status: "pending", amount: grossTotal }) });

  return { order_id: order.id, order_number: order.order_number, total: grossTotal };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
  try {
    const body = await request.json(); const slug = text(body.organization_slug); if (!slug || !/^[a-z0-9-]{2,80}$/.test(slug)) throw new Error("El enlace del negocio no es válido.");
    const context = await getContext(slug);
    if (body.action === "welcome") return json({ organization: { name: context.organization.name, currency: context.organization.currency, online_enabled: Boolean(context.branch.accepts_online) }, message: `¡Hola! Soy el asistente de ${context.organization.name}. ¿Qué te gustaría pedir hoy?` });
    if (body.action === "chat") { const reply = await askAgent(Array.isArray(body.messages) ? body.messages.slice(-10) : [], body.cart, context); const requestedCart = Array.isArray(reply.cart) ? reply.cart : []; const validCart = requestedCart.length ? validateCart(requestedCart, context) : []; return json({ message: text(reply.message), cart: validCart.map((item) => ({ product_id: item.product.id, name: item.product.name, quantity: item.quantity, notes: item.notes, variant_option_ids: item.options.map((option: any) => option.option.id), unit_price: item.grossUnitPrice })) }); }
    if (body.action === "confirm") return json(await confirmOrder(body.cart, body.customer, context));
    return json({ error: "Acción no reconocida." }, 400);
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Ocurrió un error inesperado." }, 400); }
});
