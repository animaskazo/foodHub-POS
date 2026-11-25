import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { normalizeRut, validateSiiProfile, calculateSimulation, validateEmissionPolicy, decideReceiptEmission } from '../src/utils/sii.js';

test('RUT normalization verifies check digits, including K and zero', () => {
  assert.equal(normalizeRut('12.345.678-5'), '12345678-5');
  assert.equal(normalizeRut(' 6.000.000-k '), '6000000-K');
  assert.equal(normalizeRut('10.000.004-0'), '10000004-0');
  for (const value of ['', null, '12.345.678-9', '<rut>', '00000000-0']) assert.equal(normalizeRut(value), '');
});

test('profile validation only returns approved tax fields', () => {
  const profile = validateSiiProfile({ rut: '12.345.678-5', legal_name: ' Local ', business_activity: 'Comidas', address: 'Calle 1', commune: 'Santiago', certificate: 'never-store-here', environment: 'production' });
  assert.deepEqual(Object.keys(profile), ['rut', 'legal_name', 'business_activity', 'address', 'commune', 'emission_channels', 'emission_model', 'terminal_document', 'online_document']);
  assert.equal(profile.legal_name, 'Local');
  assert.throws(() => validateSiiProfile({ ...profile, rut: '12345678-9' }));
  assert.throws(() => validateSiiProfile({ ...profile, commune: ' ' }));
});

test('emission policy validates channels and defaults to unconfirmed without automatic channels', () => {
  assert.deepEqual(validateEmissionPolicy({}), { emission_channels: [], emission_model: 'unconfirmed', terminal_document: 'unconfirmed', online_document: 'unconfirmed' });
  assert.deepEqual(validateEmissionPolicy({ emission_channels: ['online', 'pos', 'online'] }).emission_channels, ['online', 'pos']);
  for (const value of [{ emission_channels: ['delivery'] }, { emission_channels: 'online' }, { emission_model: 'enabled' }, { terminal_document: 'yes' }, { online_document: 'yes' }]) {
    assert.throws(() => validateEmissionPolicy(value));
  }
});

const configuredPolicy = { emission_channels: ['pos', 'online', 'whatsapp'], emission_model: 'voucher_replaces_receipt', terminal_document: 'voucher', online_document: 'foodhub' };
const paidOrder = (order_type = 'online', method = 'online_gateway') => ({ order_type, status: 'confirmed', total: 10000, payments: [{ method, status: 'paid', amount: 10000 }] });

test('paid online orders emit, terminal voucher sales skip and cash/transfer sales emit', () => {
  assert.equal(decideReceiptEmission(configuredPolicy, paidOrder()).action, 'emit');
  for (const type of ['pickup', 'table']) {
    assert.equal(decideReceiptEmission(configuredPolicy, paidOrder(type, 'card')).reason, 'voucher_covers_sale');
    for (const method of ['cash', 'transfer']) assert.equal(decideReceiptEmission(configuredPolicy, paidOrder(type, method)).action, 'emit');
  }
  assert.equal(decideReceiptEmission(configuredPolicy, paidOrder('whatsapp', 'transfer')).action, 'emit');
});

test('voucher coverage applies to online payments and always-receipt model overrides voucher skipping', () => {
  assert.equal(decideReceiptEmission({ ...configuredPolicy, online_document: 'voucher' }, paidOrder()).reason, 'voucher_covers_sale');
  assert.equal(decideReceiptEmission({ ...configuredPolicy, emission_model: 'always_receipt' }, paidOrder('pickup', 'card')).action, 'emit');
  assert.equal(decideReceiptEmission({ ...configuredPolicy, emission_model: 'unconfirmed' }, paidOrder()).action, 'review');
  assert.equal(decideReceiptEmission({ ...configuredPolicy, online_document: 'unconfirmed' }, paidOrder()).action, 'review');
  assert.equal(decideReceiptEmission({ ...configuredPolicy, emission_channels: ['online'] }, paidOrder('pickup', 'cash')).reason, 'channel_disabled');
});

