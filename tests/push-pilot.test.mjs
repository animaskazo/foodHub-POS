import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { sendOnce, notification, getReceipts } from '../supabase/functions/new-order-push/core.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = id(1), otherOrg = id(2), user = id(3), otherUser = id(4), session = id(5), otherSession = id(6), device = id(7), branch = id(8), otherBranch = id(9);
const job = { token: 'ExpoPushToken[test]', order_id: id(10), organization_id: org };

test('Expo payload has no customer information; one attempt even on ambiguous failure', async () => {
  assert.deepEqual(notification(job).data, { type: 'new_order', orderId: id(10), organizationId: org });
  let calls = 0;
  const result = await sendOnce(job, 'secret', async () => { calls++; throw new Error('timeout'); });
  assert.equal(calls, 1);
  assert.equal(result.status, 'unknown');
  const ok = await sendOnce(job, 'secret', async (_url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer secret');
    return Response.json({ data: { status: 'ok', id: 'ticket' } });
  });
  assert.deepEqual(ok, { status: 'accepted', ticket_id: 'ticket' });
  const gone = await sendOnce(job, 'secret', async () => Response.json({ data: { status: 'error', details: { error: 'DeviceNotRegistered' } } }));
  assert.equal(gone.error_code, 'DeviceNotRegistered');
  assert.equal((await sendOnce(job, 'secret', async () => new Response('', { status: 503 }))).status, 'unknown');
  assert.equal((await sendOnce(job, 'secret', async () => Response.json({}))).status, 'unknown');
  const receipts = await getReceipts(['ticket'], 'secret', async () => Response.json({ data: { ticket: { status: 'ok' } } }));
  assert.equal(receipts.ticket.status, 'ok');
});

test('PostgreSQL migration: authorization, isolation, insert-only, kill switch, claims, session revocation', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key);
      create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id), not_after timestamptz);
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema auth to authenticated;
      create table public.organizations(id uuid primary key);
      create table public.branches(id uuid primary key, organization_id uuid);
      create table public.orders(id uuid primary key, organization_id uuid, branch_id uuid, status text);
      create table public.order_items(id uuid primary key, order_id uuid, product_name text);
      create table public.order_item_variants(id uuid, order_item_id uuid);
      create table public.order_item_ingredients(id uuid, order_item_id uuid);
      create table public.payments(id uuid, order_id uuid);
      insert into auth.users values('${user}'),('${otherUser}');
      insert into auth.sessions(id,user_id) values('${session}','${user}'),('${otherSession}','${otherUser}');
      insert into organizations values('${org}'),('${otherOrg}');
      insert into branches values('${branch}','${org}'),('${otherBranch}','${otherOrg}');
      insert into orders values('${id(10)}','${org}','${branch}','pending');
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/20261101230534_new_order_push_pilot.sql', import.meta.url), 'utf8'));
    const count = async () => Number((await db.query('select count(*) as n from push_deliveries')).rows[0].n);
    async function asUser(uid, sid, sql, args = []) {
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: uid, session_id: sid })]);
      try { return await db.query(sql, args); }
      finally { await db.exec('reset role'); }
    }
    const register = (uid = user, sid = session, dev = device, token = 'ExpoPushToken[test]') =>
      asUser(uid, sid, 'select register_push_device($1,$2,$3,$4)', [dev, token, 'ios', id(100)]);
    assert.equal(await count(), 0, 'no backfill');
    await assert.rejects(register(), /Not enrolled/);
    await db.exec(`insert into push_pilot_businesses values('${org}','${id(100)}',false),('${otherOrg}','${id(100)}',true);
      insert into push_pilot_members values('${user}','${org}',true),('${otherUser}','${otherOrg}',true);`);
    await register();
    await assert.rejects(asUser(user, session, 'select * from push_devices'), /permission denied/);
    await assert.rejects(asUser(user, session, 'update push_pilot_members set organization_id = $1', [otherOrg]), /permission denied/);
    await assert.rejects(asUser(user, session, 'select claim_push_deliveries()'), /permission denied/);
    await assert.rejects(register(otherUser, otherSession), /another account/);
    await assert.rejects(register(otherUser, otherSession, id(11)), /unique constraint/);
    await assert.rejects(register(user, id(999)), /Active session/);
    await db.exec(`update auth.sessions set not_after=now()-interval '1 second' where id='${session}'`);
    await assert.rejects(register(), /Active session/);
    await db.exec(`update auth.sessions set not_after=null where id='${session}'`);
    await assert.rejects(register(user, session, device, 'invalid-token'), /check constraint/);
    await db.exec(`insert into orders values('${id(12)}','${org}','${branch}','pending')`);
    assert.equal(await count(), 0, 'business disabled');
    await db.exec(`update push_pilot_businesses set enabled=true where organization_id='${org}';
      insert into orders values('${id(13)}','${otherOrg}','${otherBranch}','pending');
      insert into orders values('${id(14)}','${org}','${otherBranch}','pending');`);
    assert.equal(await count(), 0, 'no cross-business or mismatched branch');
    await db.exec(`insert into orders values('${id(15)}','${org}','${branch}','pending')`);
    assert.equal(await count(), 1);
    await db.exec(`update orders set status='ready' where id='${id(15)}'`);
    assert.equal(await count(), 1, 'UPDATE never enqueues');
    assert.equal((await asUser(otherUser, otherSession, 'select push_order_detail($1) as detail', [id(15)])).rows[0].detail, null);
    assert.equal((await asUser(user, session, 'select push_order_detail($1) as detail', [id(15)])).rows[0].detail.id, id(15));
    await db.exec("update push_deliveries set created_at=now()-interval '10 seconds'");
    await db.exec(`update push_pilot_members set enabled=false where user_id='${user}'`);
    assert.equal((await db.query('select * from claim_push_deliveries()')).rows.length, 0, 'revoked membership cannot send');
    await db.exec(`update push_pilot_members set enabled=true where user_id='${user}'`);
    await db.exec(`update push_devices set expires_at=now()-interval '1 second'`);
    assert.equal((await db.query('select * from claim_push_deliveries()')).rows.length, 0, 'expired device cannot send');
    await register();
    await db.exec('set role service_role');
    const claimed = (await db.query('select * from claim_push_deliveries()')).rows;
    await db.exec('reset role');
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].token, job.token);
    assert.equal((await db.query('select * from claim_push_deliveries()')).rows.length, 0, 'repeat invocation cannot send twice');
    assert.equal((await db.query('select push_delivery_authorized($1) as ok', [claimed[0].delivery_id])).rows[0].ok, true);
    await db.exec(`delete from auth.sessions where id='${session}'; insert into orders values('${id(16)}','${org}','${branch}','pending')`);
    assert.equal(await count(), 1, 'signed-out session cannot enqueue');
    assert.equal((await db.query('select push_delivery_authorized($1) as ok', [claimed[0].delivery_id])).rows[0].ok, false);
    assert.equal((await asUser(user, session, 'select push_order_detail($1) as detail', [id(15)])).rows[0].detail, null, 'revoked session cannot open detail');
    await asUser(user, session, 'select unregister_push_device($1)', [device]);
    assert.equal((await db.query('select * from push_devices')).rows.length, 0);
    await db.exec('set role anon');
    try { await assert.rejects(db.query('select push_pilot_info()'), /permission denied/); }
    finally { await db.exec('reset role'); }
  } finally { await db.close(); }
});
