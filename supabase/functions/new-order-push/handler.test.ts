import { handleRequest } from './handler.ts';

function assert(value: unknown, message: string) { if (!value) throw new Error(message); }

Deno.test('worker authenticates before database access and is disabled by default', async () => {
  const fetcher = globalThis.fetch;
  const keys = ['PUSH_WORKER_SECRET','PUSH_ENABLED','EXPO_ACCESS_TOKEN','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const old = keys.map(key => Deno.env.get(key));
  try {
    globalThis.fetch = () => { throw new Error('No network permitted'); };
    Deno.env.set('PUSH_WORKER_SECRET','worker-secret');
    Deno.env.delete('PUSH_ENABLED');
    assert((await handleRequest(new Request('https://local', { method: 'POST' }))).status === 401, 'Reject missing secret');
    assert((await handleRequest(new Request('https://local', { method: 'POST', headers: { Authorization: 'Bearer wrong' } }))).status === 401, 'Reject wrong secret');
    const request = () => new Request('https://local', { method: 'POST', headers: { Authorization: 'Bearer worker-secret' } });
    assert((await (await handleRequest(request())).json()).disabled, 'Default kill switch');
    Deno.env.set('PUSH_ENABLED','true');
    Deno.env.delete('EXPO_ACCESS_TOKEN');
    assert((await handleRequest(request())).status === 503, 'Missing credentials cannot claim jobs');
    Deno.env.set('EXPO_ACCESS_TOKEN','expo-secret');
    Deno.env.set('SUPABASE_URL','https://test.supabase.co');
    Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','service-secret');
    let claimed = false, sends = 0, recorded = false;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('/push/send')) {
        sends++;
        assert(claimed, 'Reserve before HTTP');
        assert(init?.headers && (init.headers as Record<string,string>).Authorization === 'Bearer expo-secret', 'Expo auth');
        return Response.json({ data: { status: 'ok', id: 'ticket-a' } });
      }
      if (url.includes('rpc/claim_push_deliveries')) {
        if (claimed) return Response.json([]);
        claimed = true;
        return Response.json([{ delivery_id:'delivery-a',order_id:'order-a',organization_id:'org-a',token:'ExpoPushToken[a]' }]);
      }
      if (url.includes('rpc/push_delivery_authorized')) return Response.json(true);
      if (url.includes('select=id,device_id')) return Response.json([]);
      if (init?.body && JSON.parse(String(init.body)).ticket_id === 'ticket-a') recorded = true;
      return new Response(null, { status: 204 });
    };
    assert((await handleRequest(request())).status === 200, 'First invocation succeeds');
    assert(recorded, 'Ticket persisted');
    assert((await handleRequest(request())).status === 200, 'Repeated invocation succeeds');
    assert(sends === 1, 'No second send');
  } finally {
    globalThis.fetch = fetcher;
    keys.forEach((key,index) => old[index] === undefined ? Deno.env.delete(key) : Deno.env.set(key,old[index]!));
  }
});
