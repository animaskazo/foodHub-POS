import { getReceipts, sendOnce } from './core.mjs';

// Own authentication allows a scheduler secret without exposing service_role.
// Disabled unless deliberately configured in the target project's secrets.
export async function handleRequest(req: Request) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = Deno.env.get('PUSH_WORKER_SECRET');
  const supplied = req.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
  if (!secret || !(await equalSecret(secret, supplied))) return new Response('Unauthorized', { status: 401 });
  if (Deno.env.get('PUSH_ENABLED') !== 'true') return Response.json({ disabled: true });
  const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!expoToken || !url || !serviceKey) return new Response('Missing server configuration', { status: 503 });

  async function db(path: string, method = 'GET', body?: unknown) {
    const result = await fetch(`${url}/rest/v1/${path}`, {
      method,
      headers: { apikey: serviceKey!, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000),
    });
    if (!result.ok) throw new Error(`Database ${result.status}`);
    const text = await result.text();
    return text ? JSON.parse(text) : null;
  }

  try {
    const now = new Date();
    await db(`push_deliveries?created_at=lt.${new Date(now.getTime() - 7 * 86400000).toISOString()}`, 'DELETE');
    await db(`push_deliveries?status=eq.pending&created_at=lt.${new Date(now.getTime() - 300000).toISOString()}`, 'PATCH', { status: 'expired' });
    // Never resend attempts abandoned by a terminated worker.
    await db(`push_deliveries?status=eq.attempted&attempted_at=lt.${new Date(now.getTime() - 120000).toISOString()}`, 'PATCH', { status: 'unknown', error_code: 'WorkerInterrupted' });

    await db(`push_deliveries?status=eq.accepted&attempted_at=lt.${new Date(now.getTime() - 86400000).toISOString()}`, 'PATCH', { status: 'unknown', error_code: 'ReceiptUnavailable' });
    const receipts = await db(`push_deliveries?select=id,device_id,ticket_id,expo_push_token&status=eq.accepted&attempted_at=lt.${new Date(now.getTime() - 900000).toISOString()}&attempted_at=gt.${new Date(now.getTime() - 86400000).toISOString()}&order=attempted_at.asc&limit=100`);
    if (receipts.length) {
      // Polling receipts is read-only at Expo and safe to repeat.
      const data = await getReceipts(receipts.map((r: { ticket_id: string }) => r.ticket_id), expoToken);
      for (const row of receipts) {
        const receipt = data[row.ticket_id];
        if (!receipt) continue;
        const error = receipt.details?.error;
        await db(`push_deliveries?id=eq.${row.id}&status=eq.accepted`, 'PATCH', {
          status: receipt.status === 'ok' ? 'delivered' : 'error',
          receipt_checked_at: now.toISOString(), error_code: error || null,
        });
        if (error === 'DeviceNotRegistered') {
          // Expire the device without deleting delivery history.
          await db(`push_devices?id=eq.${row.device_id}&expo_push_token=eq.${encodeURIComponent(row.expo_push_token)}`, 'PATCH', { expires_at: now.toISOString() });
        }
      }
    }
    const jobs = await db('rpc/claim_push_deliveries', 'POST', {});
    let accepted = 0;
    for (const job of jobs) {
      const authorized = await db('rpc/push_delivery_authorized', 'POST', { p_delivery_id: job.delivery_id });
      if (!authorized) {
        await db(`push_deliveries?id=eq.${job.delivery_id}&status=eq.attempted`, 'PATCH', { status: 'expired', error_code: 'AuthorizationRevoked' });
        continue;
      }
      const result = await sendOnce(job, expoToken);
      await db(`push_deliveries?id=eq.${job.delivery_id}&status=eq.attempted`, 'PATCH', result);
      if (result.error_code === 'DeviceNotRegistered') {
        await db(`push_devices?expo_push_token=eq.${encodeURIComponent(job.token)}`, 'PATCH', { expires_at: now.toISOString() });
      }
      if (result.status === 'accepted') accepted++;
    }
    return Response.json({ attempted: jobs.length, accepted });
  } catch {
    // Do not return tokens, payloads, or upstream database errors.
    return new Response('Push worker failed; inspect delivery statuses', { status: 500 });
  }
}

async function equalSecret(expected: string, supplied: string) {
  const encode = new TextEncoder();
  const [a, b] = await Promise.all([expected, supplied].map(s => crypto.subtle.digest('SHA-256', encode.encode(s))));
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}
