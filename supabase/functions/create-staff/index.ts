// Gestión de personal con PIN (solo Super Admin).
// Acciones: create | reset-pin | set-active | set-supremo | claim-store
// - create: { email, full_name?, organization_id } -> crea usuario + staff cashier, devuelve PIN (única vez)
// - reset-pin: { user_id } -> nuevo PIN (must_change_pin=true), devuelve PIN (única vez)
// - set-active: { user_id, is_active } -> activa/desactiva cuenta
// - set-supremo: { user_id, value } -> otorga/revoca super admin
// - claim-store: sin args -> el llamante (owner de algún local) se registra como super admin
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function randomPin(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}

async function callerId(req: Request): Promise<string | null> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const sb = adminClient();
  const { data, error } = await sb.auth.getUser(jwt);
  if (error || !data?.user) return null;
  return data.user.id;
}

async function isSupremo(sb: ReturnType<typeof adminClient>, userId: string): Promise<boolean> {
  const { data } = await sb.from("super_admins").select("user_id").eq("user_id", userId).maybeSingle();
  return !!data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const action = String(body.action || "");
  const sb = adminClient();
  const me = await callerId(req);
  if (!me) return json({ error: "No autenticado" }, 401);

  // claim-store: el dueño de un local se registra como super admin (alta inicial).
  if (action === "claim-store") {
    const { data: owns } = await sb
      .from("staff")
      .select("id")
      .eq("id", me)
      .eq("role", "owner")
      .maybeSingle();
    if (!owns) return json({ error: "Solo el dueño de un local puede registrarse como super admin" }, 403);
    const { error } = await sb.from("super_admins").upsert({ user_id: me }, { onConflict: "user_id" });
    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  if (!(await isSupremo(sb, me))) return json({ error: "Solo Super Admin" }, 403);

  if (action === "create") {
    const email = String(body.email || "").trim().toLowerCase();
    const fullName = String(body.full_name || "").trim() || email.split("@")[0];
    const organizationId = String(body.organization_id || "");
    if (!email || !organizationId) return json({ error: "email y organization_id requeridos" }, 400);
    const pin = randomPin();
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
      user_metadata: { full_name: fullName, must_change_pin: true },
    });
    if (createErr || !created?.user) return json({ error: createErr?.message || "No se pudo crear el usuario" }, 500);
    const { error: staffErr } = await sb.from("staff").insert({
      id: created.user.id,
      organization_id: organizationId,
      full_name: fullName,
      role: "cashier",
      is_active: true,
    });
    if (staffErr) {
      await sb.auth.admin.deleteUser(created.user.id);
      return json({ error: staffErr.message }, 500);
    }
    return json({ success: true, user_id: created.user.id, pin });
  }

  if (action === "reset-pin") {
    const userId = String(body.user_id || "");
    if (!userId) return json({ error: "user_id requerido" }, 400);
    const pin = randomPin();
    const { error } = await sb.auth.admin.updateUserById(userId, {
      password: pin,
      user_metadata: { must_change_pin: true },
    });
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, pin });
  }

  if (action === "set-active") {
    const userId = String(body.user_id || "");
    if (!userId) return json({ error: "user_id requerido" }, 400);
    const { error } = await sb.from("staff").update({ is_active: !!body.is_active }).eq("id", userId);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  if (action === "set-supremo") {
    const userId = String(body.user_id || "");
    if (!userId) return json({ error: "user_id requerido" }, 400);
    if (body.value) {
      const { error } = await sb.from("super_admins").upsert({ user_id: userId }, { onConflict: "user_id" });
      if (error) return json({ error: error.message }, 500);
    } else {
      if (userId === me) return json({ error: "No puedes quitarte tu propio acceso" }, 400);
      const { error } = await sb.from("super_admins").delete().eq("user_id", userId);
      if (error) return json({ error: error.message }, 500);
    }
    return json({ success: true });
  }

  return json({ error: "Acción desconocida" }, 400);
});
