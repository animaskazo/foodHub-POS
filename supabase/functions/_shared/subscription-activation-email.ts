const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const money = (amount: unknown, currency = "CLP") => new Intl.NumberFormat("es-CL", {
  style: "currency", currency, maximumFractionDigits: 0,
}).format(Number(amount) || 0);

const dateText = (value: unknown) => value
  ? new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Santiago" }).format(new Date(String(value)))
  : "por confirmar";

export const subscriptionActivationEmailHtml = (input: Record<string, unknown>) => {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>@media only screen and (max-width:620px){.email-shell{padding:0!important}.email-card{border-radius:0!important}.email-content{padding-left:20px!important;padding-right:20px!important}.email-title{font-size:27px!important}.email-cta{display:block!important;text-align:center!important}.detail-column{display:block!important;width:100%!important;padding:0 0 18px!important}}</style></head><body style="margin:0;background:#f4f4f5;color:#18181b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td class="email-shell" style="padding:24px 12px" align="center"><table class="email-card" width="640" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;max-width:640px;background:#fff;border-radius:20px;overflow:hidden"><tr><td class="email-content" style="padding:28px 36px 0;text-align:right;font-size:14px;font-weight:800;letter-spacing:3px">FOODHUB</td></tr><tr><td class="email-content" style="padding:28px 36px 0"><p style="margin:0 0 10px;color:#059669;font-size:13px;font-weight:800;letter-spacing:1px">Suscripción confirmada</p><h1 class="email-title" style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.2;font-weight:400">Tu plan FoodHub ya está activo</h1></td></tr><tr><td class="email-content" style="padding:22px 36px 0;font-size:16px;line-height:1.7;color:#444"><p style="margin:0 0 16px">Hola ${escapeHtml(input.administratorName)},</p><p style="margin:0">Flow confirmó correctamente la suscripción de <strong>${escapeHtml(input.organizationName)}</strong>. Desde ahora puedes revisar la facturación y administrar el plan desde FoodHub.</p></td></tr><tr><td class="email-content" style="padding:26px 36px 0"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f7f7f8;border-radius:14px"><tr><td style="padding:22px"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td class="detail-column" width="50%" style="vertical-align:top;padding-right:18px"><p style="margin:0 0 5px;color:#71717a;font-size:12px;font-weight:700">NEGOCIO</p><p style="margin:0;font-size:16px;font-weight:700">${escapeHtml(input.organizationName)}</p></td><td class="detail-column" width="50%" style="vertical-align:top"><p style="margin:0 0 5px;color:#71717a;font-size:12px;font-weight:700">ADMINISTRADOR</p><p style="margin:0;font-size:16px;font-weight:700">${escapeHtml(input.administratorName)}</p><p style="margin:4px 0 0;color:#52525b;font-size:13px;overflow-wrap:anywhere">${escapeHtml(input.administratorEmail)}</p></td></tr><tr><td class="detail-column" width="50%" style="vertical-align:top;padding:24px 18px 0 0"><p style="margin:0 0 5px;color:#71717a;font-size:12px;font-weight:700">PLAN CONTRATADO</p><p style="margin:0;font-size:16px;font-weight:700">${escapeHtml(input.planName)}</p></td><td class="detail-column" width="50%" style="vertical-align:top;padding-top:24px"><p style="margin:0 0 5px;color:#71717a;font-size:12px;font-weight:700">VALOR DEL PLAN</p><p style="margin:0;font-size:16px;font-weight:700">${escapeHtml(money(input.amount, String(input.currency || "CLP")))}</p></td></tr><tr><td class="detail-column" width="50%" style="vertical-align:top;padding:24px 18px 0 0"><p style="margin:0 0 5px;color:#71717a;font-size:12px;font-weight:700">PRÓXIMA FACTURACIÓN</p><p style="margin:0;font-size:16px;font-weight:700">${escapeHtml(dateText(input.nextPaymentAt))}</p></td><td class="detail-column" width="50%" style="vertical-align:top;padding-top:24px"><p style="margin:0 0 5px;color:#71717a;font-size:12px;font-weight:700">MEDIO DE PAGO</p><p style="margin:0;font-size:16px;font-weight:700">${escapeHtml(input.cardType || "Tarjeta")} ···· ${escapeHtml(input.cardLast4 || "—")}</p></td></tr></table></td></tr></table></td></tr><tr><td class="email-content" style="padding:28px 36px 0"><a class="email-cta" href="${escapeHtml(input.appUrl)}/subscription" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 24px;border-radius:12px">Revisar mi suscripción</a></td></tr><tr><td class="email-content" style="padding:26px 36px 0;font-size:14px;line-height:1.65;color:#52525b"><strong>Importante:</strong> los pagos recurrentes se procesarán mediante Flow según la frecuencia del plan. Puedes consultar el historial y solicitar un cambio de plan desde tu cuenta.</td></tr><tr><td class="email-content" style="padding:32px 36px 36px;color:#a1a1aa;font-size:12px;text-align:center">FoodHub · POS, tienda online y delivery en un solo lugar</td></tr></table></td></tr></table></body></html>`;
};

