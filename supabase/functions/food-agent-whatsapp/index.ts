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

// Regex para detectar consulta de estado de pedido actual
const STATUS_RE =
  /\b(estado|como\s+va|dónde\s+viene|donde\s+viene|esta\s+listo|está\s+listo|seguimiento)\b/i;

// Regex para detectar consulta de historial de pedidos anteriores
const HISTORY_RE =
  /\b(historial|pedidos\s+anteriores|mis\s+pedidos|pedidos\s+pasados|compras\s+anteriores|que\s+he\s+pedido)\b/i;

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
  step: "post_checkout_email" | "checkout_email_prompt" | "delivery_method_prompt" | "delivery_address_prompt" | "address_detail" | "confirm_prompt" | "name" | null;
  data: { name?: string; phone?: string; notes?: string; customer_phone?: string };
}

interface Session {
  messages: Array<{ role: string; content: string }>;
  cart: CartItem[];
  collect: CollectState;
  org_slug: string;
  customer_name?: string;
  customer_email?: string;
  delivery_type?: "delivery" | "pickup";
  delivery_address?: string;
  delivery_fee?: number;
  delivery_lat?: number;
  delivery_lng?: number;
  /** Cuándo se validó la cobertura (vence a las 3 horas para no arrastrar datos de otro pedido). */
  delivery_validated_at?: string;
  /** Dirección con cobertura ya validada (si cambia, se vuelve a validar). */
  delivery_address_confirmed?: string;
  human_paused_at?: string;
  last_automated_message?: string;
  automated_message_sent_at?: string;
}

// ── Geo Utils ───────────────────────────────────────────────────────────────
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

function isPointInPolygon(point: { lat: number; lng: number }, vs: Array<{ lat: number; lng: number }>): boolean {
  const x = point.lng, y = point.lat;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].lng, yi = vs[i].lat;
    const xj = vs[j].lng, yj = vs[j].lat;
    
    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

interface DeliveryZone {
  id?: string;
  name?: string;
  fee?: number;
  type?: string;
  radius_km?: number;
  polygon?: Array<{ lat: number; lng: number }>;
  is_active?: boolean;
}

const POLYGON_TOLERANCE_KM = 0.06;

function toXYZ(point: { lat: number; lng: number }): [number, number, number] {
  const phi = point.lat * Math.PI / 180;
  const lam = point.lng * Math.PI / 180;
  return [
    Math.cos(phi) * Math.cos(lam),
    Math.cos(phi) * Math.sin(lam),
    Math.sin(phi),
  ];
}

function distanceToSegmentKm(point: { lat: number; lng: number }, a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const P = toXYZ(point);
  const A = toXYZ(a);
  const B = toXYZ(b);
  const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const ap = [P[0] - A[0], P[1] - A[1], P[2] - A[2]];
  const abLen2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  if (abLen2 === 0) return calculateDistance(point.lat, point.lng, a.lat, a.lng);
  const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / abLen2));
  const nearest = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
  return calculateDistance(point.lat, point.lng, nearest.lat, nearest.lng);
}

function distanceToPolygonKm(point: { lat: number; lng: number }, vs: Array<{ lat: number; lng: number }>): number {
  if (!vs || vs.length < 2) return Infinity;
  let min = Infinity;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const d = distanceToSegmentKm(point, vs[j], vs[i]);
    if (d < min) min = d;
  }
  return min;
}

function findZoneForLocation(point: { lat: number; lng: number }, storePoint: { lat: number; lng: number } | null, zones: DeliveryZone[]): DeliveryZone | null {
  const activeZones = (zones || []).filter((z) => z.is_active !== false);
  if (activeZones.length === 0) return null;
  for (const zone of activeZones) {
    if (zone.type === "polygon" && Array.isArray(zone.polygon) && zone.polygon.length >= 3) {
      if (isPointInPolygon(point, zone.polygon) || distanceToPolygonKm(point, zone.polygon) <= POLYGON_TOLERANCE_KM) return zone;
    }
  }
  if (storePoint) {
    const dist = calculateDistance(storePoint.lat, storePoint.lng, point.lat, point.lng);
    for (const zone of activeZones) {
      if (zone.type === "radius" && typeof zone.radius_km === "number" && zone.radius_km > 0 && dist <= zone.radius_km) return zone;
    }
  }
  return null;
}

type LatLng = { lat: number; lng: number };
type GeocodeResult = LatLng & { label: string; exact: boolean };

const NOMINATIM_HEADERS = { "User-Agent": "FoodHub-POS-WhatsApp/1.0" };
const INVALID_GEOCODE_TYPES = ["city", "state", "country", "suburb", "town", "village", "county", "municipality", "region", "province"];

// Quita depto/casa/block/etc. para buscar en el mapa; la dirección completa se guarda igual en el pedido.
function addressForGeocoding(address: string): string {
  const cleaned = address
    .replace(/\s*[,;-]?\s*\b(depto|dpto|dto|departamento|depa|casa|block|blk|torre|piso|oficina|of|local)\b\.?.*$/i, "")
    .trim();
  return cleaned || address.trim();
}

function geocodeLabel(item: any): string {
  const a = item?.address ?? {};
  const street = [a.road, a.house_number].filter(Boolean).join(" ");
  const area = a.suburb ?? a.city_district ?? a.city ?? a.town ?? a.village ?? a.municipality ?? "";
  const label = [street, area].filter(Boolean).join(", ");
  return label || String(item?.display_name ?? "").split(",").slice(0, 3).join(",");
}

// ~25 km alrededor del local: evita confundir "Valparaíso 500" con la ciudad de Valparaíso.
const SEARCH_RADIUS_DEG = 0.25;

