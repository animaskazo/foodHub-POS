import { adminClient, CORS, flowRequest, sha256 } from "../_shared/flow.ts";
import { sendSubscriptionActivationEmail } from "../_shared/subscription-activation-email.ts";

const redirect = (url: string, result: string) => {
  const target = new URL(url);
  target.searchParams.set("flow", result);
  return new Response(null, { status: 303, headers: { ...CORS, Location: target.toString() } });
};

const flowDate = (value: unknown) => {
  if (!value) return null;
  const normalized = String(value).replace(" ", "T");
  const date = new Date(normalized.endsWith("Z") ? normalized : `${normalized}-03:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  const form = await req.formData().catch(() => null);
  const token = String(form?.get("token") || "");
  if (!token || token.length > 256) return new Response("Invalid callback", { status: 400, headers: CORS });

  const sb = adminClient();
  const tokenHash = await sha256(token);
  const { data: registration } = await sb.from("organization_subscriptions")
    .select("organization_id, flow_customer_id, flow_plan_id, flow_registration_token, flow_registration_token_hash, trial_ends_at, free_access, free_access_starts_at, free_access_ends_at, redirect_url, status")
    .or(`flow_registration_token.eq.${token},flow_registration_token_hash.eq.${tokenHash}`)
    .maybeSingle();

  if (registration) {
    const returnUrl = registration.redirect_url || "https://foodhub.work/subscription?flow=return";
    if (!registration.flow_registration_token) {
      return redirect(returnUrl, registration.status === "active" ? "active" : "pending");
    }
    try {
      const result = await flowRequest("customer/getRegisterStatus", "GET", { token });
      if (String(result.status) !== "1" || String(result.customerId) !== registration.flow_customer_id) {
        await sb.from("organization_subscriptions").update({ status: "pending_card", flow_registration_token: null, flow_checkout_url: null }).eq("organization_id", registration.organization_id);
        return redirect(returnUrl, "card_failed");
      }

      const now = Date.now();
      const freeStartsAt = registration.free_access_starts_at ? new Date(registration.free_access_starts_at).getTime() : Number.NEGATIVE_INFINITY;
      const freeEndsAt = registration.free_access_ends_at ? new Date(registration.free_access_ends_at).getTime() : Number.POSITIVE_INFINITY;
      const hasCourtesy = Boolean(registration.free_access) && freeStartsAt <= now && freeEndsAt > now;
      const trialEndsAt = registration.trial_ends_at ? new Date(registration.trial_ends_at).getTime() : 0;
      const hasTrial = trialEndsAt > now;
      const createParams: Record<string, string | number> = { planId: registration.flow_plan_id || "", customerId: registration.flow_customer_id || "" };
      if (!hasCourtesy && hasTrial) createParams.subscription_start = new Date(trialEndsAt).toISOString().slice(0, 10);

      const created = await flowRequest("subscription/create", "POST", createParams);
      const subscriptionId = String(created.subscriptionId || created.id || "");
      if (!subscriptionId) throw new Error("Flow no devolvió el identificador de suscripción.");
      const verified = await flowRequest("subscription/get", "GET", { subscriptionId });
      if (String(verified.subscriptionId || "") !== subscriptionId || String(verified.customerId || "") !== registration.flow_customer_id) {
        throw new Error("Flow devolvió una suscripción que no corresponde al cliente.");
      }

      await sb.from("organization_subscriptions").update({
        status: hasTrial && !hasCourtesy ? "trialing" : "pending_payment",
        flow_subscription_id: subscriptionId,
        flow_status: Number(verified.status),
        flow_morose: Number(verified.morose) === 1,
        flow_card_type: String(result.creditCardType || "") || null,
        flow_card_last4: String(result.last4CardDigits || "") || null,
        subscribed_at: flowDate(verified.created) || new Date().toISOString(),
        next_payment_at: flowDate(verified.next_invoice_date),
        current_period_end: flowDate(verified.period_end),
        last_flow_sync_at: new Date().toISOString(),
        flow_registration_token: null,
        flow_checkout_url: null,
        free_access: false,
        free_access_starts_at: null,
        free_access_ends_at: null,
        free_access_granted_by: null,
        free_access_note: null,
      }).eq("organization_id", registration.organization_id);
      return redirect(returnUrl, hasTrial && !hasCourtesy ? "pending" : "payment_pending");
    } catch (error) {
      console.error("Flow card registration callback failed", error);
      await sb.from("organization_subscriptions").update({ status: "pending_payment", payment_failure_reason: error instanceof Error ? error.message.slice(0, 500) : "Error de Flow" }).eq("organization_id", registration.organization_id);
      return redirect(returnUrl, "pending");
    }
  }

  try {
    let payment: Record<string, unknown>;
    try {
      payment = await flowRequest("payment/getStatusExtended", "GET", { token });
    } catch {
      payment = await flowRequest("payment/getStatus", "GET", { token });
    }
    const commerceOrder = String(payment.commerceOrder || "");
    const flowOrder = Number(payment.flowOrder);
    const status = Number(payment.status);
    if (!commerceOrder || !Number.isSafeInteger(flowOrder) || !Number.isInteger(status)) throw new Error("Flow devolvió un pago incompleto.");
    const paidAt = flowDate((payment.paymentData as Record<string, unknown> | undefined)?.date);
    const { data: eventId, error } = await sb.rpc("record_flow_subscription_payment", {
      p_token_hash: tokenHash,
      p_flow_order: flowOrder,
      p_commerce_order: commerceOrder,
      p_flow_status: status,
      p_amount: Number(payment.amount) || null,
      p_currency: String(payment.currency || "") || null,
      p_paid_at: paidAt,
      p_source: "callback",
      p_payload: payment,
    });
    if (error) throw error;
    if (status === 2 && eventId) {
      try {
        const { data: event } = await sb.from("subscription_payment_events")
          .select("organization_id,flow_subscription_id")
          .eq("id", eventId)
          .single();
        if (event?.organization_id && event.flow_subscription_id) {
          const remote = await flowRequest("subscription/get", "GET", { subscriptionId: event.flow_subscription_id });
          await sb.from("organization_subscriptions").update({
            subscribed_at: flowDate(remote.created),
            next_payment_at: flowDate(remote.next_invoice_date),
            current_period_end: flowDate(remote.period_end),
            last_flow_sync_at: new Date().toISOString(),
          }).eq("organization_id", event.organization_id);
          await sendSubscriptionActivationEmail(sb, event.organization_id);
        }
      } catch (emailError) {
        // Payment confirmation must remain successful. Reconciliation retries the email.
        console.error("Subscription activation email failed", emailError);
      }
    }
    return new Response("OK", { status: 200, headers: CORS });
  } catch (error) {
    console.error("Flow recurring payment callback failed", error);
    return new Response("Could not verify payment", { status: 502, headers: CORS });
  }
});
