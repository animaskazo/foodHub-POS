import { adminClient, callerId, CORS, isSuperAdmin, json, listFlowPlans } from "../_shared/flow.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  try {
    const sb = adminClient();
    const userId = await callerId(req, sb);
    if (!userId) return json({ error: "Debes iniciar sesión." }, 401);
    const [superAdmin, { data: staff }] = await Promise.all([
      isSuperAdmin(userId, sb),
      sb.from("staff").select("id, is_active").eq("id", userId).maybeSingle(),
    ]);
    if (!superAdmin && (!staff || staff.is_active === false)) return json({ error: "No tienes permiso para ver los planes." }, 403);
    const plans = (await listFlowPlans()).filter((plan) => Number(plan.status) === 1);
    return json({ plans, callbackUrl: `${Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "")}/functions/v1/flow-subscription-callback` });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "No se pudieron leer los planes de Flow." }, 502);
  }
});
