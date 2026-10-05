// Gestión de personal con PIN.
// - Super Admin: gestiona cualquier organización + otorga/revoca supremo.
// - Dueño/Admin/Encargado del negocio: crea y administra vendedores de SU organización.
// Acciones: create | reset-pin | set-active | set-supremo | claim-store
// - create: { email, full_name?, organization_id? } -> crea usuario + staff cashier, devuelve PIN (única vez)
// - reset-pin: { user_id } -> nuevo PIN (must_change_pin=true), devuelve PIN (única vez)
// - set-active: { user_id, is_active } -> activa/desactiva cuenta
// - set-supremo: { user_id, value } -> otorga/revoca super admin (solo Super Admin)
// - claim-store: sin args -> el llamante (owner de algún local) se registra como super admin
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

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

async function isSupremo(sb: any, userId: string): Promise<boolean> {
  const { data } = await sb.from("super_admins").select("user_id").eq("user_id", userId).maybeSingle();
  return !!data;
}

async function callerStaff(sb: any, userId: string) {
  const { data } = await sb
    .from("staff")
    .select("id, organization_id, role")
    .eq("id", userId)
    .maybeSingle();
  return data as { id: string; organization_id: string; role: string } | null;
}

const MANAGER_ROLES = ["owner", "admin", "manager"];

function canManageOrg(
  isSup: boolean,
  caller: { organization_id: string; role: string } | null,
  targetOrgId: string,
): boolean {
  if (isSup) return true;
  if (!caller) return false;
  if (!MANAGER_ROLES.includes(caller.role)) return false;
  return caller.organization_id === targetOrgId;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
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

  if (action === "create") {
    const email = String(body.email || "").trim().toLowerCase();
    const fullName = String(body.full_name || "").trim() || email.split("@")[0];
    let organizationId = String(body.organization_id || "");
    if (!email) return json({ error: "email requerido" }, 400);
    const supCreate = await isSupremo(sb, me);
    const caller = await callerStaff(sb, me);
    // Si no es Super Admin, el negocio solo puede crear en su propia organización.
    if (!supCreate) {
      if (!caller || !MANAGER_ROLES.includes(caller.role)) {
        return json({ error: "Solo el dueño o administrador del negocio puede crear vendedores" }, 403);
      }
      organizationId = caller.organization_id;
    }
    if (!organizationId) return json({ error: "organization_id requerido" }, 400);
    // Doble chequeo: el llamante debe poder gestionar esa organización.
    if (!canManageOrg(supCreate, caller, organizationId)) {
      return json({ error: "No puedes crear usuarios en esta organización" }, 403);
    }
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
    const supReset = await isSupremo(sb, me);
    const callerReset = await callerStaff(sb, me);
    const { data: targetReset } = await sb.from("staff").select("organization_id, role").eq("id", userId).maybeSingle();
    if (!targetReset) return json({ error: "Usuario no encontrado" }, 404);
    // Owner/Admin/Supremo usan contraseña, no PIN.
    if (["owner", "admin"].includes((targetReset as { role: string }).role)) {
      return json({ error: "Este usuario usa contraseña, no PIN" }, 400);
    }
    if (await isSupremo(sb, userId)) {
      return json({ error: "Este usuario usa contraseña, no PIN" }, 400);
    }
    if (!canManageOrg(supReset, callerReset, targetReset.organization_id)) {
      return json({ error: "No puedes gestionar este usuario" }, 403);
    }
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
    if (userId === me && body.is_active === false) {
      return json({ error: "No puedes desactivar tu propia cuenta" }, 400);
    }
    const supActive = await isSupremo(sb, me);
    const callerActive = await callerStaff(sb, me);
    const { data: targetActive } = await sb.from("staff").select("organization_id").eq("id", userId).maybeSingle();
    if (!targetActive) return json({ error: "Usuario no encontrado" }, 404);
    if (!canManageOrg(supActive, callerActive, targetActive.organization_id)) {
      return json({ error: "No puedes gestionar este usuario" }, 403);
    }
    const { error } = await sb.from("staff").update({ is_active: !!body.is_active }).eq("id", userId);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  if (action === "set-supremo") {
    if (!(await isSupremo(sb, me))) return json({ error: "Solo Super Admin" }, 403);
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
  } catch (e) {
    console.error("create-staff error:", e);
    return json({ error: String((e as Error)?.message || e || "Error interno") }, 500);
  }
});
