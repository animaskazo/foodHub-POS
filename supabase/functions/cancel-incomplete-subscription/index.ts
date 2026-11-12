import { adminClient, callerId, CORS, flowRequest, isSuperAdmin, json } from "../_shared/flow.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INCOMPLETE_STATUSES = new Set(["pending_card", "pending_payment"]);

function rowsFromFlow(value: unknown): Record<string, unknown>[] {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return Array.isArray(parsed) ? parsed.filter((row) => row && typeof row === "object") : [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    const sb = adminClient();
    const userId = await callerId(req, sb);
    if (!userId) return json({ error: "Debes iniciar sesión." }, 401);
    if (!(await isSuperAdmin(userId, sb))) {
      return json({ error: "Solo un superadministrador puede eliminar solicitudes inconclusas." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const organizationId = String(body.organizationId || "").trim();
    if (!UUID.test(organizationId)) return json({ error: "El negocio no es válido." }, 400);

    const { data: current, error: readError } = await sb.from("organization_subscriptions")
      .select("organization_id, status, flow_customer_id, flow_subscription_id, flow_plan_id")
      .eq("organization_id", organizationId).maybeSingle();
    if (readError) throw readError;
    if (!current) return json({ error: "No existe la suscripción del negocio." }, 404);
    if (!INCOMPLETE_STATUSES.has(String(current.status))) {
      return json({ error: "Solo se pueden eliminar registros de tarjeta o suscripciones inconclusas." }, 409);
    }

    let cancelledFlowSubscriptionId = "";
    if (current.status === "pending_payment") {
      if (!current.flow_customer_id || !current.flow_plan_id) {
        return json({ error: "La solicitud pendiente no tiene suficientes datos para verificarla en Flow." }, 409);
      }

      const result = await flowRequest("customer/getSubscriptions", "GET", {
        customerId: String(current.flow_customer_id), start: 0, limit: 100,
      });
      const activeMatches = rowsFromFlow(result.data).filter((subscription) => {
        const samePlan = String(subscription.planId || "") === String(current.flow_plan_id);
        return samePlan && Number(subscription.status) === 1;
      });
      if (activeMatches.length > 1) {
        return json({ error: "Flow registra más de una suscripción activa para este plan. Deben revisarse manualmente antes de continuar." }, 409);
      }
      if (activeMatches.length === 1) {
        cancelledFlowSubscriptionId = String(activeMatches[0].subscriptionId || activeMatches[0].id || "");
        if (!cancelledFlowSubscriptionId) throw new Error("Flow no devolvió el identificador de la suscripción pendiente.");
        await flowRequest("subscription/cancel", "POST", {
          subscriptionId: cancelledFlowSubscriptionId, at_period_end: 0,
        });
      }
    }

    const { error: updateError } = await sb.from("organization_subscriptions").update({
      status: "cancelled",
      flow_subscription_id: cancelledFlowSubscriptionId || current.flow_subscription_id || null,
      flow_registration_token: null,
      flow_checkout_url: null,
      current_period_end: null,
    }).eq("organization_id", organizationId).in("status", ["pending_card", "pending_payment"]);
    if (updateError) throw updateError;

    const { error: auditError } = await sb.from("subscription_admin_events").insert({
      organization_id: organizationId,
      action: "cancel_incomplete",
      previous_status: current.status,
      flow_subscription_id: cancelledFlowSubscriptionId || null,
      actor_id: userId,
    });
    if (auditError) throw auditError;

    const { data: subscription, error: finalReadError } = await sb.from("organization_subscriptions")
      .select("organization_id, status, free_access, free_access_starts_at, free_access_ends_at, free_access_note")
      .eq("organization_id", organizationId).single();
    if (finalReadError) throw finalReadError;
    return json({ subscription, cancelledInFlow: Boolean(cancelledFlowSubscriptionId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo eliminar la solicitud inconclusa.";
    return json({ error: message }, 400);
  }
});
