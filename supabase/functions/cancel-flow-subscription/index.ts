import { adminClient, callerId, CORS, flowRequest, isSuperAdmin, json } from "../_shared/flow.ts";

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
    const superAdmin = await isSuperAdmin(userId, sb);
    const requestedImmediate = body.atPeriodEnd === false;
    let organizationId = superAdmin ? String(body.organizationId || "") : "";
    if (!superAdmin) {
      const { data: staff } = await sb.from("staff").select("organization_id,role,is_active").eq("id", userId).maybeSingle();
      if (!staff?.organization_id || staff.is_active === false || !["owner", "admin"].includes(staff.role)) {
        return json({ error: "Solo el dueño o un administrador puede cancelar la suscripción." }, 403);
      }
      organizationId = staff.organization_id;
    }
    if (!organizationId) return json({ error: "Selecciona una organización." }, 400);
    if (requestedImmediate && !superAdmin) return json({ error: "La cancelación inmediata requiere autorización de FoodHub." }, 403);

    const { data: local, error: localError } = await sb.from("organization_subscriptions")
      .select("status,flow_subscription_id,flow_customer_id,cancel_at_period_end,current_period_end")
      .eq("organization_id", organizationId).maybeSingle();
    if (localError) throw localError;
    if (!local?.flow_subscription_id || !["active", "past_due"].includes(local.status)) {
      return json({ error: "No existe una suscripción activa para cancelar." }, 409);
    }
    if (local.cancel_at_period_end && !requestedImmediate) return json({ error: "La suscripción ya está programada para finalizar." }, 409);

    const remote = await flowRequest("subscription/get", "GET", { subscriptionId: local.flow_subscription_id });
    if (String(remote.subscriptionId || "") !== local.flow_subscription_id || String(remote.customerId || "") !== local.flow_customer_id) {
      throw new Error("La suscripción de Flow no corresponde a esta organización.");
    }
    const atPeriodEnd = requestedImmediate ? 0 : 1;
    const cancelled = await flowRequest("subscription/cancel", "POST", {
      subscriptionId: local.flow_subscription_id,
      at_period_end: atPeriodEnd,
    });
    const effectiveAt = requestedImmediate
      ? new Date().toISOString()
      : flowDate(cancelled.cancel_at || cancelled.period_end || remote.period_end) || local.current_period_end;

    const update: Record<string, unknown> = {
      cancel_at_period_end: !requestedImmediate,
      cancellation_requested_at: new Date().toISOString(),
      cancellation_effective_at: effectiveAt,
      cancellation_requested_by: userId,
      scheduled_plan_id: null,
      scheduled_plan_name: null,
      scheduled_plan_change_at: null,
      last_flow_sync_at: new Date().toISOString(),
    };
    if (requestedImmediate) update.status = "cancelled";
    const { error: saveError } = await sb.from("organization_subscriptions").update(update).eq("organization_id", organizationId);
    if (saveError) throw saveError;
    await sb.from("subscription_plan_changes").update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId).eq("status", "scheduled");
    const { error: auditError } = await sb.from("subscription_cancellation_events").insert({
      organization_id: organizationId,
      flow_subscription_id: local.flow_subscription_id,
      mode: requestedImmediate ? "immediate" : "period_end",
      effective_at: effectiveAt,
      requested_by: userId,
      flow_response: cancelled,
    });
    if (auditError) console.error("Could not persist cancellation audit", auditError);
    return json({ cancelled: true, atPeriodEnd: !requestedImmediate, effectiveAt });
  } catch (error) {
    console.error("cancel-flow-subscription failed", error);
    return json({ error: error instanceof Error ? error.message : "No se pudo cancelar la suscripción." }, 400);
  }
});
