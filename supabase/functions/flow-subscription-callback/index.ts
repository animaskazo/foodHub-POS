import { adminClient, CORS, flowRequest } from "../_shared/flow.ts";

const redirect = (url: string, result: string) => {
  const target = new URL(url);
  target.searchParams.set("flow", result);
  return new Response(null, { status: 303, headers: { ...CORS, Location: target.toString() } });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });
  const form = await req.formData().catch(() => null);
  const invoiceId = String(form?.get("invoiceId") || "");
  const token = String(form?.get("token") || "");
  const sb = adminClient();

  // Flow sends invoiceId to the plan's recurring-payment callback. Fetch the
  // invoice from Flow before changing access; never trust callback form fields.
  if (invoiceId && invoiceId.length <= 64) {
    try {
      const invoice = await flowRequest("invoice/get", "GET", { invoiceId });
      const subscriptionId = String(invoice.subscriptionId || "");
      if (!subscriptionId || String(invoice.id) !== invoiceId) return new Response("Unknown invoice", { status: 404, headers: CORS });
      const { data: subscriptionRow, error: lookupError } = await sb.from("organization_subscriptions")
        .select("organization_id, flow_subscription_id")
        .eq("flow_subscription_id", subscriptionId).maybeSingle();
      if (lookupError || !subscriptionRow) return new Response("Unknown subscription", { status: 404, headers: CORS });

      const paid = Number(invoice.payment?.status) === 1;
      const failed = Number(invoice.status) === 0 && Number(invoice.attemped) === 1;
      const update: Record<string, unknown> = { last_invoice_id: invoiceId };
      if (paid) {
        update.status = "active";
        update.current_period_end = invoice.period_end ? new Date(String(invoice.period_end)).toISOString() : null;
      } else if (failed) {
        update.status = "past_due";
      }
      const { error: updateError } = await sb.from("organization_subscriptions")
        .update(update).eq("organization_id", subscriptionRow.organization_id);
      if (updateError) throw updateError;
      return new Response("OK", { status: 200, headers: CORS });
    } catch {
      return new Response("Could not verify invoice", { status: 502, headers: CORS });
    }
  }

  if (!token || token.length > 256) return new Response("Invalid callback", { status: 400, headers: CORS });
  const { data: row, error } = await sb.from("organization_subscriptions")
    .select("organization_id, flow_customer_id, flow_plan_id, flow_registration_token, trial_ends_at, redirect_url")
    .eq("flow_registration_token", token).maybeSingle();
  if (error || !row) return new Response("Unknown registration", { status: 404, headers: CORS });
  const returnUrl = row.redirect_url || "https://foodhub.work/subscription?flow=return";

  try {
    const registration = await flowRequest("customer/getRegisterStatus", "GET", { token });
    if (String(registration.status) !== "1" || String(registration.customerId) !== row.flow_customer_id) {
      await sb.from("organization_subscriptions").update({ status: "pending_card", flow_registration_token: null, flow_checkout_url: null }).eq("organization_id", row.organization_id);
      return redirect(returnUrl, "card_failed");
    }

    const createParams: Record<string, string | number> = { planId: row.flow_plan_id || "", customerId: row.flow_customer_id || "" };
    if (row.trial_ends_at && new Date(row.trial_ends_at).getTime() > Date.now()) {
      createParams.subscription_start = new Date(row.trial_ends_at).toISOString().slice(0, 10);
    }
    const subscription = await flowRequest("subscription/create", "POST", createParams);
    const subscriptionId = String(subscription.subscriptionId || subscription.id || "");
    if (!subscriptionId) throw new Error("Flow no devolvió el identificador de suscripción.");
    await sb.from("organization_subscriptions").update({
      status: "active",
      flow_subscription_id: subscriptionId,
      flow_card_type: String(registration.creditCardType || "") || null,
      flow_card_last4: String(registration.last4CardDigits || "") || null,
      flow_registration_token: null,
      flow_checkout_url: null,
    }).eq("organization_id", row.organization_id);
    return redirect(returnUrl, "active");
  } catch {
    await sb.from("organization_subscriptions").update({ status: "pending_payment", flow_registration_token: null, flow_checkout_url: null }).eq("organization_id", row.organization_id);
    return redirect(returnUrl, "pending");
  }
});