test('unpaid, partially paid, cancelled, existing, unknown and refunded orders never trigger full receipt', () => {
  const order = paidOrder();
  assert.equal(decideReceiptEmission(configuredPolicy, { ...order, payments: [{ ...order.payments[0], status: 'pending' }] }).action, 'wait');
  assert.equal(decideReceiptEmission(configuredPolicy, { ...order, payments: [{ ...order.payments[0], amount: 5000 }] }).action, 'wait');
  assert.equal(decideReceiptEmission(configuredPolicy, { ...order, payments: [{ ...order.payments[0], status: 'completed' }] }).action, 'emit');
  assert.equal(decideReceiptEmission(configuredPolicy, { ...order, status: 'cancelled' }).action, 'skip');
  assert.equal(decideReceiptEmission(configuredPolicy, { ...order, existing_receipt_id: 'existing' }).reason, 'already_issued');
  for (const changed of [
    { order_type: 'unknown' }, { total: NaN }, { payments: [] },
    { payments: [{ method: 'mystery', status: 'paid', amount: 10000 }] },
    { payments: [{ method: 'cash', status: 'paid', amount: '10000' }] },
    { payments: [{ method: 'cash', status: 'paid', amount: 11000 }] },
    { payments: [{ method: 'online_gateway', status: 'refunded', amount: 10000 }] },
  ]) assert.notEqual(decideReceiptEmission(configuredPolicy, { ...order, ...changed }).action, 'emit');
});

test('mixed voucher and cash payments require review instead of a duplicate full-total receipt', () => {
  const order = { ...paidOrder('pickup', 'card'), payments: [
    { method: 'card', status: 'paid', amount: 6000 },
    { method: 'cash', status: 'paid', amount: 4000 },
  ] };
  assert.equal(decideReceiptEmission(configuredPolicy, order).reason, 'mixed_coverage');
  assert.equal(decideReceiptEmission({ ...configuredPolicy, emission_model: 'always_receipt' }, order).action, 'emit');
  assert.equal(decideReceiptEmission({ ...configuredPolicy, terminal_document: 'foodhub' }, order).action, 'emit');
});

test('simulation uses gross CLP prices and rejects invalid amounts', () => {
  assert.deepEqual(calculateSimulation([{ name: 'Comida', quantity: 2, unit_price: 5950 }]), { total: 11900, net: 10000, vat: 1900 });
  assert.deepEqual(calculateSimulation([{ name: 'Comida', quantity: 1, unit_price: 1000 }]), { total: 1000, net: 840, vat: 160 });
  for (const price of [0, -1, 10.5, NaN, Infinity, '1000']) {
    assert.throws(() => calculateSimulation([{ name: 'Comida', quantity: 1, unit_price: price }]));
  }
  assert.throws(() => calculateSimulation([]));
  assert.throws(() => calculateSimulation([{ name: 'Comida', quantity: 10000, unit_price: 100000000 }]));
});

