import { adminClient, callerId, CORS, FLOW_QA_ORGANIZATION_ID, flowRequest, isFlowQaPlan, json } from "../_shared/flow.ts";

const flowDate = (value: unknown) => {
  if (!value) return null;
  const normalized = String(value).replace(" ", "T");
  const date = new Date(normalized.endsWith("Z") ? normalized : `${normalized}-03:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    const sb = adminClient();
    const userId = await callerId(req, sb);
    if (!userId) return json({ error: "Debes iniciar sesión." }, 401);
    const body = await req.json().catch(() => ({}));
    const newPlanId = String(body.planId || "").trim();
    if (!newPlanId) return json({ error: "Selecciona un plan." }, 400);

    const { data: staff, error: staffError } = await sb.from("staff")
      .select("organization_id,role,is_active")
      .eq("id", userId)
      .maybeSingle();
    if (staffError) throw staffError;
    if (!staff?.organization_id || staff.is_active === false || !["owner", "admin", "manager"].includes(staff.role)) {
      return json({ error: "Solo el dueño o un administrador puede cambiar el plan." }, 403);
    }

    const organizationId = staff.organization_id;
    const { data: local, error: localError } = await sb.from("organization_subscriptions")
      .select("status,flow_subscription_id,flow_customer_id,flow_plan_id,flow_plan_name,scheduled_plan_id")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (localError) throw localError;
    if (!local?.flow_subscription_id || local.status !== "active") {
      return json({ error: "Necesitas una suscripción activa para cambiar de plan." }, 409);
    }
    if (local.flow_plan_id === newPlanId) return json({ error: "Ese ya es tu plan actual." }, 409);
    if (local.scheduled_plan_id) return json({ error: "Ya existe un cambio de plan programado." }, 409);

    const [newPlan, remote] = await Promise.all([
      flowRequest("plans/get", "GET", { planId: newPlanId }),
      flowRequest("subscription/get", "GET", { subscriptionId: local.flow_subscription_id }),
    ]);
    if (String(newPlan.planId || "") !== newPlanId || Number(newPlan.status) !== 1) {
      return json({ error: "Ese plan ya no está disponible en Flow." }, 409);
    }
    if (isFlowQaPlan(newPlan) && organizationId !== FLOW_QA_ORGANIZATION_ID) {
      return json({ error: "Este plan está reservado para pruebas internas." }, 403);
    }
    if (String(remote.subscriptionId || "") !== local.flow_subscription_id || String(remote.customerId || "") !== local.flow_customer_id) {
      throw new Error("La suscripción de Flow no corresponde a esta organización.");
    }
    if (Number(remote.status) !== 1) return json({ error: "Flow no permite cambiar una suscripción inactiva." }, 409);

    // Flow requires the scheduled date to remain inside the current billing cycle.
    // period_end is the safe boundary; next_invoice_date can fall one day later.
    const effectiveAt = flowDate(remote.period_end || remote.next_invoice_date);
    if (!effectiveAt) throw new Error("Flow no informó la fecha del próximo ciclo de facturación.");
    const startDateOfNewPlan = effectiveAt.slice(0, 10);
    const params = { subscriptionId: local.flow_subscription_id, newPlanId, startDateOfNewPlan };
    await flowRequest("subscription/changePlanPreview", "POST", params);
    const changed = await flowRequest("subscription/changePlan", "POST", params);
    const confirmedDate = flowDate(changed.start_date_of_new_plan) || effectiveAt;

    const { error: saveError } = await sb.from("organization_subscriptions").update({
      scheduled_plan_id: newPlanId,
      scheduled_plan_name: String(newPlan.name || "Nuevo plan"),
      scheduled_plan_change_at: confirmedDate,
      last_flow_sync_at: new Date().toISOString(),
    }).eq("organization_id", organizationId);
    if (saveError) throw saveError;

    const { error: auditError } = await sb.from("subscription_plan_changes").insert({
      organization_id: organizationId,
      flow_subscription_id: local.flow_subscription_id,
      old_plan_id: local.flow_plan_id || "",
      old_plan_name: local.flow_plan_name,
      new_plan_id: newPlanId,
      new_plan_name: String(newPlan.name || "Nuevo plan"),
      effective_at: confirmedDate,
      requested_by: userId,
      flow_response: changed,
    });
    if (auditError) console.error("Could not persist plan change audit", auditError);

    return json({
      scheduled: true,
      planId: newPlanId,
      planName: String(newPlan.name || "Nuevo plan"),
      effectiveAt: confirmedDate,
    });
  } catch (error) {
    console.error("change-flow-subscription-plan failed", error);
    return json({ error: error instanceof Error ? error.message : "No se pudo programar el cambio de plan." }, 400);
  }
});
