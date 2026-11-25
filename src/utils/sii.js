// Internal simulations only. No signing, folio allocation or SII submission.
export const SII_CHANNELS = [
  { value: 'pos', label: 'Punto de venta', description: 'Ventas directas en caja y mesas.' },
  { value: 'online', label: 'Tienda online', description: 'Pedidos realizados en la tienda web.' },
  { value: 'whatsapp', label: 'WhatsApp', description: 'Pedidos recibidos por WhatsApp.' },
];

export function validateEmissionPolicy(profile) {
  const channels = profile.emission_channels ?? [];
  const model = profile.emission_model ?? 'unconfirmed';
  const terminal = profile.terminal_document ?? 'unconfirmed';
  const online = profile.online_document ?? 'unconfirmed';
  if (!Array.isArray(channels) || channels.some(value => !SII_CHANNELS.some(channel => channel.value === value))
    || !['unconfirmed', 'always_receipt', 'voucher_replaces_receipt'].includes(model)
    || !['unconfirmed', 'voucher', 'foodhub'].includes(terminal)
    || !['unconfirmed', 'voucher', 'foodhub'].includes(online)) {
    throw new Error('Revisa los canales y la configuración de emisión.');
  }
  return { emission_channels: [...new Set(channels)].sort(), emission_model: model, terminal_document: terminal, online_document: online };
}

// Planning/preview only. A future server-side issuing worker must re-evaluate
// authoritative orders, payments, provider evidence and document uniqueness.
export function decideReceiptEmission(profile, order) {
  const result = (action, reason, message) => ({ action, reason, message });
  let policy;
  try { policy = validateEmissionPolicy(profile); } catch {
    return result('review', 'invalid_policy', 'Revisar la configuración de emisión.');
  }
  const channel = ['table', 'pickup'].includes(order?.order_type) ? 'pos'
    : ['online', 'whatsapp'].includes(order?.order_type) ? order.order_type : null;
  if (!channel) return result('review', 'unknown_channel', 'Canal de pedido desconocido.');
  if (!policy.emission_channels.includes(channel)) return result('skip', 'channel_disabled', 'FoodHub no emite automáticamente para este canal. La venta debe documentarse por el sistema que corresponda.');
  if (['cancelled', 'refunded'].includes(order.status)) return result('skip', 'inactive_order', 'Pedido cancelado o reembolsado: revisar documentos existentes si corresponde.');
  if (order.existing_receipt_id) return result('skip', 'already_issued', 'El pedido ya tiene una boleta asociada.');
  if (!Number.isSafeInteger(order.total) || order.total < 1 || !Array.isArray(order.payments)) {
    return result('review', 'invalid_payments', 'Revisar el total y los pagos del pedido.');
  }
  if (order.payments.some(payment => ['refunded', 'partial_refund'].includes(payment.status))) {
    return result('review', 'refund', 'Revisar pagos reembolsados y documentos existentes.');
  }
  const payments = order.payments.filter(payment => ['paid', 'completed'].includes(payment.status));
  if (!payments.length) return result('wait', 'unpaid', 'Esperar la confirmación del pago.');
  if (payments.some(payment => !Number.isSafeInteger(payment.amount) || payment.amount < 1)) {
    return result('review', 'invalid_payments', 'Revisar los montos pagados.');
  }
  const paid = payments.reduce((total, payment) => total + payment.amount, 0);
  if (paid < order.total) return result('wait', 'partial_payment', 'Esperar el pago completo.');
  if (paid > order.total) return result('review', 'payment_mismatch', 'El monto pagado no coincide con el total.');
  const electronic = payments.filter(payment => ['card', 'debit', 'credit', 'online_gateway', 'klap'].includes(payment.method));
  if (payments.some(payment => !['cash', 'transfer', 'card', 'debit', 'credit', 'online_gateway', 'klap'].includes(payment.method))) {
    return result('review', 'unknown_method', 'Revisar el medio de pago antes de emitir.');
  }
  if (policy.emission_model === 'unconfirmed') return result('review', 'model_unconfirmed', 'Confirmar el modelo de emisión registrado en el SII.');
  if (!electronic.length || policy.emission_model === 'always_receipt') {
    return result('emit', 'foodhub_receipt', 'FoodHub emitiría la boleta al confirmarse el pago completo.');
  }
  const coverage = electronic.map(payment => ['card', 'debit', 'credit'].includes(payment.method) ? policy.terminal_document : policy.online_document);
  if (coverage.includes('unconfirmed')) return result('review', 'provider_unconfirmed', 'Confirmar si el operador entrega un voucher válido como boleta.');
  if (coverage.every(value => value === 'foodhub')) return result('emit', 'foodhub_receipt', 'FoodHub emitiría la boleta al confirmarse el pago completo.');
  if (electronic.length === payments.length && coverage.every(value => value === 'voucher')) {
    return result('skip', 'voucher_covers_sale', 'El voucher del operador cubre esta venta. FoodHub no emitiría otra boleta.');
  }
  return result('review', 'mixed_coverage', 'Pago mixto: revisar la parte cubierta por voucher para no duplicar la venta.');
}

export function normalizeRut(value) {
  const compact = String(value ?? '').replace(/[.\s-]/g, '').toUpperCase();
  if (!/^\d{7,8}[0-9K]$/.test(compact)) return '';
  const body = compact.slice(0, -1);
  let sum = 0;
  let factor = 2;
  for (const digit of [...body].reverse()) {
    sum += Number(digit) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const remainder = 11 - (sum % 11);
  const expected = remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);
  return compact.at(-1) === expected && Number(body) > 0 ? `${body}-${expected}` : '';
}

export function validateSiiProfile(profile) {
  if (!normalizeRut(profile.rut)) throw new Error('Ingresa un RUT válido para el emisor.');
  const fields = { legal_name: 'razón social', business_activity: 'giro', address: 'dirección', commune: 'comuna' };
  for (const [key, label] of Object.entries(fields)) {
    if (!profile[key]?.trim() || profile[key].trim().length > 100) {
      throw new Error(`Completa ${label} (máximo 100 caracteres).`);
    }
  }
  return Object.fromEntries([
    ['rut', normalizeRut(profile.rut)],
    ...Object.keys(fields).map(key => [key, profile[key].trim()]),
    ...Object.entries(validateEmissionPolicy(profile)),
  ]);
}

export function calculateSimulation(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
    throw new Error('Agrega entre 1 y 50 productos.');
  }
  let total = 0;
  for (const item of items) {
    if (!item.name?.trim() || item.name.trim().length > 80
      || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000
      || !Number.isSafeInteger(item.unit_price) || item.unit_price < 1 || item.unit_price > 100000000) {
      throw new Error('Revisa los productos: nombre, cantidad y precio entero mayor que cero.');
    }
    total += item.quantity * item.unit_price;
  }
  if (total > 1000000000) throw new Error('El total de la simulación supera el límite de $1.000.000.000.');
  const net = Math.round(total * 100 / 119);
  return { total, net, vat: total - net };
}