export async function sendSubscriptionActivationEmail(sb: any, organizationId: string) {
  const { data: claimed, error: claimError } = await sb.from("organization_subscriptions")
    .update({ activation_email_status: "sending", activation_email_error: null })
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .not("last_payment_at", "is", null)
    .is("activation_email_sent_at", null)
    .or("activation_email_status.is.null,activation_email_status.eq.failed")
    .select("organization_id,flow_plan_name,flow_plan_amount,flow_plan_currency,flow_card_type,flow_card_last4,next_payment_at,current_period_end")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return { skipped: true };

  try {
    const [{ data: organization }, { data: staff }] = await Promise.all([
      sb.from("organizations").select("name").eq("id", organizationId).single(),
      sb.from("staff").select("id,full_name,role").eq("organization_id", organizationId).eq("is_active", true).in("role", ["owner", "admin"]).order("created_at").limit(10),
    ]);
    let recipient: { email: string; name: string } | null = null;
    for (const member of staff || []) {
      const { data } = await sb.auth.admin.getUserById(member.id);
      if (data.user?.email) {
        recipient = { email: data.user.email, name: member.full_name || data.user.user_metadata?.full_name || data.user.email.split("@")[0] };
        if (member.role === "owner") break;
      }
    }
    if (!recipient) throw new Error("La organización no tiene un administrador con email.");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("Falta RESEND_API_KEY.");
    const appUrl = (Deno.env.get("APP_URL") || "https://foodhub.work").replace(/\/$/, "");
    const input = {
      administratorName: recipient.name,
      administratorEmail: recipient.email,
      organizationName: organization?.name || "tu negocio",
      planName: claimed.flow_plan_name || "Plan FoodHub",
      amount: claimed.flow_plan_amount,
      currency: claimed.flow_plan_currency || "CLP",
      nextPaymentAt: claimed.next_payment_at || claimed.current_period_end,
      cardType: claimed.flow_card_type || "Tarjeta",
      cardLast4: claimed.flow_card_last4 || "—",
      appUrl,
    };
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "FoodHub <hola@digital-solutions.work>", reply_to: "hola@digital-solutions.work",
        to: [recipient.email], subject: `Tu suscripción ${input.planName} está activa`,
        html: subscriptionActivationEmailHtml(input),
        text: `Tu suscripción está activa. Negocio: ${input.organizationName}. Administrador: ${input.administratorName} (${input.administratorEmail}). Plan: ${input.planName}. Valor: ${money(input.amount, String(input.currency))}. Próxima facturación: ${dateText(input.nextPaymentAt)}. Medio de pago: ${input.cardType} terminada en ${input.cardLast4}. Revisa los detalles en ${appUrl}/subscription`,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(result.message || `Resend respondió HTTP ${response.status}`));
    await sb.from("organization_subscriptions").update({
      activation_email_status: "sent", activation_email_sent_at: new Date().toISOString(),
      activation_email_message_id: String(result.id || "") || null, activation_email_error: null,
    }).eq("organization_id", organizationId);
    return { sent: true };
  } catch (error) {
    await sb.from("organization_subscriptions").update({
      activation_email_status: "failed",
      activation_email_error: error instanceof Error ? error.message.slice(0, 500) : "No se pudo enviar el correo.",
    }).eq("organization_id", organizationId);
    throw error;
  }
}
