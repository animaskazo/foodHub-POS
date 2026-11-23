import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getStoreAvailability } from '../supabase/functions/_shared/storeAvailability.ts';

const hours = { mon:{open:'12:00',close:'22:00'}, tue:{open:'12:00',close:'22:00'}, wed:{open:'12:00',close:'22:00'},
  thu:{open:'12:00',close:'22:00'}, fri:{open:'12:00',close:'01:00'}, sat:{open:'12:00',close:'23:00'}, sun:{closed:true} };
// 2026-11-24 es martes. Santiago en verano = UTC-3.
const at = (iso) => new Date(iso);
const base = { business_hours: hours, timezone: 'America/Santiago' };

test('abierta dentro de horario (martes 15:00 Chile = 18:00 UTC)', () => {
  assert.equal(getStoreAvailability(base, at('2026-11-24T18:00:00Z')).open, true);
});
test('CASO DEL BUG: cerrada manualmente gana sobre el horario', () => {
  const r = getStoreAvailability({ ...base, force_closed: true, closed_message: 'Cerrado por inventario' }, at('2026-11-24T18:00:00Z'));
  assert.equal(r.open, false); assert.equal(r.reason, 'force_closed'); assert.equal(r.message, 'Tienda cerrada - Cerrado por inventario');
});
test('force_closed sin mensaje usa texto por defecto', () => {
  const r = getStoreAvailability({ ...base, force_closed: true }, at('2026-11-24T18:00:00Z'));
  assert.match(r.message, /^Tienda cerrada - /);
});
test('pedidos inmediatos desactivados', () => {
  assert.equal(getStoreAvailability({ ...base, instant_enabled: false }, at('2026-11-24T18:00:00Z')).reason, 'instant_disabled');
});
test('usa hora de Chile, no UTC: martes 23:30 Chile (02:30 UTC miércoles) está cerrada', () => {
  const r = getStoreAvailability(base, at('2026-11-25T02:30:00Z'));
  assert.equal(r.open, false); assert.equal(r.reason, 'outside_hours');
  assert.match(r.message, /mañana a las 12:00/);
});
test('antes de abrir: martes 10:00 Chile → "hoy a las 12:00"', () => {
  assert.match(getStoreAvailability(base, at('2026-11-24T13:00:00Z')).message, /hoy a las 12:00/);
});
test('domingo cerrado → próxima apertura lunes', () => {
  // 2026-11-29 domingo 15:00 Chile
  const r = getStoreAvailability(base, at('2026-11-29T18:00:00Z'));
  assert.equal(r.open, false); assert.match(r.message, /mañana a las 12:00/);
});
test('cruce de medianoche: viernes 23:30 Chile abierta (cierra 01:00)', () => {
  assert.equal(getStoreAvailability(base, at('2026-11-28T02:30:00Z')).open, true);
});
test('sin horarios configurados → abierta (igual que la web)', () => {
  assert.equal(getStoreAvailability({ timezone: 'America/Santiago' }, at('2026-11-24T18:00:00Z')).open, true);
});
test('business_hours como string JSON', () => {
  assert.equal(getStoreAvailability({ business_hours: JSON.stringify(hours) }, at('2026-11-24T18:00:00Z')).open, true);
});
