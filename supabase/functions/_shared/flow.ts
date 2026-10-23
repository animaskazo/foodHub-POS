export const FLOW_API_KEY = Deno.env.get("FLOW_API_KEY") ?? "";
export const FLOW_SECRET_KEY = Deno.env.get("FLOW_SECRET_KEY") ?? "";
export const FLOW_API_BASE_URL = (Deno.env.get("FLOW_API_BASE_URL") || "https://sandbox.flow.cl/api").replace(/\/$/, "");

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", ...headers },
  });
}

export function requireFlowCredentials() {
  if (!FLOW_API_KEY || !FLOW_SECRET_KEY) throw new Error("Faltan FLOW_API_KEY y FLOW_SECRET_KEY en los secretos de Supabase.");
}

async function signature(params: Record<string, string | number>) {
  requireFlowCredentials();
  const data = Object.keys(params).sort().map((key) => `${key}${params[key]}`).join("");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(FLOW_SECRET_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  return Array.from(digest).map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function flowRequest(
  endpoint: string,
  method: "GET" | "POST",
  input: Record<string, string | number>,
) {
  requireFlowCredentials();
  const params: Record<string, string | number> = { ...input, apiKey: FLOW_API_KEY };
  const signed = { ...params, s: await signature(params) };
  const url = new URL(`${FLOW_API_BASE_URL}/${endpoint.replace(/^\//, "")}`);
  const init: RequestInit = { method, headers: {} };
  if (method === "GET") {
    Object.entries(signed).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  } else {
    const form = new URLSearchParams();
    Object.entries(signed).forEach(([key, value]) => form.set(key, String(value)));
    init.headers = { "Content-Type": "application/x-www-form-urlencoded" };
    init.body = form;
  }
  const response = await fetch(url, init);
  const text = await response.text();
  let data: Record<string, unknown>;
  try { data = JSON.parse(text); } catch { throw new Error(`Flow respondió HTTP ${response.status} con un cuerpo inválido.`); }
  if (!response.ok || data.code || data.error) {
    const message = typeof data.message === "string" ? data.message : `Flow respondió HTTP ${response.status}.`;
    throw new Error(`${data.code ? `Flow ${data.code}: ` : ""}${message}`);
  }
  return data;
}

export function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export async function callerId(req: Request, sb = adminClient()) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  return !error && data.user ? data.user.id : null;
}

export async function isSuperAdmin(userId: string, sb = adminClient()) {
  const { data } = await sb.from("super_admins").select("user_id").eq("user_id", userId).maybeSingle();
  return Boolean(data);
}

export async function listFlowPlans() {
  const plans: Record<string, unknown>[] = [];
  let start = 0;
  while (true) {
    const page = await flowRequest("plans/list", "GET", { start, limit: 100 });
    const raw = page.data;
    const rows = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(rows)) plans.push(...rows);
    if (Number(page.hasMore) !== 1 || !Array.isArray(rows) || rows.length === 0) break;
    start += 100;
  }
  return plans;
}

export function callbackUrl() {
  const base = Deno.env.get("SUPABASE_URL") || "";
  if (!base) throw new Error("Falta SUPABASE_URL en el entorno de Supabase.");
  return `${base.replace(/\/$/, "")}/functions/v1/flow-subscription-callback`;
}

export function safeReturnUrl(origin: string | null) {
  if (!origin) throw new Error("No se pudo validar el sitio de retorno.");
  const url = new URL(origin);
  const allowed = url.protocol === "https:" && (
    url.hostname === "foodhub.work" ||
    url.hostname.endsWith(".foodhub.work") ||
    url.hostname === "food-admin.digital-solutions.work" ||
    url.hostname.endsWith(".vercel.app")
  );
  if (!allowed) throw new Error("El sitio de retorno no está autorizado.");
  return `${url.origin}/subscription?flow=return`;
}
