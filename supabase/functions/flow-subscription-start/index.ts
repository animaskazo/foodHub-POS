import { adminClient, callerId, CORS, flowRequest, json, safeReturnUrl } from "../_shared/flow.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  try {
    const sb = adminClient();
    const userId = await callerId(req, sb);
    if (!userId) return json({ error: "Debes iniciar sesión." }, 401);
    const body = await req.json().catch(() => ({}));
    const planId = String(body.planId || "").trim();
    if (!planId) return json({ error: "Selecciona un plan de Flow." }, 400);

    const [{ data: staff, error: staffError }, { data: authData }] = await Promise.all([
      sb.from("staff").select("organization_id, role, is_active, organizations(name)").eq("id", userId).maybeSingle(),
      sb.auth.getUser((req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")),
    ]);
    if (staffError) throw staffError;
    if (!staff?.organization_id || staff.is_active === false || !["owner", "admin", "manager"].includes(staff.role)) {
      return json({ error: "Solo el dueño o un administrador puede iniciar una suscripción." }, 403);
    }
    const organizationId = staff.organization_id;
    const { data: organization, error: organizationError } = await sb.from("organizations")
      .select("id, name")
      .eq("id", organizationId)
      .maybeSingle();
    if (organizationError) throw organizationError;
    if (!organization) return json({ error: "La organización seleccionada no existe." }, 404);
    const email = authData.user?.email;
    if (!email) return json({ error: "La cuenta no tiene un email válido para Flow." }, 400);

    // Always resolve the plan from Flow. No local plan catalog is used.
    const plan = await flowRequest("plans/get", "GET", { planId });
    if (String(plan.planId) !== planId || Number(plan.status) !== 1) return json({ error: "Ese plan ya no está disponible en Flow." }, 409);

    const { data: current, error: readError } = await sb.from("organization_subscriptions")
      .select("flow_customer_id, status, free_access")
      .eq("organization_id", organizationId).maybeSingle();
    if (readError) throw readError;
    if (current?.free_access) return json({ error: "Este negocio tiene acceso gratuito y no necesita contratar un plan." }, 409);
    if (current?.status === "active") return json({ error: "Esta organización ya tiene una suscripción activa." }, 409);

    let customerId = current?.flow_customer_id;
    if (!customerId) {
      const customer = await flowRequest("customer/create", "POST", {
        name: String(organization.name || "FoodHub").slice(0, 80), email, externalId: organizationId,
      });
      customerId = String(customer.customerId || "");
      if (!customerId) throw new Error("Flow no devolvió el identificador del cliente.");
    }

    const redirectUrl = safeReturnUrl(req.headers.get("origin"));
    const { error: saveError } = await sb.from("organization_subscriptions").upsert({
      organization_id: organizationId,
      status: "pending_card",
      flow_customer_id: customerId,
      flow_plan_id: planId,
      flow_plan_name: String(plan.name || ""),
      flow_plan_amount: Math.round(Number(plan.amount) || 0),
      flow_plan_currency: String(plan.currency || "CLP"),
      flow_plan_interval: Number(plan.interval) || null,
      flow_plan_interval_count: Number(plan.interval_count) || 1,
      redirect_url: redirectUrl,
    }, { onConflict: "organization_id" });
    if (saveError) throw saveError;

    const registration = await flowRequest("customer/register", "POST", {
      customerId, url_return: `${Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "")}/functions/v1/flow-subscription-callback`,
    });
    if (!registration.token || !registration.url) throw new Error("Flow no devolvió el enlace para registrar la tarjeta.");
    const { error: tokenError } = await sb.from("organization_subscriptions")
      .update({ flow_registration_token: String(registration.token), flow_checkout_url: String(registration.url) })
      .eq("organization_id", organizationId);
    if (tokenError) throw tokenError;
    return json({ url: `${registration.url}?token=${encodeURIComponent(String(registration.token))}` });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "No se pudo iniciar el checkout de Flow." }, 400);
  }
});