async function nominatimSearch(query: string, near: LatLng | null): Promise<any[] | null> {
  const params = new URLSearchParams({ format: "json", addressdetails: "1", limit: "5", countrycodes: "cl", q: query });
  if (near) {
    const d = SEARCH_RADIUS_DEG;
    params.set("viewbox", `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
    params.set("bounded", "1");
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: NOMINATIM_HEADERS });
    if (!res.ok) {
      console.warn(`[geocode] Nominatim HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn("[geocode] Nominatim error:", error);
    return null;
  }
}

// Photon (OpenStreetMap, sin API key): respaldo cuando Nominatim no responde desde el servidor.
const PHOTON_AREA_TYPES = ["city", "district", "locality", "county", "state", "country"];

function photonToNominatim(feature: any): any {
  const p = feature?.properties ?? {};
  const [lon, lat] = feature?.geometry?.coordinates ?? [];
  const isArea = PHOTON_AREA_TYPES.includes(p.type);
  return {
    lat: String(lat),
    lon: String(lon),
    addresstype: isArea ? "city" : (p.type === "house" ? "house" : "road"),
    address: {
      road: p.street ?? (p.type === "street" ? p.name : undefined),
      house_number: p.housenumber,
      suburb: p.district,
      city: p.city ?? p.locality,
    },
    display_name: [p.name, p.street, p.housenumber, p.district, p.city].filter(Boolean).join(", "),
    country_code: p.countrycode,
  };
}

async function photonSearch(query: string, near: LatLng | null): Promise<any[] | null> {
  const params = new URLSearchParams({ q: query, limit: "5" });
  if (near) {
    const d = SEARCH_RADIUS_DEG;
    params.set("lat", String(near.lat));
    params.set("lon", String(near.lng));
    params.set("bbox", `${near.lng - d},${near.lat - d},${near.lng + d},${near.lat + d}`);
  }
  try {
    const res = await fetch(`https://photon.komoot.io/api/?${params}`, { headers: NOMINATIM_HEADERS });
    if (!res.ok) {
      console.warn(`[geocode] Photon HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    return (data?.features ?? [])
      .map(photonToNominatim)
      .filter((item: any) => (item.country_code ?? "CL").toUpperCase() === "CL");
  } catch (error) {
    console.warn("[geocode] Photon error:", error);
    return null;
  }
}

// Google Geocoding (opcional): se usa solo si existe el secreto GOOGLE_MAPS_API_KEY.
// Nominatim y Photon bloquean las consultas que salen de Supabase, así que sin clave
// las direcciones escritas normalmente no se pueden validar (la ubicación de WhatsApp sí).
function googleToNominatim(result: any): any {
  const component = (type: string) =>
    result.address_components?.find((c: any) => c.types?.includes(type))?.long_name;
  const types: string[] = result.types ?? [];
  const isExact = types.some((t) => ["street_address", "premise", "subpremise"].includes(t));
  const isStreet = types.includes("route") || types.includes("intersection");
  return {
    lat: String(result.geometry?.location?.lat),
    lon: String(result.geometry?.location?.lng),
    addresstype: isExact ? "house" : isStreet ? "road" : "city",
    address: {
      road: component("route"),
      house_number: isExact ? component("street_number") : undefined,
      city: component("administrative_area_level_3") ?? component("locality"),
    },
    display_name: result.formatted_address,
  };
}

async function googleSearch(query: string, near: LatLng | null): Promise<any[] | null> {
  const key = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!key) return null;
  const params = new URLSearchParams({ address: query, components: "country:CL", language: "es", key });
  if (near) {
    const d = SEARCH_RADIUS_DEG;
    params.set("bounds", `${near.lat - d},${near.lng - d}|${near.lat + d},${near.lng + d}`);
  }
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
    const data = await res.json();
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.warn(`[geocode] Google ${data.status}: ${data.error_message ?? ""}`);
      return null;
    }
    return (data.results ?? []).map(googleToNominatim);
  } catch (error) {
    console.warn("[geocode] Google error:", error);
    return null;
  }
}

function validResults(results: any[] | null): any[] {
  return (results ?? []).filter((item) => !INVALID_GEOCODE_TYPES.includes(item.addresstype));
}

async function searchWith(
  provider: (query: string, near: LatLng | null) => Promise<any[] | null>,
  query: string,
  near: LatLng | null,
  defaultArea: string | null
): Promise<any[]> {
  // Sin comuna ("Valparaíso 500"): probamos primero en la comuna del local.
  if (defaultArea && !query.includes(",")) {
    const valid = validResults(await provider(`${query}, ${defaultArea}`, near));
    if (valid.length) return valid;
  }
  if (near) {
    const valid = validResults(await provider(query, near));
    if (valid.length) return valid;
  }
  return validResults(await provider(query, null));
}

async function geocodeAddress(address: string, near: LatLng | null = null, defaultArea: string | null = null): Promise<GeocodeResult | null> {
  const query = addressForGeocoding(address);
  let valid: any[] = [];
  if (Deno.env.get("GOOGLE_MAPS_API_KEY")) valid = await searchWith(googleSearch, query, near, defaultArea);
  if (valid.length === 0) valid = await searchWith(nominatimSearch, query, near, defaultArea);
  if (valid.length === 0) valid = await searchWith(photonSearch, query, near, defaultArea);
  // Preferimos un resultado con número de casa; si no, el mapa solo ubicó la calle.
  const best = valid.find((item) => item.address?.house_number) ?? valid[0];
  if (!best) {
    console.warn(`[geocode] Sin resultados para "${query}"`);
    return null;
  }
  return {
    lat: parseFloat(best.lat),
    lng: parseFloat(best.lon),
    label: geocodeLabel(best),
    exact: Boolean(best.address?.house_number),
  };
}

async function reverseGeocodeRaw(point: LatLng): Promise<any | null> {
  try {
    const params = new URLSearchParams({ format: "json", addressdetails: "1", lat: String(point.lat), lon: String(point.lng) });
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, { headers: NOMINATIM_HEADERS });
    if (res.ok) {
      const data = await res.json();
      if (data?.address) return data;
    } else {
      console.warn(`[geocode] Nominatim reverse HTTP ${res.status}`);
    }
  } catch (error) {
    console.warn("[geocode] Nominatim reverse error:", error);
  }
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${point.lat}&lon=${point.lng}&limit=1`, { headers: NOMINATIM_HEADERS });
    if (!res.ok) return null;
    const feature = (await res.json())?.features?.[0];
    return feature ? photonToNominatim(feature) : null;
  } catch (error) {
    console.warn("[geocode] Photon reverse error:", error);
    return null;
  }
}

// Comuna del local, para completar direcciones escritas sin comuna.
async function areaName(point: LatLng | null): Promise<string | null> {
  if (!point) return null;
  const a = (await reverseGeocodeRaw(point))?.address;
  return a?.city ?? a?.town ?? a?.village ?? a?.municipality ?? null;
}

interface DeliveryOrg {
  slug: string;
  store_lat: number | null;
  store_lng: number | null;
  delivery_radius_km: number | null;
  delivery_polygon: Array<LatLng> | null;
  delivery_zones: DeliveryZone[] | null;
  delivery_fee: number | null;
  delivery_enabled: boolean | null;
  delivery_mode: string | null;
  delivery_modes: string[] | null;
  uber_enabled: boolean | null;
}

async function loadDeliveryOrg(slug: string): Promise<DeliveryOrg | null> {
  const { data } = await getSupabase()
    .from("organizations")
    .select("slug, store_lat, store_lng, delivery_radius_km, delivery_polygon, delivery_zones, delivery_fee, delivery_enabled, delivery_mode, delivery_modes, uber_enabled")
    .eq("slug", slug)
    .maybeSingle();
  return (data as DeliveryOrg) ?? null;
}

// Mismas reglas que el checkout web (delivery_modes nuevo, delivery_mode legacy).
function deliveryCapabilities(org: DeliveryOrg | null): { own: boolean; uber: boolean } {
  if (!org || org.delivery_enabled !== true) return { own: false, uber: false };
  const modes = Array.isArray(org.delivery_modes) ? org.delivery_modes : [org.delivery_mode || "own"];
  const uberAllowed = org.uber_enabled !== false;
  const own = modes.includes("own") || (!uberAllowed && modes.length === 1 && modes[0] === "uber_direct");
  return { own, uber: uberAllowed && modes.includes("uber_direct") };
}

function storePoint(org: DeliveryOrg): LatLng | null {
  return org.store_lat && org.store_lng ? { lat: Number(org.store_lat), lng: Number(org.store_lng) } : null;
}

function searchCenter(org: DeliveryOrg): LatLng | null {
  const store = storePoint(org);
  if (store) return store;
  const firstPoint = (org.delivery_zones ?? []).find((z) => z.polygon?.length)?.polygon?.[0];
  return firstPoint ? { lat: Number(firstPoint.lat), lng: Number(firstPoint.lng) } : null;
}

function resolveDeliveryZone(point: LatLng, org: DeliveryOrg): { fee: number; name?: string } | null {
  const store = storePoint(org);
  const zones = org.delivery_zones ?? [];
  if (zones.length > 0) {
    const zone = findZoneForLocation(point, store, zones);
    return zone ? { fee: Number(zone.fee ?? org.delivery_fee ?? 0), name: zone.name } : null;
  }
  if (!store) return null;
  if (Array.isArray(org.delivery_polygon) && org.delivery_polygon.length > 0) {
    return isPointInPolygon(point, org.delivery_polygon) ? { fee: Number(org.delivery_fee ?? 0) } : null;
  }
  const maxKm = org.delivery_radius_km || 5;
  return calculateDistance(store.lat, store.lng, point.lat, point.lng) <= maxKm ? { fee: Number(org.delivery_fee ?? 0) } : null;
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
  const org_slug = await resolveOrgSlug(phoneNumberId);
  const sessionKey = `${phone}_${org_slug}`;

  const sb = getSupabase();
  const { data } = await sb
    .from("whatsapp_sessions")
    .select("session_data")
    .eq("phone", sessionKey)
    .single();

  if (data?.session_data) {
    const session = data.session_data as Session;
    // Asegurar que conserva el org_slug correcto por si acaso
    session.org_slug = org_slug;
    return session;
  }

  return {
    messages: [],
    cart: [],
    collect: { active: false, step: null, data: {} },
    org_slug,
  };
}

async function saveSession(phone: string, session: Session): Promise<void> {
  const sessionKey = `${phone}_${session.org_slug}`;
  const sb = getSupabase();
  await sb.from("whatsapp_sessions").upsert(
    { phone: sessionKey, session_data: session, updated_at: new Date().toISOString() },
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
type ReplyButton = { id: string; title: string };

// Cada número de WhatsApp puede tener su propia clave de Kapso (KAPSO_API_KEY_<phone_number_id>).
function kapsoApiKey(phoneNumberId: string): string | undefined {
  return Deno.env.get(`KAPSO_API_KEY_${phoneNumberId}`) ?? Deno.env.get("KAPSO_API_KEY");
}

async function sendWhatsApp(phoneNumberId: string, to: string, text: string, buttons: ReplyButton[] = []): Promise<void> {
  const apiKey = kapsoApiKey(phoneNumberId);
  if (!apiKey) {
    console.warn("KAPSO_API_KEY no configurada — respuesta no enviada");
    return;
  }

  const interactiveButtons = buttons.slice(0, 3);
  const payload = interactiveButtons.length
    ? {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text },
          action: {
            buttons: interactiveButtons.map((button) => ({
              type: "reply",
              reply: { id: button.id, title: button.title },
            })),
          },
        },
      }
    : {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: text },
      };

  const res = await fetch(`https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`Kapso send error ${res.status}:`, err);
  }
}

// ── Formatear dinero ─────────────────────────────────────────────────────────
// Mensaje nativo de WhatsApp con el botón "Enviar ubicación".
async function sendLocationRequest(phoneNumberId: string, to: string, text: string): Promise<void> {
  const apiKey = kapsoApiKey(phoneNumberId);
  if (!apiKey) return;
  const res = await fetch(`https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: { type: "location_request_message", body: { text: text.slice(0, 1024) }, action: { name: "send_location" } },
    }),
  });
  if (!res.ok) {
    console.error(`Kapso location request error ${res.status}:`, await res.text());
    await sendWhatsApp(phoneNumberId, to, text + "\n\n(Para compartirla: 📎 → Ubicación)");
  }
}

