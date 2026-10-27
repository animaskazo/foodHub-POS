/** Provider-independent helpers for Instagram webhook verification and event extraction. */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let mismatch = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    mismatch |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return mismatch === 0;
}

export async function verifyMetaSignature(rawBody: Uint8Array, header: string | null, appSecret: string): Promise<boolean> {
  if (!header || !/^sha256=[a-f0-9]{64}$/i.test(header) || !appSecret) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, rawBody));
  const expected = "sha256=" + Array.from(digest, b => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(expected, header.toLowerCase());
}

export interface IncomingInstagramMessage {
  accountId: string;
  senderId: string;
  messageId: string;
  text: string | null;
  timestamp: number | null;
}

export function extractInstagramMessages(payload: unknown): IncomingInstagramMessage[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  if (root.object !== "instagram" || !Array.isArray(root.entry)) return [];
  const messages: IncomingInstagramMessage[] = [];
  for (const entry of root.entry) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const accountId = typeof item.id === "string" ? item.id : String(item.id ?? "");
    if (!accountId || !Array.isArray(item.messaging)) continue;
    for (const event of item.messaging) {
      if (!event || typeof event !== "object") continue;
      const m = event as Record<string, unknown>;
      const sender = m.sender as Record<string, unknown> | undefined;
      const message = m.message as Record<string, unknown> | undefined;
      if (!sender || !message || message.is_echo === true) continue;
      const senderId = typeof sender.id === "string" ? sender.id : "";
      const messageId = typeof message.mid === "string" ? message.mid : "";
      if (!senderId || !messageId) continue;
      messages.push({
        accountId, senderId, messageId,
        text: typeof message.text === "string" ? message.text : null,
        timestamp: typeof m.timestamp === "number" ? m.timestamp : null,
      });
    }
  }
  return messages;
}
