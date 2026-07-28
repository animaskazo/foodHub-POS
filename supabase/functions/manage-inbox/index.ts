import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function createInboxEmbed(phoneNumberId: string, orgName: string) {
  const apiKey = Deno.env.get("KAPSO_API_KEY");
  if (!apiKey) throw new Error("KAPSO_API_KEY no configurada");

  const res = await fetch("https://api.kapso.ai/platform/v1/inbox_embeds", {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inbox_embed: {
        name: `Inbox - ${orgName}`,
        scope_type: "phone_number",
        scope_id: phoneNumberId,
        allowed_origins: ["*"],
        default_mode: "dark",
        language: "es",
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Kapso create embed error:", err);
    throw new Error(`Error creando inbox embed: ${res.status}`);
  }

  const data = await res.json();
  return data;
}

async function revokeInboxEmbed(embedId: string) {
  const apiKey = Deno.env.get("KAPSO_API_KEY");
  if (!apiKey) throw new Error("KAPSO_API_KEY no configurada");

  const res = await fetch(
    `https://api.kapso.ai/platform/v1/inbox_embeds/${embedId}`,
    {
      method: "DELETE",
      headers: { "X-API-Key": apiKey },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("Kapso revoke embed error:", err);
    throw new Error(`Error revocando inbox embed: ${res.status}`);
  }

  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const body = await req.json();
    const { action, organization_id } = body;
    const sb = getSupabase();

    if (action === "create") {
      // Get org details
      const { data: org, error: orgError } = await sb
        .from("organizations")
        .select("id, name, whatsapp_phone_number_id")
        .eq("id", organization_id)
        .single();

      if (orgError || !org) throw new Error("Organización no encontrada");
      if (!org.whatsapp_phone_number_id) {
        throw new Error("Esta organización no tiene WhatsApp configurado");
      }

      // Create embed via Kapso
      const embed = await createInboxEmbed(
        org.whatsapp_phone_number_id,
        org.name
      );

      const embedUrl = embed.embed_url || embed.data?.embed_url;
      if (!embedUrl) {
        throw new Error("Kapso no devolvió una URL de embed");
      }

      // Save to organization
      const { error: updateError } = await sb
        .from("organizations")
        .update({
          whatsapp_inbox_url: embedUrl,
          whatsapp_inbox_enabled: true,
        })
        .eq("id", organization_id);

      if (updateError) throw updateError;

      return json({ ok: true, embed_url: embedUrl });

    } else if (action === "toggle") {
      const { enabled } = body;
      const { error: updateError } = await sb
        .from("organizations")
        .update({ whatsapp_inbox_enabled: !!enabled })
        .eq("id", organization_id);

      if (updateError) throw updateError;

      return json({ ok: true, enabled: !!enabled });

    } else if (action === "revoke") {
      const { embed_id } = body;
      if (embed_id) {
        await revokeInboxEmbed(embed_id);
      }

      const { error: updateError } = await sb
        .from("organizations")
        .update({
          whatsapp_inbox_url: null,
          whatsapp_inbox_enabled: false,
        })
        .eq("id", organization_id);

      if (updateError) throw updateError;

      return json({ ok: true });

    } else {
      return json({ error: "Acción no reconocida" }, 400);
    }
  } catch (err) {
    console.error("manage-inbox error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Error inesperado" },
      400
    );
  }
});