function money(amount: number, currency = "CLP"): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ── Procesar un mensaje entrante ─────────────────────────────────────────────
function buildConfirmSummary(session: Session): string {
  const itemLines = session.cart
    .map((i) => `• ${i.quantity} × ${i.name} (${money(i.unit_price * i.quantity)})`)
    .join("\n");
  const subtotal = session.cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const fee = session.delivery_type === "delivery" && session.delivery_fee ? session.delivery_fee : 0;
  const total = money(subtotal + fee);

  let text = `🧾 *Resumen de tu pedido:*\n\n${itemLines}\n\n`;
  if (fee > 0) text += `Subtotal: ${money(subtotal)}\nDespacho: ${money(fee)}\n`;
  else if (session.delivery_type === "delivery") text += `Despacho: *Gratis*\n`;
  text += `*Total: ${total}*\n`;
  if (session.delivery_type === "delivery") text += `Tipo: *Delivery* (${session.delivery_address})\n`;
  else text += `Tipo: *Retiro en local*\n`;
  text += `A nombre de: *${session.customer_name || "Cliente"}*\n\n¿Confirmas tu pedido?`;
  return text;
}

function confirmSummaryOrAskName(session: Session, prefix = ""): string {
  if (!session.customer_name) {
    session.collect.step = "name";
    return prefix + "Antes de continuar, ¿a nombre de quién registramos el pedido?";
  }
  session.collect.step = "confirm_prompt";
  return prefix + buildConfirmSummary(session);
}

// ── Dirección de delivery: ubicación de WhatsApp primero, texto como alternativa ──
type FlowReply = { text: string; buttons?: ReplyButton[]; requestLocation?: boolean };

const LOCATION_PROMPT =
  "📍 Para saber si llegamos a tu domicilio, toca *Enviar ubicación* y compártenos tu ubicación.\n\n" +
  "¿Prefieres escribirla? Envía tu dirección así: *Calle Número, Comuna* (ej: _Av. Los Pajaritos 2000, Maipú_).";
const ADDRESS_DETAIL_PROMPT =
  "Para el repartidor, escribe tu *calle y número* (y depto o referencia si aplica).";
