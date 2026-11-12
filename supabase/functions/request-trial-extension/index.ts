import { adminClient, callerId, CORS, json } from "../_shared/flow.ts";

const escapeHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const sb = adminClient();
  let requestId: number | null = null;
  try {
    const userId = await callerId(req, sb);
    if (!userId) return json({ error: "Debes iniciar sesión." }, 401);

    const { data: staff, error: staffError } = await sb.from("staff")
      .select("organization_id, role, is_active, full_name, organizations(name)")
      .eq("id", userId).maybeSingle();
    if (staffError) throw staffError;
    if (!staff?.organization_id || staff.is_active === false || !["owner", "admin", "manager"].includes(staff.role)) {
      return json({ error: "Solo el dueño o un administrador puede solicitar más tiempo." }, 403);
    }

    const { data: subscription, error: subscriptionError } = await sb.from("organization_subscriptions")
      .select("status, trial_ends_at, free_access, free_access_starts_at, free_access_ends_at")
      .eq("organization_id", staff.organization_id).maybeSingle();
    if (subscriptionError) throw subscriptionError;
    const trialEnd = subscription?.trial_ends_at ? new Date(subscription.trial_ends_at).getTime() : Number.POSITIVE_INFINITY;
    const freeStart = subscription?.free_access_starts_at ? new Date(subscription.free_access_starts_at).getTime() : Number.NEGATIVE_INFINITY;
    const freeEnd = subscription?.free_access_ends_at ? new Date(subscription.free_access_ends_at).getTime() : Number.POSITIVE_INFINITY;
    const hasCourtesy = Boolean(subscription?.free_access) && freeStart <= Date.now() && freeEnd > Date.now();
    if (!subscription || subscription.status !== "trialing" || trialEnd > Date.now() || hasCourtesy) {
      return json({ error: "Esta cuenta no tiene un período de prueba vencido." }, 409);
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent, error: recentError } = await sb.from("trial_extension_requests")
      .select("id").eq("organization_id", staff.organization_id).gte("requested_at", since).limit(1).maybeSingle();
    if (recentError) throw recentError;
    if (recent) return json({ sent: true, alreadyRequested: true });

    const { data: inserted, error: insertError } = await sb.from("trial_extension_requests")
      .insert({ organization_id: staff.organization_id, requested_by: userId }).select("id").single();
    if (insertError) throw insertError;
    requestId = Number(inserted.id);

    const { data: admins, error: adminsError } = await sb.from("super_admins").select("user_id");
    if (adminsError) throw adminsError;
    const recipients = (await Promise.all((admins || []).map(async ({ user_id }) => {
      const { data } = await sb.auth.admin.getUserById(user_id);
      return data.user?.email || null;
    }))).filter(Boolean);
    if (recipients.length === 0) throw new Error("No hay un correo de super-administración configurado.");

    const { data: requester } = await sb.auth.admin.getUserById(userId);
    const businessName = escapeHtml(staff.organizations?.name || "Negocio sin nombre");
    const requesterName = escapeHtml(staff.full_name || requester.user?.email || "Administrador del negocio");
    const trialDate = new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "America/Santiago" })
      .format(new Date(subscription.trial_ends_at));
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("No está configurado el servicio de correo.");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "FoodHub <hola@digital-solutions.work>",
        to: recipients,
        subject: `Solicitud de extensión de prueba — ${staff.organizations?.name || "FoodHub"}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111"><h1 style="font-size:24px">Solicitud de más tiempo de prueba</h1><p><strong>${businessName}</strong> solicitó extender su período de prueba.</p><table style="width:100%;border-collapse:collapse;background:#f7f7f8;border-radius:12px"><tr><td style="padding:12px"><strong>Solicitante</strong></td><td style="padding:12px">${requesterName}</td></tr><tr><td style="padding:12px"><strong>Prueba vencida</strong></td><td style="padding:12px">${escapeHtml(trialDate)}</td></tr></table><p style="margin-top:20px">Puedes otorgar una cortesía desde el panel de super-administración.</p></div>`,
        text: `${staff.organizations?.name || "El negocio"} solicitó más tiempo de prueba. Solicitante: ${staff.full_name || requester.user?.email || userId}. La prueba venció el ${trialDate}.`,
      }),
    });
    if (!response.ok) throw new Error("No se pudo enviar el correo de solicitud.");
    return json({ sent: true });
  } catch (error) {
    if (requestId) await sb.from("trial_extension_requests").delete().eq("id", requestId);
    console.error("request-trial-extension failed", error);
    const message = error instanceof Error ? error.message : "No se pudo enviar la solicitud.";
    return json({ error: message }, 400);
  }
});
