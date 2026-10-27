import { createClient } from "jsr:@supabase/supabase-js@2";
import { extractInstagramMessages, timingSafeEqual, verifyMetaSignature } from "./validation.ts";

/**
 * Ingestion-only endpoint. Does NOT reply to Instagram or place orders.
 * Deploy with JWT verification disabled for Meta webhooks; HMAC verification is mandatory.
 */
Deno.serve(async (request) => {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("META_VERIFY_TOKEN");
    if (mode !== "subscribe" || !token || !expected || !timingSafeEqual(token, expected) || !challenge) {
      return new Response("Forbidden", { status: 403 });
    }
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const appSecret = Deno.env.get("META_APP_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!appSecret || !supabaseUrl || !serviceKey) return new Response("Not configured", { status: 503 });

  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (rawBody.length > 1024 * 1024) return new Response("Payload too large", { status: 413 });
  if (!await verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder().decode(rawBody)); }
  catch { return new Response("Invalid JSON", { status: 400 }); }

  const incoming = extractInstagramMessages(payload);
  const sb = createClient(supabaseUrl, serviceKey);
  // Acknowledge only after events have been persisted. Fail closed for unknown accounts.
  for (const message of incoming) {
    const { data: connection, error: connectionError } = await sb
      .from("instagram_connections")
      .select("organization_id")
      .eq("instagram_user_id", message.accountId)
      .eq("status", "connected")
      .maybeSingle();
    if (connectionError) return new Response("Connection lookup failed", { status: 500 });
    if (!connection) continue; // Never route to a default organization.
    const { error } = await sb.from("channel_events").upsert({
      organization_id: connection.organization_id,
      channel: "instagram",
      provider_event_id: message.messageId,
      event_type: "message.received",
      status: "received",
      payload: {
        account_id: message.accountId,
        sender_id: message.senderId,
        message_id: message.messageId,
        text: message.text,
        timestamp: message.timestamp,
      },
    }, { onConflict: "channel,provider_event_id", ignoreDuplicates: true });
    if (error) return new Response("Event persistence failed", { status: 500 });
    // Store the inbox view independently of the AI processor.
    const { data: conversation, error: conversationError } = await sb.from("channel_conversations").upsert({
      organization_id: connection.organization_id, channel: "instagram",
      channel_account_id: message.accountId, external_customer_id: message.senderId,
      last_message_preview: (message.text || "Mensaje multimedia").slice(0, 180),
      last_message_at: new Date().toISOString(),
    }, { onConflict: "organization_id,channel,channel_account_id,external_customer_id" })
      .select("id").single();
    if (conversationError || !conversation) return new Response("Inbox persistence failed", { status: 500 });
    const { error: messageError } = await sb.from("channel_messages").upsert({
      conversation_id: conversation.id, organization_id: connection.organization_id,
      provider_message_id: message.messageId, direction: "inbound",
      sender_type: "customer", message_type: message.text === null ? "unsupported" : "text",
      body: message.text, delivery_status: "received",
    }, { onConflict: "conversation_id,provider_message_id", ignoreDuplicates: true });
    if (messageError) return new Response("Message persistence failed", { status: 500 });
  }
  return new Response("EVENT_RECEIVED", { status: 200 });
});