const SKIP_DETAIL_BUTTONS: ReplyButton[] = [{ id: "SKIP_DETAIL", title: "Omitir" }];
const PICKUP_BUTTONS: ReplyButton[] = [{ id: "PICKUP", title: "Retiro en local" }];
const DELIVERY_METHOD_BUTTONS: ReplyButton[] = [
  { id: "DELIVERY", title: "Delivery" },
  { id: "PICKUP", title: "Retiro en local" },
];

function storeUrl(slug: string): string {
  return `https://${slug}.foodhub.work`;
}

function noOwnDeliveryReply(org: DeliveryOrg | null, slug: string): FlowReply {
  const caps = deliveryCapabilities(org);
  return {
    text: caps.uber
      ? `Para envíos a domicilio debes hacer tu pedido en nuestra página web: ${storeUrl(slug)}\n\nSi prefieres, puedes retirarlo en el local.`
      : "Por ahora no hacemos envíos a domicilio, pero puedes retirar tu pedido en el local.",
    buttons: PICKUP_BUTTONS,
  };
}

function hasStreetNumber(text: string): boolean {
  return /\d/.test(addressForGeocoding(text));
}

function feeText(fee: number): string {
  return fee > 0 ? money(fee) : "Gratis";
}

// Pide la ubicación de WhatsApp (o la dirección escrita) si el local hace delivery propio.
async function startDeliveryAddress(session: Session): Promise<FlowReply> {
  const { collect } = session;
  const org = await loadDeliveryOrg(session.org_slug);
  collect.active = true;
  collect.data = {};
  if (!deliveryCapabilities(org).own) {
    session.delivery_type = undefined;
    collect.step = "delivery_method_prompt";
    return noOwnDeliveryReply(org, session.org_slug);
  }
  session.delivery_type = "delivery";
  collect.step = "delivery_address_prompt";
  return { text: LOCATION_PROMPT, requestLocation: true };
}

function outOfZoneReply(org: DeliveryOrg, slug: string, fromLocation: boolean): FlowReply {
  const uberText = deliveryCapabilities(org).uber
    ? `\nTambién puedes pedir con envío por Uber en nuestra página web: ${storeUrl(slug)}\n`
    : "";
  return {
    text: `😕 ${fromLocation ? "Tu ubicación está" : "Esa dirección está"} fuera de nuestra zona de reparto.\n${uberText}\n` +
      "Si la entrega es en otro lugar, envía esa ubicación o escribe la dirección. También puedes retirar en el local.",
    buttons: PICKUP_BUTTONS,
  };
}

function applyDeliveryAddress(session: Session, address: string): void {
  session.delivery_type = "delivery";
  session.delivery_address = address;
  session.delivery_address_confirmed = address;
}

// Con la cobertura validada: si no hay productos seguimos el pedido; si hay, mostramos el resumen.
function continueAfterAddress(session: Session, prefix: string): string {
  const { collect } = session;
  if (session.cart.length === 0) {
    collect.active = false;
    collect.step = null;
    collect.data = {};
    const text = `${prefix}\n\n¿Qué te gustaría pedir? 😊`;
    session.messages.push({ role: "assistant", content: text });
    return text;
  }
  return confirmSummaryOrAskName(session, `${prefix}\n\n`);
}

// Valida la cobertura de una ubicación compartida o de una dirección escrita. No muestra mapa.
async function handleDeliveryAddress(
  session: Session,
  input: { text?: string; point?: LatLng & { name?: string; address?: string } }
): Promise<FlowReply> {
  const { collect } = session;
  const org = await loadDeliveryOrg(session.org_slug);
  if (!org || !deliveryCapabilities(org).own) return startDeliveryAddress(session);

  collect.active = true;
  collect.data = {};
  collect.step = "delivery_address_prompt";

  if (input.point) {
    const point = { lat: input.point.lat, lng: input.point.lng };
    const zone = resolveDeliveryZone(point, org);
    if (!zone) return outOfZoneReply(org, session.org_slug, true);
    session.delivery_type = "delivery";
    session.delivery_fee = zone.fee;
    session.delivery_lat = point.lat;
    session.delivery_lng = point.lng;
    session.delivery_validated_at = new Date().toISOString();
    const coverage = `✅ ¡Llegamos a tu ubicación! Envío: *${feeText(zone.fee)}*`;
    // Si compartió un lugar con dirección (ej: un edificio), la usamos; si no, pedimos calle y número.
    const sharedAddress = [input.point.name, input.point.address].filter(Boolean).join(", ");
    if (sharedAddress && hasStreetNumber(sharedAddress)) {
      applyDeliveryAddress(session, sharedAddress);
      return { text: continueAfterAddress(session, coverage) };
    }
    collect.step = "address_detail";
    return { text: `${coverage}\n\n${ADDRESS_DETAIL_PROMPT}`, buttons: SKIP_DETAIL_BUTTONS };
  }

  const text = (input.text ?? "").trim().replace(/\s+/g, " ");
  if (!hasStreetNumber(text)) {
    return { text: "Necesito la *calle y el número* para validar la cobertura.\n\n" + LOCATION_PROMPT, requestLocation: true };
  }
  const center = searchCenter(org);
  const defaultArea = addressForGeocoding(text).includes(",") ? null : await areaName(center);
  const geo = await geocodeAddress(text, center, defaultArea);
  if (!geo) {
    return {
      text: "No pudimos validar esa dirección 😕\n\nCompártenos tu ubicación tocando *Enviar ubicación* y la revisamos al instante. " +
        "También puedes escribir *retiro* para retirar en el local.",
      requestLocation: true,
    };
  }
  const zone = resolveDeliveryZone(geo, org);
  if (!zone) return outOfZoneReply(org, session.org_slug, false);
  session.delivery_fee = zone.fee;
  session.delivery_lat = geo.lat;
  session.delivery_lng = geo.lng;
  session.delivery_validated_at = new Date().toISOString();
  applyDeliveryAddress(session, text);
  return { text: continueAfterAddress(session, `✅ ¡Llegamos a tu dirección! Envío: *${feeText(zone.fee)}*`) };
}

function resetDelivery(session: Session): void {
  delete session.delivery_type;
  delete session.delivery_address;
  delete session.delivery_address_confirmed;
  delete session.delivery_fee;
  delete session.delivery_lat;
  delete session.delivery_lng;
  delete session.delivery_validated_at;
}

const DELIVERY_VALIDATION_TTL_MS = 3 * 60 * 60 * 1000;

// Datos de entrega de un pedido anterior (o de versiones viejas del bot) no se reutilizan.
function deliveryIsStale(session: Session): boolean {
  if (!session.delivery_lat && !session.delivery_address_confirmed) return false;
  const validatedAt = session.delivery_validated_at ? new Date(session.delivery_validated_at).getTime() : 0;
  return !validatedAt || Date.now() - validatedAt > DELIVERY_VALIDATION_TTL_MS;
}

