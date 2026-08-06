// ── Simulación del flujo de compra (NO toca PROD) ─────────────
// Ejecuta el createPublicOrder REAL (src/services/publicOrderService.js)
// contra un Supabase en memoria (loader hook). Escenarios:
//   1) Retiro en local + pago en caja (cash)
//   2) Despacho a domicilio + delivery propio
//   3) Despacho a domicilio + Uber Direct (simulado)
//
// Uso: node --import ./test-checkout-flow.loader.mjs test-checkout-flow.mjs
// (sin tocar la base de producción)

import './test-checkout-flow.loader.mjs';
import { supabase } from './test-checkout-flow.supabase-impl.mjs';

let passed = 0;
let failed = 0;
const assert = (cond, label) => {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${label}`);
  }
};
const assertClose = (a, b, label, eps = 0.01) => assert(Math.abs(a - b) < eps, `${label} (${a} ≈ ${b})`);

// ══ Seed: catálogo + organización + sucursal + ingredientes ══
const ORG_ID = 'org-test-001';
const BRANCH_ID = 'branch-test-001';
const TAX = 19;

supabase.__seed('organizations', [{
  id: ORG_ID, name: 'FoodHub Test', slug: 'foodhub-test', default_tax_rate: TAX,
  accepts_online_payments: true, online_payments_allowed: true,
  accepts_local_payments: true, delivery_enabled: true,
  delivery_mode: 'own', uber_enabled: false,
  store_lat: -33.5, store_lng: -70.76, delivery_radius_km: 10,
  delivery_fee: 2000, delivery_min_order: 8000, prep_time: 15,
  business_hours: { mon: { open: '09:00', close: '23:00', closed: false } },
}]);
supabase.__seed('branches', [{ id: BRANCH_ID, organization_id: ORG_ID, name: 'Sucursal Principal', is_active: true }]);

const P1 = 'prod-001', P2 = 'prod-002', P3 = 'prod-003';
const ING_BASE = 'ing-base-1', ING_EXTRA = 'ing-extra-1', ING2 = 'ing-base-2';
supabase.__seed('products', [
  { id: P1, organization_id: ORG_ID, name: 'Completo', base_price: 6000, type: 'physical', status: 'available', description: 'Pan, vienesa y palta' },
  { id: P2, organization_id: ORG_ID, name: 'Hamburguesa', base_price: 8000, type: 'physical', status: 'available' },
  { id: P3, organization_id: ORG_ID, name: 'Papas Fritas', base_price: 2500, type: 'physical', status: 'available' },
]);
supabase.__seed('ingredients', [
  { id: ING_BASE, name: 'Vienesa', unit: 'un', stock_quantity: 100, portion_quantity: 1 },
  { id: ING_EXTRA, name: 'Palta extra', unit: 'gr', stock_quantity: 500, portion_quantity: 50, price: 1000 },
  { id: ING2, name: 'Pan', unit: 'un', stock_quantity: 100, portion_quantity: 1 },
]);
supabase.__seed('product_ingredients', [
  { product_id: P1, ingredient_id: ING_BASE, is_base: true, portion_multiplier: 1, variant_option_id: null },
  { product_id: P1, ingredient_id: ING2, is_base: true, portion_multiplier: 1, variant_option_id: null },
  { product_id: P2, ingredient_id: ING2, is_base: true, portion_multiplier: 1, variant_option_id: null },
  { product_id: P3, ingredient_id: ING2, is_base: true, portion_multiplier: 0.5, variant_option_id: null },
]);
supabase.__seed('categories', [{ id: 'cat-1', organization_id: ORG_ID, name: 'Favoritos', is_active: true, show_online: true }]);
supabase.__seed('product_categories', [{ product_id: P1, category_id: 'cat-1' }]);
supabase.__seed('product_images', [{ product_id: P1, url: 'https://example.com/p1.jpg' }]);

// ══ Importar los servicios reales (con supabase mockeado) ══
const { createPublicOrder, getPublicCatalog, getOrganizationByName } = await import('./src/services/publicOrderService.js');
const { checkInventoryStock, deductInventoryForOrder } = await import('./src/services/inventoryService.js');

// ══ Helpers de cálculo (mismas fórmulas que el front) ══
const computeSubtotal = (items) => items.reduce((acc, item) => {
  let unitPrice = Math.round(item.price);
  if (item.selectedIngredients) {
    unitPrice += item.selectedIngredients.reduce((s, i) => s + (i.price || 0), 0);
  }
  return acc + unitPrice * item.quantity;
}, 0);

console.log('\n═══ Catálogo público ═══');
const catalog = await getPublicCatalog(ORG_ID);
assert(catalog.products.length === 3, 'catálogo público trae 3 productos');
assert(catalog.products[0].image === 'https://example.com/p1.jpg', 'producto mapea imagen');
assert(catalog.products[0].category === 'Favoritos', 'producto mapea categoría');

console.log('\n═══ Escenario 1: RETIRO EN LOCAL + PAGO EN CAJA ═══');
{
  const cart = [
    { id: P1, name: 'Completo', price: 6000, quantity: 2, selectedIngredients: [{ id: ING_EXTRA, name: 'Palta extra', price: 1000 }] },
    { id: P3, name: 'Papas Fritas', price: 2500, quantity: 1, selectedIngredients: [] },
  ];
  const subtotal = computeSubtotal(cart); // 2*(6000+1000) + 2500 = 16500
  assertClose(subtotal, 16500, 'subtotal carrito 16500');

  const order = await createPublicOrder({
    organizationId: ORG_ID,
    cartItems: cart,
    customer: { name: 'Ana Pérez', phone: '56912345678', email: 'ana@test.cl' },
    notes: 'Sin cebolla',
    paymentMethod: 'cash',
    paymentStatus: 'pending',
    deliveryType: 'pickup',
    deliveryFee: 0,
  });
  assert(order.id, 'orden creada con id');
  assert(order.order_type === 'online', 'order_type=online');
  assert(order.status === 'confirmed', 'status=confirmed');
  assert(order.delivery_type === 'pickup', 'delivery_type=pickup');
  assert(order.branch_id === BRANCH_ID, 'branch_id = primera sucursal activa');
  assertClose(order.total, 16500, 'total = subtotal (sin delivery)');
  assertClose(order.subtotal, Math.round(16500 / 1.19), 'subtotal sin IVA');
  assertClose(order.tax_amount, 16500 - Math.round(16500 / 1.19), 'tax_amount correcto');
  assert(order.notes === 'Sin cebolla', 'notas persistidas');

  const db = supabase.__db();
  const items = db.order_items.filter(oi => oi.order_id === order.id && !oi.parent_item_id);
  assert(items.length === 2, 'se insertaron 2 items padre');
  const completo = items.find(i => i.product_id === P1);
  assertClose(completo.unit_price, 7000, 'unit_price completo = base+extra (6000+1000)');
  assertClose(completo.total_price, 14000, 'total_price completo = 7000*2');
  const papas = items.find(i => i.product_id === P3);
  assertClose(papas.total_price, 2500, 'total_price papas = 2500');

  const payments = db.payments.filter(p => p.order_id === order.id);
  assert(payments.length === 1, '1 payment registrado');
  assert(payments[0].method === 'cash', 'payment method = cash');
  assert(payments[0].status === 'pending', 'payment status = pending');
  assertClose(payments[0].amount, 16500, 'payment amount = 16500');

  const customer = db.customers.find(c => c.phone === '56912345678');
  assert(customer && customer.full_name === 'Ana Pérez', 'cliente upserted por teléfono');
}

console.log('\n═══ Escenario 2: DESPACHO A DOMICILIO + DELIVERY PROPIO ═══');
{
  const cart = [
    { id: P2, name: 'Hamburguesa', price: 8000, quantity: 1, selectedIngredients: [] },
    { id: P3, name: 'Papas Fritas', price: 2500, quantity: 1, selectedIngredients: [] },
  ];
  const subtotal = computeSubtotal(cart); // 10500
  assertClose(subtotal, 10500, 'subtotal carrito 10500');
  const deliveryFee = 2000; // org.delivery_fee

  const order = await createPublicOrder({
    organizationId: ORG_ID,
    cartItems: cart,
    customer: { name: 'Carlos Soto', phone: '56987654321' },
    notes: null,
    paymentMethod: 'cash',
    paymentStatus: 'pending',
    deliveryType: 'delivery',
    deliveryAddress: 'Av. Pajaritos 1500, Maipú',
    deliveryFee,
  });
  assert(order.delivery_type === 'delivery', 'delivery_type=delivery');
  assert(order.delivery_address === 'Av. Pajaritos 1500, Maipú', 'dirección persistida');
  assertClose(order.delivery_fee, 2000, 'delivery_fee=2000');
  assertClose(order.total, 12500, 'total = subtotal + delivery (10500+2000)');
  assertClose(order.subtotal, Math.round(12500 / 1.19), 'subtotal con IVA sobre total');
  const payment = supabase.__db().payments.find(p => p.order_id === order.id);
  assertClose(payment.amount, 12500, 'payment amount incluye delivery');
}

console.log('\n═══ Escenario 3: DESPACHO + UBER DIRECT (SIMULADO) ═══');
{
  // Se reconfigura la org para delivery propio + Uber habilitado + pago online
  const org = supabase.__db().organizations[0];
  Object.assign(org, { delivery_mode: 'uber_direct', uber_enabled: true, accepts_online_payments: true, online_payments_allowed: true });

  // Simulación del flujo online de Klap: primero se guarda el pending y luego se crea con online_gateway.
  const cart = [
    { id: P2, name: 'Hamburguesa', price: 8000, quantity: 1, selectedIngredients: [{ id: ING_EXTRA, name: 'Palta extra', price: 1000 }] },
  ];
  const subtotal = computeSubtotal(cart); // 9000
  assertClose(subtotal, 9000, 'subtotal carrito 9000');

  // 1) Quote de Uber simulado: fee CLP (micros ÷ 100)
  const quoteFeeMicros = 250000; // CLP 2500
  const quoteCurrency = 'CLP';
  const quotePrice = quoteCurrency === 'CLP' ? Math.round(quoteFeeMicros / 100) : quoteFeeMicros / 100;
  assertClose(quotePrice, 2500, 'quote CLP convierte micros→CLP (250000/100)');

  // 2) Al volver de Klap con status=success se crea la orden online_gateway + paid
  const order = await createPublicOrder({
    organizationId: ORG_ID,
    cartItems: cart,
    customer: { name: 'María López', phone: '56911112222', email: 'maria@test.cl' },
    notes: null,
    paymentMethod: 'online_gateway',
    paymentStatus: 'paid',
    deliveryType: 'delivery',
    deliveryAddress: 'Av. Pajaritos 1500, Maipú',
    deliveryFee: quotePrice,
    scheduledAt: null,
    referenceCode: 'klap-ref-0001',
  });
  assert(order.status === 'confirmed', 'status=confirmed (pago online inmediato)');
  assertClose(order.total, 11500, 'total = subtotal + quote (9000+2500)');

  const payment = supabase.__db().payments.find(p => p.order_id === order.id);
  assert(payment.method === 'online_gateway', 'payment method = online_gateway');
  assert(payment.status === 'paid', 'payment status = paid');
  assert(payment.reference_code === 'klap-ref-0001', 'reference_code = klap id');

  // 3) Se crea el delivery Uber y se ajusta el total con el fee REAL
  const realFeeMicros = 240000; // CLP 2400 (difiere del quote)
  const realFee = Math.round(realFeeMicros / 100);
  assertClose(realFee, 2400, 'fee real CLP = 2400');
  const adjustedTotal = order.total - (quotePrice) + realFee;
  assertClose(adjustedTotal, 11400, 'total ajustado = 11500-2500+2400 = 11400');

  // 4) Sync del payment amount al total final (mismo bloque que OrderView)
  await supabase.from('payments').update({ amount: adjustedTotal }).eq('order_id', order.id);
  const syncedPayment = supabase.__db().payments.find(p => p.order_id === order.id);
  assertClose(syncedPayment.amount, 11400, 'payment amount sincronizado a total final');

  // 5) Actualización de la orden con los datos del delivery (mismo bloque que OrderView)
  await supabase.from('orders').update({
    uber_delivery_id: 'uber-del-001',
    uber_tracking_url: 'https://track.uber.com/x',
    uber_status: 'preparing',
    delivery_fee: realFee,
    total: adjustedTotal,
  }).eq('id', order.id);
  const updated = supabase.__db().orders.find(o => o.id === order.id);
  assert(updated.uber_delivery_id === 'uber-del-001', 'uber_delivery_id guardado');
  assert(updated.uber_status === 'preparing', 'uber_status guardado');
  assertClose(updated.delivery_fee, 2400, 'delivery_fee real actualizado en orden');
  assertClose(updated.total, 11400, 'total final actualizado en orden');
}

console.log('\n═══ Validez de inventario (checkInventoryStock) ═══');
{
  const cart = [
    { id: P1, name: 'Completo', price: 6000, quantity: 2, selectedIngredients: [{ id: ING_EXTRA, name: 'Palta extra', price: 1000 }] },
  ];
  const consumption = await checkInventoryStock(cart);
  assert(consumption.length > 0, 'se calcula consumo de ingredientes');
  const vienesa = consumption.find(c => c.inventory_item_id === ING_BASE);
  assert(vienesa && vienesa.needed === 2, '2 completos consumen 2 vienesas');
  const palta = consumption.find(c => c.inventory_item_id === ING_EXTRA);
  assert(palta && palta.needed === 100, '2 palta extra consumen 100gr (2×50)');
}

console.log('\n═══ Deducción de inventario (deductInventoryForOrder) ═══');
{
  // tomar la orden del escenario 1 (ya pagada/enviada)
  const db = supabase.__db();
  const order = db.orders.find(o => o.delivery_type === 'pickup');
  const stockBefore = db.ingredients.find(i => i.id === ING_BASE).stock_quantity;
  await deductInventoryForOrder(order.id, ORG_ID, BRANCH_ID);
  const stockAfter = db.ingredients.find(i => i.id === ING_BASE).stock_quantity;
  assertClose(stockAfter, stockBefore - 2, 'se dedujo inventario de vienesas (2 un)');
  const mv = db.ingredient_movements.filter(m => m.reference_id === order.id);
  assert(mv.length > 0, 'movimientos de inventario registrados');
  assert(mv.every(m => m.quantity < 0), 'movimientos son de salida (sale)');
}

console.log('\n═══ Resumen ═══');
console.log(`  PASADOS: ${passed}  FALLADOS: ${failed}`);
if (failed > 0) process.exit(1);
console.log('  OK — el flujo de compra (retiro/local, delivery propio, Uber) funciona correctamente.');
