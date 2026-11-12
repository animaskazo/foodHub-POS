import { adminClient, callerId, CORS, isSuperAdmin, json } from "../_shared/flow.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_DURATION_DAYS = 3650;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    const sb = adminClient();
    const userId = await callerId(req, sb);
    if (!userId) return json({ error: "Debes iniciar sesión." }, 401);
    if (!(await isSuperAdmin(userId, sb))) {
      return json({ error: "Solo un superadministrador puede gestionar cortesías." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const organizationId = String(body.organizationId || "").trim();
    const action = String(body.action || "").trim();
    const note = String(body.note || "").trim();
    if (!UUID.test(organizationId)) return json({ error: "El negocio no es válido." }, 400);
    if (!['grant', 'revoke'].includes(action)) return json({ error: "La acción no es válida." }, 400);
    if (note.length > 500) return json({ error: "La nota no puede superar 500 caracteres." }, 400);

    let endsAt: string | null = null;
    if (action === 'grant') {
      if (body.endsAt) {
        const parsed = new Date(String(body.endsAt));
        if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
          return json({ error: "La fecha de vencimiento debe estar en el futuro." }, 400);
        }
        if (parsed.getTime() > Date.now() + MAX_DURATION_DAYS * 86400000) {
          return json({ error: `La cortesía no puede superar ${MAX_DURATION_DAYS} días.` }, 400);
        }
        endsAt = parsed.toISOString();
      } else {
        const durationDays = Number(body.durationDays);
        if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > MAX_DURATION_DAYS) {
          return json({ error: `La duración debe ser de 1 a ${MAX_DURATION_DAYS} días.` }, 400);
        }
        endsAt = new Date(Date.now() + durationDays * 86400000).toISOString();
      }
    }

    const { error: mutationError } = await sb.rpc('manage_complimentary_access', {
      p_organization_id: organizationId,
      p_action: action,
      p_ends_at: endsAt,
      p_note: note || null,
      p_actor_id: userId,
    });
    if (mutationError) throw mutationError;

    const { data, error: readError } = await sb.from('organization_subscriptions')
      .select('organization_id, status, free_access, free_access_starts_at, free_access_ends_at, free_access_granted_by, free_access_note')
      .eq('organization_id', organizationId)
      .single();
    if (readError) throw readError;

    return json({ subscription: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo gestionar la cortesía.";
    return json({ error: message }, 400);
  }
});