const NEW_ORDER_RE = /\b(olvida|olvidemos|empecemos de nuevo|empezar de nuevo|desde cero|nuevo pedido|pedido nuevo|otro pedido)\b/i;

function isPlaceholderAddress(value: string): boolean {
  return /unknown|null|undefined|desconocid|n\/a|^<.*>$/i.test(value.trim());
}

// En el paso de la referencia, distingue "Edificio VTR" de "agrega una coca".
function looksLikeOrderChange(text: string): boolean {
  return /\b(agrega|agregar|añade|añadir|quiero|quita|quitar|saca|sacar|cambia|cambiar|tambi[eé]n|otra|otro|menos|m[aá]s)\b/i.test(text);
}

// La IA a veces devuelve saltos de línea escapados ("\n" literal).
function cleanAiText(message: unknown): string {
  return typeof message === "string" ? message.replace(/\\n/g, "\n").trim() : "(sin respuesta)";
}

function choosePickup(session: Session, prefix = ""): string {
  session.delivery_type = "pickup";
  session.delivery_fee = 0;
  return confirmSummaryOrAskName(session, prefix);
}

function normalizeCommand(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLowerCase().replace(/[.!?¿¡]/g, "").replace(/\s+/g, " ");
}
function isConfirmCommand(value: string): boolean {
  const command = normalizeCommand(value);
  return command === "order_confirm" || command === "confirm_order"
    || /^(si|yes|ok|okay|perfecto|dale|confirmo|confirmar|listo|claro|bueno|yep|s)(?:$|[,\s])/i.test(command)
    || /^(confirmo|confirmar) (el )?pedido\b/i.test(command);
}
function isCancelCommand(value: string): boolean {
  const command = normalizeCommand(value);
  return command === "order_cancel" || /^(no|no gracias|cancelar|cancelar pedido|espera)(?:$|[,\s])/i.test(command);
}
function isEditCommand(value: string): boolean {
  const command = normalizeCommand(value);
  return command === "order_edit" || /^(modificar|editar|cambiar|quiero modificar)(?:$|[,\s])/i.test(command);
}
function extractMessageText(message: any): string {
  let value = "";
  if (message?.type === "text") value = message.text?.body ?? "";
  else if (message?.type === "button") value = message.button?.payload ?? message.button?.text ?? "";
  else if (message?.type === "interactive") {
    value = message.interactive?.button_reply?.id ?? message.interactive?.button_reply?.title
      ?? message.interactive?.list_reply?.id ?? message.interactive?.list_reply?.title ?? "";
  }
  return typeof value === "string" ? value.trim() : "";
}
function extractContactName(evt: any, body: any, message: any): string {
  const candidates = [evt?.contact?.profile?.name, evt?.contacts?.[0]?.profile?.name,
    body?.contacts?.[0]?.profile?.name, message?.contacts?.[0]?.profile?.name];
  return candidates.find((value) => typeof value === "string" && value.trim())?.trim() ?? "";
}