test('database enforces tenant boundaries, server totals and retry identity', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const orgA = '00000000-0000-4000-8000-000000000001';
  const orgB = '00000000-0000-4000-8000-000000000002';
  const owner = '00000000-0000-4000-8000-000000000011';
  const other = '00000000-0000-4000-8000-000000000012';
  const cashier = '00000000-0000-4000-8000-000000000013';
  const inactive = '00000000-0000-4000-8000-000000000014';
  const request = '00000000-0000-4000-8000-000000000021';
  const items = [{ name: 'Comida', quantity: 2, unit_price: 5950 }];
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema public, auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    create table public.organizations (id uuid primary key, is_active boolean default true);
    create table public.staff (id uuid primary key references auth.users, organization_id uuid references public.organizations, role text, is_active boolean default true);
    create function public.set_updated_at() returns trigger language plpgsql as $$
      begin new.updated_at := now(); return new; end;
    $$;
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20261125120000_sii_simulation_foundation.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261125123000_sii_emission_policy.sql', import.meta.url), 'utf8'));
  await db.query('insert into organizations (id) values ($1), ($2)', [orgA, orgB]);
  for (const [id, org, role, active] of [[owner, orgA, 'owner', true], [other, orgB, 'admin', true], [cashier, orgA, 'cashier', true], [inactive, orgA, 'owner', false]]) {
    await db.query('insert into auth.users values ($1)', [id]);
    await db.query('insert into staff values ($1, $2, $3, $4)', [id, org, role, active]);
  }
  const asUser = async id => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await db.exec('set role authenticated');
  };
  const simulate = (org = orgA, payload = items, req = request) => db.query(
    'select * from public.simulate_sii_receipt($1, $2, $3::jsonb)', [org, req, JSON.stringify(payload)]);
  await asUser(owner);
  await assert.rejects(simulate(), /Guarda primero/);
  const insertProfile = (org, rut = '12345678-5', environment = 'certification') => db.query(`
    insert into sii_issuer_profiles (organization_id, rut, legal_name, business_activity, address, commune, environment)
    values ($1, $2, 'Local', 'Comidas', 'Calle 1', 'Santiago', $3)`, [org, rut, environment]);
  await assert.rejects(insertProfile(orgB), /row-level security/);
  await assert.rejects(insertProfile(orgA, '12345678-9'), /check constraint/);
  await assert.rejects(insertProfile(orgA, '12345678-5', 'production'), /check constraint/);
  await insertProfile(orgA);
  const defaultPolicy = (await db.query('select emission_channels, emission_model from sii_issuer_profiles')).rows[0];
  assert.deepEqual(defaultPolicy.emission_channels, []);
  assert.equal(defaultPolicy.emission_model, 'unconfirmed');
  await assert.rejects(db.query("update sii_issuer_profiles set emission_channels = array['unknown']"), /check constraint/);
  await assert.rejects(db.query("update sii_issuer_profiles set emission_channels = array[null]::text[]"), /check constraint/);
  await assert.rejects(db.query("update sii_issuer_profiles set emission_model = 'invalid'"), /check constraint/);
  await assert.rejects(db.query("update sii_issuer_profiles set terminal_document = 'invalid'"), /check constraint/);
  await db.query("update sii_issuer_profiles set emission_channels = array['pos', 'online'], emission_model = 'voucher_replaces_receipt', terminal_document = 'voucher', online_document = 'foodhub'");
  const first = (await simulate()).rows[0];
  assert.equal(Number(first.total), 11900);
  assert.equal(Number(first.net), 10000);
  assert.equal(Number(first.vat), 1900);
  assert.equal(first.status, 'simulated');
  assert.equal(first.environment, 'simulation');
  assert.equal('folio' in first, false);
  const retry = (await simulate()).rows[0];
  assert.equal(first.id, retry.id);
  await db.query("update sii_issuer_profiles set legal_name = 'Nuevo nombre' where organization_id = $1", [orgA]);
  assert.equal((await simulate()).rows[0].issuer_snapshot.legal_name, 'Local');
  await assert.rejects(simulate(orgA, [{ ...items[0], unit_price: 6000 }]), /otros productos/);
  assert.equal((await db.query('select * from sii_receipt_simulations')).rows.length, 1);
  await assert.rejects(db.query('delete from sii_receipt_simulations'), /permission denied/);
  await assert.rejects(db.query("update sii_receipt_simulations set status = 'accepted'"), /permission denied/);
  for (const payload of [[], null, {}, [{ name: 'A', quantity: -1, unit_price: 100 }], [{ name: 'A', quantity: 1.5, unit_price: 100 }], [{ name: 'A', quantity: 1, unit_price: '100' }], [{ name: 'A', quantity: 1 }], [{ name: 'A', quantity: 10000, unit_price: 100000000 }]]) {
    await assert.rejects(simulate(orgA, payload, crypto.randomUUID()));
  }
  // Browser calculations and SQL must agree at rounding boundaries.
  for (const unit_price of [1, 3, 19, 1000, 9999, 100000000]) {
    const payload = [{ name: 'A', quantity: 1, unit_price }];
    const result = (await simulate(orgA, payload, crypto.randomUUID())).rows[0];
    const expected = calculateSimulation(payload);
    for (const key of ['total', 'net', 'vat']) assert.equal(Number(result[key]), expected[key]);
  }
  for (const id of [other, cashier, inactive]) {
    await asUser(id);
    assert.equal((await db.query('select * from sii_issuer_profiles')).rows.length, 0);
    assert.equal((await db.query('select * from sii_receipt_simulations')).rows.length, 0);
    await assert.rejects(simulate(), /No tienes permiso/);
  }
  await db.exec('reset role; set role anon;');
  await assert.rejects(simulate(), /permission denied/);
  await assert.rejects(db.query('select * from sii_issuer_profiles'), /permission denied/);
});
