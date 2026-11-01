const endpoint = 'https://exp.host/--/api/v2/push';

export function notification(job) {
  return {
    to: job.token,
    title: 'Nuevo pedido recibido',
    body: 'Toca para ver el pedido en FoodHub.',
    sound: 'default',
    channelId: 'new-orders',
    ttl: 300,
    data: { type: 'new_order', orderId: job.order_id, organizationId: job.organization_id },
  };
}

// One HTTP attempt only. Expo does not offer an exactly-once delivery guarantee.
export async function sendOnce(job, accessToken, fetcher = fetch) {
  try {
    const response = await fetcher(`${endpoint}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(notification(job)),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { status: 'unknown', error_code: `HTTP_${response.status}` };
    const { data } = await response.json();
    const ticket = Array.isArray(data) ? data[0] : data;
    if (ticket?.status === 'ok' && typeof ticket.id === 'string') {
      return { status: 'accepted', ticket_id: ticket.id };
    }
    if (ticket?.status === 'error') return { status: 'error', error_code: ticket.details?.error || 'ExpoError' };
    return { status: 'unknown', error_code: 'InvalidExpoResponse' };
  } catch {
    return { status: 'unknown', error_code: 'NetworkOrTimeout' };
  }
}

export async function getReceipts(ids, accessToken, fetcher = fetch) {
  const response = await fetcher(`${endpoint}/getReceipts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ ids }), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Receipt request failed');
  return (await response.json()).data || {};
}
