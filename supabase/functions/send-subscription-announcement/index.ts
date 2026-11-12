import { adminClient, callerId, CORS, isSuperAdmin, json } from "../_shared/flow.ts";

const appUrl = "https://foodhub.work";
const subjectBase = "FoodHub incorpora planes y suscripciones";
const batchSize = 8;
type Recipient = { organization_id: string; organization_name: string; user_id: string; recipient_name: string; email: string };
const clean = (value: unknown) => String(value || "").replace(/[<>&"]/g, "").trim();

function announcementEmail(recipientName: string, isTest: boolean) {
  const subject = `${isTest ? "[PRUEBA] " : ""}${subjectBase}`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>
    @media only screen and (max-width:620px){.email-shell{padding:0!important}.email-card{border-radius:0!important}.email-content{padding-left:20px!important;padding-right:20px!important}.email-title{font-size:27px!important}.email-cta{display:block!important;text-align:center!important}}
  </style></head><body style="margin:0;background:#f4f4f5;color:#18181b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td class="email-shell" style="padding:24px 12px" align="center"><table class="email-card" width="640" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;max-width:640px;background:#fff;border-radius:20px;overflow:hidden">
      ${isTest ? '<tr><td style="padding:10px 24px;background:#fef3c7;color:#78350f;font-size:13px;font-weight:700;text-align:center">Vista previa interna — este correo aún no se ha enviado a clientes</td></tr>' : ''}
      <tr><td class="email-content" style="padding:28px 36px 0;text-align:right;font-size:14px;font-weight:800;letter-spacing:3px">FOODHUB</td></tr>
      <tr><td class="email-content" style="padding:28px 36px 0"><p style="margin:0 0 10px;color:#059669;font-size:13px;font-weight:800;letter-spacing:1px">Una nueva etapa en FoodHub</p><h1 class="email-title" style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.2;font-weight:400">Más claridad para administrar tu acceso y elegir el plan adecuado</h1></td></tr>
      <tr><td class="email-content" style="padding:22px 36px 0;font-size:16px;line-height:1.7;color:#444"><p style="margin:0 0 16px">Hola ${clean(recipientName)},</p><p style="margin:0">Durante los próximos días comenzaremos a habilitar nuestro sistema de planes y suscripciones. Desde FoodHub podrás revisar el estado de tu cuenta, conocer las alternativas disponibles y gestionar la contratación de forma segura.</p></td></tr>
      <tr><td class="email-content" style="padding:26px 36px 0"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f7f7f8;border-radius:14px"><tr><td style="padding:22px"><p style="margin:0 0 14px;font-size:15px;line-height:1.6"><strong>15 días de prueba para cuentas nuevas.</strong> Así podrán conocer FoodHub antes de contratar.</p><p style="margin:0 0 14px;font-size:15px;line-height:1.6"><strong>Planes visibles y fáciles de comparar.</strong> Podrás revisar sus características y precios desde tu cuenta.</p><p style="margin:0 0 14px;font-size:15px;line-height:1.6"><strong>Pago seguro mediante Flow.</strong> No realizaremos cobros automáticos ni registraremos una tarjeta sin que el administrador del negocio inicie y confirme la contratación.</p><p style="margin:0;font-size:15px;line-height:1.6"><strong>Solicitud de extensión.</strong> Si termina el período de prueba y necesitas más tiempo, podrás solicitar una extensión para que nuestro equipo la evalúe.</p></td></tr></table></td></tr>
      <tr><td class="email-content" style="padding:28px 36px 0"><a class="email-cta" href="${appUrl}/subscription" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 24px;border-radius:12px">Revisar planes y suscripción</a></td></tr>
      <tr><td class="email-content" style="padding:26px 36px 0;font-size:14px;line-height:1.65;color:#52525b"><strong>Importante:</strong> podrás ver la condición específica de tu cuenta al ingresar a FoodHub. Si tienes dudas, responde este correo y te ayudaremos.</td></tr>
      <tr><td class="email-content" style="padding:32px 36px 36px;color:#a1a1aa;font-size:12px;text-align:center">FoodHub · POS, tienda online y delivery en un solo lugar</td></tr>
    </table></td></tr></table>
  </body></html>`;
  const text = `Hola ${recipientName},\n\nDurante los próximos días comenzaremos a habilitar el sistema de planes y suscripciones de FoodHub. Las cuentas nuevas tendrán 15 días de prueba; los planes estarán visibles para comparar; la contratación se realizará de forma segura mediante Flow; y, si finaliza el período de prueba, será posible solicitar una extensión para evaluación.\n\nNo realizaremos cobros automáticos ni registraremos una tarjeta sin que el administrador del negocio inicie y confirme la contratación.\n\nRevisa la condición de tu cuenta en ${appUrl}/subscription`;
  return { subject, html, text };
}

async function resolveRecipients(sb: ReturnType<typeof adminClient>) {
  const { data: organizations, error: orgError } = await sb.from("organizations").select("id,name,is_active,created_at").eq("is_active", true).order("created_at");
  if (orgError) throw orgError;
  const { data: staff, error: staffError } = await sb.from("staff").select("id,organization_id,full_name,role,is_active").in("role", ["owner", "admin"]).eq("is_active", true);
  if (staffError) throw staffError;
  const staffByOrg = new Map<string, NonNullable<typeof staff>>();
  for (const member of staff || []) staffByOrg.set(member.organization_id, [...(staffByOrg.get(member.organization_id) || []), member]);
  const authById = new Map<string, { email: string; name: string }>();
  for (let page = 1; ; page += 1) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) if (user.email) authById.set(user.id, { email: user.email.trim().toLowerCase(), name: clean(user.user_metadata?.full_name || user.email.split("@")[0]) });
    if (data.users.length < 1000) break;
  }
  const recipients: Recipient[] = [];
  const usedEmails = new Set<string>();
  let missingContact = 0, duplicateEmails = 0;
  for (const organization of organizations || []) {
    const candidates = (staffByOrg.get(organization.id) || []).sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner"));
    const selected = candidates.find((candidate) => authById.has(candidate.id));
    if (!selected) { missingContact += 1; continue; }
    const auth = authById.get(selected.id)!;
    if (usedEmails.has(auth.email)) { duplicateEmails += 1; continue; }
    usedEmails.add(auth.email);
    recipients.push({ organization_id: organization.id, organization_name: clean(organization.name) || "Negocio FoodHub", user_id: selected.id, recipient_name: clean(selected.full_name) || auth.name || "equipo", email: auth.email });
  }
  return { recipients, activeBusinesses: organizations?.length || 0, missingContact, duplicateEmails };
}

async function sendWithResend(recipient: { email: string; recipient_name: string }, isTest = false) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) throw new Error("No está configurado el servicio de correo.");
  const email = announcementEmail(recipient.recipient_name, isTest);
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: "FoodHub <hola@digital-solutions.work>", reply_to: "hola@digital-solutions.work", to: [recipient.email], ...email }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.message || `Resend respondió ${response.status}.`);
  return result?.id || null;
}

async function processBatch(sb: ReturnType<typeof adminClient>, campaignId: string, retryFailed = false) {
  if (retryFailed) await sb.from("subscription_announcement_recipients").update({ status: "pending", last_error: null }).eq("campaign_id", campaignId).eq("status", "failed");
  await sb.from("subscription_announcement_campaigns").update({ status: "running", started_at: new Date().toISOString(), completed_at: null }).eq("id", campaignId).in("status", ["queued", "running", "partial_failed", "failed"]);
  const { data: rows, error } = await sb.from("subscription_announcement_recipients").select("id,email,recipient_name,attempts").eq("campaign_id", campaignId).eq("status", "pending").order("created_at").limit(batchSize);
  if (error) throw error;
  for (const row of rows || []) {
    await sb.from("subscription_announcement_recipients").update({ status: "processing", attempts: row.attempts + 1, updated_at: new Date().toISOString() }).eq("id", row.id);
    try {
      const providerId = await sendWithResend(row);
      await sb.from("subscription_announcement_recipients").update({ status: "sent", provider_message_id: providerId, last_error: null, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", row.id);
    } catch (sendError) {
      await sb.from("subscription_announcement_recipients").update({ status: "failed", last_error: sendError instanceof Error ? sendError.message.slice(0, 500) : "Error de envío", updated_at: new Date().toISOString() }).eq("id", row.id);
    }
  }
  const { data: all, error: allError } = await sb.from("subscription_announcement_recipients").select("status").eq("campaign_id", campaignId);
  if (allError) throw allError;
  const sent = all?.filter((row) => row.status === "sent").length || 0;
  const failed = all?.filter((row) => row.status === "failed").length || 0;
  const remaining = all?.filter((row) => row.status === "pending" || row.status === "processing").length || 0;
  const status = remaining ? "running" : failed ? (sent ? "partial_failed" : "failed") : "completed";
  await sb.from("subscription_announcement_campaigns").update({ status, sent_count: sent, failed_count: failed, completed_at: remaining ? null : new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", campaignId);
  return { campaignId, status, sent, failed, remaining };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  try {
    const sb = adminClient();
    const userId = await callerId(req, sb);
    if (!userId || !(await isSuperAdmin(userId, sb))) return json({ error: "Acceso restringido al super-admin." }, 403);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || (body.mode === "test" ? "test" : "status"));
    if (action === "test") {
      const { data, error } = await sb.auth.admin.getUserById(userId);
      if (error || !data.user?.email) throw error || new Error("Tu cuenta no tiene un correo configurado.");
      await sendWithResend({ email: data.user.email, recipient_name: clean(data.user.user_metadata?.full_name || data.user.email.split("@")[0]) }, true);
      return json({ sent: true, recipient: data.user.email });
    }
    if (action === "preview") {
      const result = await resolveRecipients(sb);
      return json({ recipientCount: result.recipients.length, activeBusinesses: result.activeBusinesses, missingContact: result.missingContact, duplicateEmails: result.duplicateEmails, sample: result.recipients.slice(0, 5).map(({ organization_name, email }) => ({ organization_name, email })) });
    }
    if (action === "start") {
      const existing = await sb.from("subscription_announcement_campaigns").select("id,status").in("status", ["queued", "running"]).limit(1).maybeSingle();
      if (existing.data) return json({ error: "Ya existe una campaña en curso.", campaignId: existing.data.id }, 409);
      const resolved = await resolveRecipients(sb);
      if (!resolved.recipients.length) return json({ error: "No hay destinatarios válidos." }, 409);
      const { data: campaign, error } = await sb.from("subscription_announcement_campaigns").insert({ subject: subjectBase, created_by: userId, total_recipients: resolved.recipients.length }).select("id").single();
      if (error) throw error;
      const { error: recipientError } = await sb.from("subscription_announcement_recipients").insert(resolved.recipients.map((recipient) => ({ campaign_id: campaign.id, ...recipient })));
      if (recipientError) throw recipientError;
      return json(await processBatch(sb, campaign.id));
    }
    if (action === "process" || action === "retry") {
      if (!body.campaignId) return json({ error: "Falta identificar la campaña." }, 422);
      return json(await processBatch(sb, String(body.campaignId), action === "retry"));
    }
    if (action === "status") {
      let query = sb.from("subscription_announcement_campaigns").select("*").order("created_at", { ascending: false }).limit(10);
      if (body.campaignId) query = query.eq("id", String(body.campaignId));
      const { data, error } = await query;
      if (error) throw error;
      return json({ campaigns: data || [] });
    }
    return json({ error: "Acción no reconocida." }, 422);
  } catch (error) {
    console.error("send-subscription-announcement failed", error);
    return json({ error: error instanceof Error ? error.message : "No se pudo administrar la campaña." }, 400);
  }
});