// ── Consultar Estado del Pedido Reciente ──────────────────────────────────────
async function handleGetOrderStatus(
  userPhone: string,
  session: Session
): Promise<string> {
  const sb = getSupabase();
  const { data: orgData } = await sb
    .from("organizations")
    .select("id, name")
    .eq("slug", session.org_slug)
    .maybeSingle();

  if (!orgData) {
    return "Lo siento, no pude encontrar la información del local.";
  }

  // Buscamos primero pedidos activos ('pending', 'confirmed', 'ready')
  let { data: order, error } = await sb
    .from("orders")
    .select(`
      order_number,
      status,
      delivery_type,
      created_at,
      order_items (
        product_name,
        quantity
      )
    `)
    .eq("organization_id", orgData.id)
    .eq("customer_phone", userPhone)
    .in("status", ["pending", "confirmed", "ready"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Si no hay pedidos activos, buscar el último pedido finalizado/cancelado
  if (!order && !error) {
    const { data: lastOrder, error: lastError } = await sb
      .from("orders")
      .select(`
        order_number,
        status,
        delivery_type,
        created_at,
        order_items (
          product_name,
          quantity
        )
      `)
      .eq("organization_id", orgData.id)
      .eq("customer_phone", userPhone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    order = lastOrder;
    error = lastError;
  }

  if (error) {
    console.error("Error fetching order status:", error);
    return "Ocurrió un error al buscar tu pedido. Por favor, inténtalo de nuevo en unos minutos.";
  }

  if (!order) {
    return `Hola, no encontré ningún pedido reciente asociado al número *${userPhone}* en *${orgData.name}*.`;
  }

  const itemsList = (order.order_items || [])
    .map((i: any) => `${i.quantity}x ${i.product_name}`)
    .join(", ");
  
  let statusDesc = "";
  switch (order.status) {
    case "pending":
      statusDesc = "está *recibido y pendiente* de aprobación por el local. En unos minutos lo confirmarán 🕒.";
      break;
    case "confirmed":
      statusDesc = "ha sido *confirmado* y ya se está preparando en la cocina 🍳.";
      break;
    case "ready":
      if (order.delivery_type === "delivery") {
        statusDesc = "está *listo para despacho* y pronto saldrá en camino 🛵.";
      } else {
        statusDesc = "está *listo para retirar* en el local. ¡Ya puedes pasar por él! 📍";
      }
      break;
    case "delivered":
      statusDesc = "figura como *entregado* ✅. ¡Espero que lo hayas disfrutado!";
      break;
    case "cancelled":
      statusDesc = "ha sido *cancelado* ❌.";
      break;
    default:
      statusDesc = `se encuentra en estado: *${order.status}*.`;
  }

  const date = new Date(order.created_at);
  const timeStr = date.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" });
  const dateStr = date.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", timeZone: "America/Santiago" });

  return `🔍 *Estado de tu pedido #${order.order_number}* (del ${dateStr} a las ${timeStr}):\n\n` +
         `Detalle: _${itemsList || "Sin detalle"}_.\n\n` +
         `Tu pedido ${statusDesc}`;
}

// ── Consultar Historial de Pedidos ──────────────────────────────────────────
async function handleGetOrderHistory(
  userPhone: string,
  session: Session
): Promise<string> {
  const sb = getSupabase();
  const { data: orgData } = await sb
    .from("organizations")
    .select("id, name")
    .eq("slug", session.org_slug)
    .maybeSingle();

  if (!orgData) {
    return "Lo siento, no pude encontrar la información del local.";
  }

  // Buscamos los últimos 3 pedidos del cliente
  const { data: orders, error } = await sb
    .from("orders")
    .select(`
      order_number,
      status,
      delivery_type,
      total,
      created_at,
      order_items (
        product_name,
        quantity
      )
    `)
    .eq("organization_id", orgData.id)
    .eq("customer_phone", userPhone)
    .order("created_at", { ascending: false })
    .limit(3);

  if (error) {
    console.error("Error fetching order history:", error);
    return "Ocurrió un error al buscar tu historial de pedidos. Por favor, inténtalo de nuevo.";
  }

  if (!orders || orders.length === 0) {
    return `Hola, no registramos pedidos anteriores para el número *${userPhone}* en *${orgData.name}*.`;
  }

  let text = `📜 *Tu historial de pedidos en ${orgData.name}* (Últimos ${orders.length}):\n\n`;

  orders.forEach((order: any, index: number) => {
    const date = new Date(order.created_at);
    const dateStr = date.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", timeZone: "America/Santiago" });
    const itemsList = (order.order_items || [])
      .map((i: any) => `${i.quantity}x ${i.product_name}`)
      .join(", ");
    
    let statusEmoji = "";
    switch (order.status) {
      case "pending": statusEmoji = "🕒 Pendiente"; break;
      case "confirmed": statusEmoji = "🍳 En cocina"; break;
      case "ready": statusEmoji = "📦 Listo"; break;
      case "delivered": statusEmoji = "✅ Entregado"; break;
      case "cancelled": statusEmoji = "❌ Cancelado"; break;
      default: statusEmoji = order.status;
    }

    text += `${index + 1}. *Pedido #${order.order_number}* (${dateStr})\n`;
    text += `   • Detalle: _${itemsList || "Sin detalle"}_\n`;
    text += `   • Total: *${money(order.total)}*\n`;
    text += `   • Estado: *${statusEmoji}*\n\n`;
  });

  text += `Si quieres saber más detalles de tu pedido en curso, puedes escribir *"estado"* en cualquier momento.`;
  return text;
}

async function processMessage(
  userPhone: string,
  phoneNumberId: string,
  userText: string,
  pushName?: string,
  sharedLocation?: LatLng & { name?: string; address?: string }
): Promise<void> {
  const session = await loadSession(userPhone, phoneNumberId);
  
  // Guardar el nombre de perfil si no tenemos nombre
  if (session.delivery_address && isPlaceholderAddress(session.delivery_address)) {
    delete session.delivery_address;
  }
  if (deliveryIsStale(session)) resetDelivery(session);
  if (NEW_ORDER_RE.test(userText)) {
    // "Olvida todo, hagamos un pedido nuevo": la entrega también empieza de cero.
    resetDelivery(session);
    session.collect = { active: false, step: null, data: {} };
  }
  if (!session.customer_name && pushName) {
    session.customer_name = pushName;
  }
  if (!session.customer_name) {
    const supabase = getSupabase();
    const { data: orgData } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", session.org_slug)
      .maybeSingle();
    if (orgData) {
      const { data: customer } = await supabase
        .from("customers")
        .select("full_name")
        .eq("organization_id", orgData.id)
        .eq("phone", userPhone)
        .maybeSingle();
      if (customer?.full_name) session.customer_name = customer.full_name;
    }
  }

  const { collect } = session;
  
  // Reanudar automáticamente si han pasado más de 6 horas desde la pausa humana
  if (session.human_paused_at) {
    const pausedAt = new Date(session.human_paused_at).getTime();
    if (Date.now() - pausedAt > 6 * 60 * 60 * 1000) {
      session.human_paused_at = undefined;
    } else {
      console.log(`Mensaje ignorado, sesión pausada por intervención humana. Phone: ${userPhone}`);
      return;
    }
  }

  let replyText = "";
  let replyButtons: ReplyButton[] | undefined;
  let replyRequestLocation = false;
  const setReply = (reply: FlowReply) => {
    replyText = reply.text;
    replyButtons = reply.buttons;
    replyRequestLocation = Boolean(reply.requestLocation);
  };
  const command = normalizeCommand(userText);

  const addressReady = () =>
    Boolean(session.delivery_address_confirmed) && session.delivery_address_confirmed === session.delivery_address;

  // Chat con la IA. Después de cada respuesta empujamos al siguiente paso para cerrar la venta:
  // tipo de entrega → ubicación → referencia → resumen con botón "Confirmar pedido".
  const runChat = async () => {
    const hadItems = session.cart.length > 0;
    session.messages.push({ role: "user", content: userText });
    const d = await callFoodAgent({
      organization_slug: session.org_slug,
      action: "chat",
      messages: session.messages.slice(-10),
      cart: session.cart,
      phone: userPhone,
    });
    if (Array.isArray(d.cart)) session.cart = d.cart;
    // "Olvida todo" / carrito vaciado: empezamos la entrega de cero.
    if (hadItems && session.cart.length === 0) resetDelivery(session);
    if (d.delivery_type) session.delivery_type = d.delivery_type;
    // La IA a veces devuelve marcadores como "<UNKNOWN>": solo cuenta si tiene calle y número.
    const rawAddress = typeof d.delivery_address === "string" ? d.delivery_address.trim() : "";
    const newAddress = rawAddress && !isPlaceholderAddress(rawAddress) && hasStreetNumber(rawAddress) ? rawAddress : "";
    const addressChanged = Boolean(newAddress) &&
      newAddress !== session.delivery_address && newAddress !== session.delivery_address_confirmed;
    if (newAddress) session.delivery_address = newAddress;

    const aiMessage = cleanAiText(d.message);
    const withAi = (text: string) => (aiMessage && aiMessage.length + text.length < 950 ? `${aiMessage}\n\n${text}` : text);

    if (session.delivery_type === "delivery" && addressChanged) {
      setReply(await handleDeliveryAddress(session, { text: newAddress }));
    } else if (session.cart.length === 0) {
      replyText = aiMessage;
    } else if (!session.delivery_type) {
      collect.active = true;
      collect.data = {};
      collect.step = "delivery_method_prompt";
      replyText = withAi("¿Será *Delivery* o *Retiro en local*?");
      replyButtons = DELIVERY_METHOD_BUTTONS;
    } else if (session.delivery_type === "delivery" && !addressReady()) {
      if (session.delivery_lat && session.delivery_lng && session.delivery_fee != null) {
        // La cobertura ya está validada; solo falta la referencia para el repartidor.
        collect.active = true;
        collect.data = {};
        collect.step = "address_detail";
        replyText = withAi(ADDRESS_DETAIL_PROMPT);
        replyButtons = SKIP_DETAIL_BUTTONS;
      } else {
        const reply = await startDeliveryAddress(session);
        setReply({ ...reply, text: withAi(reply.text) });
      }
    } else {
      // Productos y entrega listos: siempre cerramos con el resumen y el botón de confirmar.
      collect.active = true;
      collect.data = {};
      replyText = withAi(confirmSummaryOrAskName(session));
    }
    session.messages.push({ role: "assistant", content: replyText });
  };
  const leaveCollectAndChat = async () => {
    collect.active = false;
    collect.step = null;
    collect.data = {};
    await runChat();
  };

  // ── Flujo de recolección conversacional ─────────────────────────────────
  if (collect.active) {
    if (collect.step !== "confirm_prompt" && isCancelCommand(userText)) {
      collect.active = false;
      collect.step = null;
      collect.data = {};
      replyText = "Entendido, no confirmamos el pedido. ¿Deseas modificar algo en tu carrito?";
    } else if (collect.step === "name") {
      const customerName = userText.trim().replace(/\s+/g, " ");
      if (!/^[\p{L}][\p{L}\p{M}'’. -]{1,79}$/u.test(customerName)) {
        replyText = "Por favor escribe tu nombre para registrar el pedido.";
      } else {
        session.customer_name = customerName;
        if (!session.delivery_type) {
          collect.step = "delivery_method_prompt";
          replyText = "¿El pedido será con *Delivery* o *Retiro en local*?"; replyButtons = DELIVERY_METHOD_BUTTONS;
        } else if (session.delivery_type === "delivery" && session.delivery_address_confirmed !== session.delivery_address) {
          setReply(await startDeliveryAddress(session));
        } else {
          replyText = confirmSummaryOrAskName(session);
        }
      }
    } else if (collect.step === "post_checkout_email") {
      const emailText = userText.trim().toLowerCase();
      const isNo = normalizeCommand(emailText) === "no";
      
      if (isNo) {
        replyText = "¡Entendido! Te avisaremos por aquí cuando tu pedido esté listo.";
        collect.active = false;
        collect.step = null;
        collect.data = {};
      } else if (/^\S+@\S+\.\S+$/.test(emailText)) {
        session.customer_email = emailText;
        const supabase = getSupabase();
        const { data: orgData } = await supabase.from("organizations").select("id").eq("slug", session.org_slug).maybeSingle();
        if (orgData) {
            await supabase.from("customers").update({ email: emailText }).eq("organization_id", orgData.id).eq("phone", userPhone);
        }
        replyText = "¡Correo guardado! Te avisaremos por aquí cuando tu pedido esté listo.";
        collect.active = false;
        collect.step = null;
        collect.data = {};
      } else {
        replyText = "Por favor ingresa un correo válido o escribe 'no' para omitir.";
      }
    } else if (collect.step === "delivery_method_prompt") {
      const txt = userText.trim().toLowerCase();
      if (command === "pickup" || txt.includes("retiro") || txt.includes("local") || txt === "1") {
        replyText = choosePickup(session);
      } else if (sharedLocation || txt.includes("delivery") || txt.includes("despacho") || txt.includes("domicilio") || txt === "2") {
        setReply(sharedLocation
          ? await handleDeliveryAddress(session, { point: sharedLocation })
          : await startDeliveryAddress(session));
      } else {
        // No eligió entrega (ej: agregó otro producto): lo atiende la IA.
        await leaveCollectAndChat();
      }
    } else if (collect.step === "delivery_address_prompt") {
      if (sharedLocation) {
        setReply(await handleDeliveryAddress(session, { point: sharedLocation }));
      } else if (command === "pickup" || command.includes("retiro")) {
        replyText = choosePickup(session, "¡Entendido! Pasamos tu pedido a retiro.\n\n");
      } else if (!hasStreetNumber(userText)) {
        // No parece una dirección (ej: "quiero agregar una bebida"): lo atiende la IA.
        await leaveCollectAndChat();
      } else {
        setReply(await handleDeliveryAddress(session, { text: userText }));
      }
    } else if (collect.step === "address_detail") {
      // Ya validamos la cobertura con la ubicación; falta la dirección para el repartidor.
      if (sharedLocation) {
        setReply(await handleDeliveryAddress(session, { point: sharedLocation }));
      } else if (command === "pickup" || command.includes("retiro")) {
        replyText = choosePickup(session, "¡Entendido! Pasamos tu pedido a retiro.\n\n");
      } else if (command === "skip_detail" || command === "omitir") {
        applyDeliveryAddress(session, "Ubicación compartida por WhatsApp");
        replyText = continueAfterAddress(session, "👍 ¡Listo!");
      } else if (userText.trim() && !looksLikeOrderChange(userText)) {
        // Cualquier referencia sirve: "Santa Priscila 3124", "Edificio VTR, depto 502", etc.
        applyDeliveryAddress(session, userText.trim().replace(/\s+/g, " "));
        replyText = continueAfterAddress(session, "👍 ¡Gracias!");
      } else {
        await leaveCollectAndChat();
      }
    } else if (collect.step === "confirm_prompt") {
      // Verificar si respondió afirmativamente
      if (isConfirmCommand(userText) && !session.customer_name) {
        collect.step = "name";
        replyText = "Antes de confirmar, ¿a nombre de quién registramos el pedido?";
      } else if (isConfirmCommand(userText)) {
        const cartSnapshot = [...session.cart];
        const confirmData = await callFoodAgent({
          organization_slug: session.org_slug,
          action: "confirm",
          channel: "whatsapp",
          cart: cartSnapshot,
          delivery: {
            type: session.delivery_type,
            address: session.delivery_address,
            fee: session.delivery_fee
          },
          customer: {
            name: session.customer_name || "Cliente WhatsApp",
            phone: userPhone,
            email: session.customer_email,
            notes: session.delivery_type === "delivery" && session.delivery_lat && session.delivery_lng
              ? `Ubicación: https://maps.google.com/?q=${session.delivery_lat},${session.delivery_lng}`
              : "",
          },
        });

        if (confirmData.order_number) {
          const itemLines = cartSnapshot
            .map((i) => `• ${i.quantity} × ${i.name}`)
            .join("\n");
          const totalAmount = confirmData.total;
          const total = money(totalAmount);

          replyText =
            `✅ *Pedido confirmado*\n` +
            `Número: *${confirmData.order_number}*\n\n` +
            `${itemLines}\n\n` +
            `Total: *${total}*\n` +
            `\nA nombre de: *${session.customer_name || "Cliente WhatsApp"}*\n` +
            `El local te contactará pronto para coordinar 🙌\n\n` +
            `Para enviarte el comprobante de venta, ¿cuál es tu *correo electrónico*? (Si no lo deseas, simplemente escribe 'no')`;

          // Limpiar el carrito y la entrega, y mover a pedir correo
          session.cart = [];
          resetDelivery(session);
          session.messages = [];
          collect.step = "post_checkout_email";
          collect.data = {};
        } else if (confirmData.store_closed) {
          // La tienda cerró (manualmente o por horario) mientras el cliente armaba el pedido.
          replyText = `🔒 ${confirmData.error ?? "En este momento el local está cerrado."}`;
          session.cart = [];
          session.messages = [];
          collect.active = false;
          collect.step = null;
          collect.data = {};
        } else {
          replyText =
            "⚠ " +
            (confirmData.error ?? "Error al confirmar.") +
            "\nTu carrito sigue guardado, inténtalo de nuevo.";
          collect.active = true;
          collect.step = "confirm_prompt";
          collect.data = {};
        }
      } else if (isCancelCommand(userText)) {
        collect.active = false;
        collect.step = null;
        collect.data = {};
        replyText = "Entendido, no confirmamos el pedido. Si quieres, puedes volver a modificarlo.";
      } else if (isEditCommand(userText)) {
        collect.active = false;
        collect.step = null;
        collect.data = {};
        replyText = "Claro, dime qué deseas agregar, quitar o cambiar.";
      } else {
        // El cliente puede escribir un cambio en vez de usar los botones.
        await leaveCollectAndChat();
      }
    }

  // ── Intención de confirmar ────────────────────────────────────────────────
  // ── Ubicación compartida desde WhatsApp ───────────────────────────────────
  } else if (sharedLocation) {
    collect.active = true;
    collect.data = {};
    session.delivery_type = "delivery";
    setReply(await handleDeliveryAddress(session, { point: sharedLocation }));

  // ── Intención de confirmar ────────────────────────────────────────────────
  } else if (CONFIRM_RE.test(userText) && session.cart.length > 0) {
    collect.active = true;
    collect.data = {};

    if (!session.delivery_type) {
      collect.step = "delivery_method_prompt";
      replyText = "¿El pedido será con *Delivery* o *Retiro en local*?"; replyButtons = DELIVERY_METHOD_BUTTONS;
    } else if (session.delivery_type === "delivery" && session.delivery_address_confirmed && session.delivery_address_confirmed === session.delivery_address) {
      // La cobertura de esta dirección ya está validada.
      replyText = confirmSummaryOrAskName(session);
    } else if (session.delivery_type === "delivery" && session.delivery_address && hasStreetNumber(session.delivery_address)) {
      setReply(await handleDeliveryAddress(session, { text: session.delivery_address }));
    } else if (session.delivery_type === "delivery") {
      setReply(await startDeliveryAddress(session));
    } else {
      replyText = confirmSummaryOrAskName(session);
    }

  } else if (CONFIRM_RE.test(userText) && session.cart.length === 0) {
    replyText =
      "Aún no tienes productos en tu pedido. ¡Cuéntame qué quieres pedir! 😊";

  // ── Consultar Estado del Pedido ───────────────────────────────────────────
  } else if (STATUS_RE.test(userText)) {
    replyText = await handleGetOrderStatus(userPhone, session);

  // ── Consultar Historial de Pedidos ─────────────────────────────────────────
  } else if (HISTORY_RE.test(userText)) {
    replyText = await handleGetOrderHistory(userPhone, session);

  // ── Chat normal con el agente ─────────────────────────────────────────────
  } else {
    const isGreeting = /^(hola|hi|buenas|hey|buenos\s+(días|dias|tardes|noches))\b/i.test(userText.trim());
    if (isGreeting && session.messages.length === 0) {
      const welcome = await callFoodAgent({
        organization_slug: session.org_slug,
        action: "welcome",
      });
      const nameStr = session.customer_name ? `¡Hola, ${session.customer_name}!` : "¡Hola!";
      replyText = `${nameStr} ${welcome.message ?? "¿Qué te gustaría pedir hoy?"}`;
      session.messages.push({ role: "assistant", content: replyText });
    } else {
      await runChat();
    }
  }

  // Persistir antes de enviar para que el eco de Kapso no parezca un mensaje humano.
  if (replyText) {
    session.last_automated_message = replyText;
    session.automated_message_sent_at = new Date().toISOString();
  }
  await saveSession(userPhone, session);
  if (replyText) {
    const buttons = replyButtons ?? (collect.active && collect.step === "confirm_prompt"
      ? [
          { id: "ORDER_CONFIRM", title: "Confirmar pedido" },
          { id: "ORDER_EDIT", title: "Modificar" },
          { id: "ORDER_CANCEL", title: "Cancelar" },
        ]
      : []);
    if (replyRequestLocation) await sendLocationRequest(phoneNumberId, userPhone, replyText);
    else await sendWhatsApp(phoneNumberId, userPhone, replyText, buttons);
  }
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

    // Solo procesar mensajes entrantes o salientes de texto
    const isIncoming = event.includes("message.received") || event.includes("messages");
    const isOutgoing = event.includes("message.sent") || event.includes("message_send") || (body.data && body.data[0]?.message?.fromMe === true);

    if (!isIncoming && !isOutgoing) {
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
        if (!message) return;

        const text = extractMessageText(message);
        const phoneNumberId: string =
          evt.phone_number_id ?? message.kapso?.phone_number_id ?? "";
          
        if (isOutgoing || message.fromMe) {
          const userPhone = message.to ?? evt.contact?.wa_id ?? evt.contacts?.[0]?.wa_id ?? "";
          if (!userPhone || !phoneNumberId || !text) return;
          const session = await loadSession(userPhone, phoneNumberId);
          // Verificar si el texto NO coincide con el último mensaje enviado por el AI
          const lastAiMsg = session.messages.slice().reverse().find(m => m.role === "assistant")?.content?.trim();
          const lastAutomatedAt = new Date(session.automated_message_sent_at ?? 0).getTime();
          const isRecentAutomatedMessage =
            text === session.last_automated_message &&
            Date.now() - lastAutomatedAt < 5 * 60 * 1000;
          if (!isRecentAutomatedMessage && text !== lastAiMsg) {
             console.log(`[Human Handover] Humano detectado enviando mensaje a ${userPhone}. Pausando AI.`);
             session.human_paused_at = new Date().toISOString();
             await saveSession(userPhone, session);
          }
          return;
        }

        const sharedLocation = message.type === "location" && message.location
          ? {
              lat: Number(message.location.latitude),
              lng: Number(message.location.longitude),
              name: typeof message.location.name === "string" ? message.location.name : undefined,
              address: typeof message.location.address === "string" ? message.location.address : undefined,
            }
          : undefined;
        const hasLocation = sharedLocation && Number.isFinite(sharedLocation.lat) && Number.isFinite(sharedLocation.lng);
        if (!text && !hasLocation) return;

        const userPhone: string =
          message.from ?? evt.contact?.wa_id ?? evt.contacts?.[0]?.wa_id ?? body.contacts?.[0]?.wa_id ?? "";

        const pushName = extractContactName(evt, body, message);

        if (!userPhone || !phoneNumberId) {
          console.warn("Evento sin userPhone o phoneNumberId:", JSON.stringify(evt));
          return;
        }

        await processMessage(userPhone, phoneNumberId, text, pushName, hasLocation ? sharedLocation : undefined);
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
