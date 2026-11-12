import { adminClient, callerId, CORS, flowRequest, isSuperAdmin, json } from "../_shared/flow.ts";
import { sendSubscriptionActivationEmail } from "../_shared/subscription-activation-email.ts";

const flowDate = (value: unknown) => {
  if (!value) return null;
  const normalized = String(value).replace(" ", "T");
  const date = new Date(normalized.endsWith("Z") ? normalized : `${normalized}-03:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const rows = (value: unknown): Record<string, unknown>[] => {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object") as Record<string, unknown>[] : [];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  const sb = adminClient();
  const reconciliationKey = req.headers.get("x-reconciliation-key") || "";
  const { data: credential } = reconciliationKey
    ? await sb.from("subscription_reconciliation_credentials").select("id").eq("secret", reconciliationKey).maybeSingle()
    : { data: null };
  const serviceCall = Boolean(credential);
  const userId = serviceCall ? null : await callerId(req, sb);
  if (!serviceCall && !userId) return json({ error: "Debes iniciar sesión." }, 401);
  const superAdmin = Boolean(userId) && await isSuperAdmin(userId!, sb);
  let organizationId: string | null = null;
  if (!serviceCall && !superAdmin) {
    const { data: staff } = await sb.from("staff").select("organization_id,role,is_active").eq("id", userId).maybeSingle();
    if (!staff?.organization_id || staff.is_active === false || !["owner", "admin", "manager"].includes(staff.role)) {
      return json({ error: "No tienes permiso para conciliar esta suscripción." }, 403);
    }
    organizationId = staff.organization_id;
  }

  let subscriptionQuery = sb.from("organization_subscriptions")
    .select("organization_id,status,flow_subscription_id,flow_plan_id,scheduled_plan_id")
    .not("flow_subscription_id", "is", null)
    .in("status", ["trialing", "pending_payment", "active", "past_due"])
    .order("last_flow_sync_at", { ascending: true, nullsFirst: true })
    .limit(100);
  if (organizationId) subscriptionQuery = subscriptionQuery.eq("organization_id", organizationId);
  const { data: subscriptions, error } = await subscriptionQuery;
  if (error) return json({ error: error.message }, 500);

  let synchronized = 0, recoveredPayments = 0, failed = 0;
  for (const local of subscriptions || []) {
    try {
      const remote = await flowRequest("subscription/get", "GET", { subscriptionId: String(local.flow_subscription_id) });
      if (String(remote.subscriptionId || "") !== local.flow_subscription_id) throw new Error("La suscripción remota no coincide.");
      const remoteStatus = Number(remote.status);
      const morose = Number(remote.morose) === 1;
      const update: Record<string, unknown> = {
        flow_status: remoteStatus,
        flow_morose: morose,
        last_flow_sync_at: new Date().toISOString(),
        subscribed_at: flowDate(remote.created),
        next_payment_at: flowDate(remote.next_invoice_date),
        current_period_end: flowDate(remote.period_end),
        cancel_at_period_end: Number(remote.cancel_at_period_end) === 1,
        cancellation_effective_at: flowDate(remote.cancel_at),
        payment_failure_reason: morose ? "Flow informa pagos vencidos para esta suscripción." : null,
      };
      const remotePlanId = String(remote.planId || "");
      const remoteScheduledPlanId = String(remote.newPlanId || "");
      if (remotePlanId && remotePlanId !== local.flow_plan_id) {
        const appliedPlan = await flowRequest("plans/get", "GET", { planId: remotePlanId });
        update.flow_plan_id = remotePlanId;
        update.flow_plan_name = String(appliedPlan.name || "");
        update.flow_plan_amount = Math.round(Number(appliedPlan.amount) || 0);
        update.flow_plan_currency = String(appliedPlan.currency || "CLP");
        update.flow_plan_interval = Number(appliedPlan.interval) || null;
        update.flow_plan_interval_count = Number(appliedPlan.interval_count) || 1;
        update.scheduled_plan_id = null;
        update.scheduled_plan_name = null;
        update.scheduled_plan_change_at = null;
        await sb.from("subscription_plan_changes").update({ status: "applied", updated_at: new Date().toISOString() })
          .eq("organization_id", local.organization_id).eq("new_plan_id", remotePlanId).eq("status", "scheduled");
      } else if (remoteScheduledPlanId && remoteScheduledPlanId !== "null") {
        const scheduledPlan = await flowRequest("plans/get", "GET", { planId: remoteScheduledPlanId });
        update.scheduled_plan_id = remoteScheduledPlanId;
        update.scheduled_plan_name = String(scheduledPlan.name || "Nuevo plan");
        update.scheduled_plan_change_at = flowDate(remote.new_plan_scheduled_change_date);
      } else if (local.scheduled_plan_id) {
        update.scheduled_plan_id = null;
        update.scheduled_plan_name = null;
        update.scheduled_plan_change_at = null;
      }
      if (remoteStatus !== 1) update.status = "cancelled";
      else if (morose) update.status = "past_due";
      else if (local.status === "past_due") update.status = "pending_payment";
      await sb.from("organization_subscriptions").update(update).eq("organization_id", local.organization_id);

      for (const invoice of rows(remote.invoices)) {
        const payment = invoice.payment as Record<string, unknown> | undefined;
        if (!payment || Number(payment.status) !== 2) continue;
        const commerceOrder = String(payment.commerceOrder || "");
        const flowOrder = Number(payment.flowOrder);
        if (!commerceOrder || !Number.isSafeInteger(flowOrder)) continue;
        const { data: eventId, error: paymentError } = await sb.rpc("record_flow_subscription_payment", {
          p_token_hash: null,
          p_flow_order: flowOrder,
          p_commerce_order: commerceOrder,
          p_flow_status: 2,
          p_amount: Number(payment.amount || invoice.amount) || null,
          p_currency: String(payment.currency || invoice.currency || "") || null,
          p_paid_at: flowDate((payment.paymentData as Record<string, unknown> | undefined)?.date),
          p_source: "reconciliation",
          p_payload: { invoice, payment },
        });
        if (paymentError) throw paymentError;
        if (eventId) recoveredPayments += 1;
      }
      try {
        await sendSubscriptionActivationEmail(sb, local.organization_id);
      } catch (emailError) {
        console.error("Subscription activation email retry failed", local.organization_id, emailError);
      }
      synchronized += 1;
    } catch (syncError) {
      failed += 1;
      console.error("Flow subscription reconciliation failed", local.flow_subscription_id, syncError);
      await sb.from("organization_subscriptions").update({
        last_flow_sync_at: new Date().toISOString(),
        payment_failure_reason: syncError instanceof Error ? syncError.message.slice(0, 500) : "No se pudo conciliar con Flow.",
      }).eq("organization_id", local.organization_id);
    }
  }
  return json({ checked: subscriptions?.length || 0, synchronized, recoveredPayments, failed });
});
