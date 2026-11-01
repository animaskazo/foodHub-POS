-- Opt-in pilot only. No existing orders are backfilled and no existing alert is changed.
create schema if not exists push_private;
revoke all on schema push_private from public, anon, authenticated;
grant usage on schema push_private to authenticated, service_role;

create table public.push_pilot_businesses (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  expo_project_id uuid not null,
  enabled boolean not null default false
);
-- Server-managed authorization: existing staff RLS is too permissive to trust.
create table public.push_pilot_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.push_pilot_businesses(organization_id) on delete cascade,
  enabled boolean not null default true
);
create table public.push_devices (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  organization_id uuid not null references public.push_pilot_businesses(organization_id) on delete cascade,
  expo_push_token text not null unique check (expo_push_token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'),
  platform text not null check (platform in ('ios', 'android')),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index push_devices_business on public.push_devices(organization_id);
create table public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  device_id uuid not null references public.push_devices(id) on delete cascade,
  organization_id uuid not null references public.push_pilot_businesses(organization_id) on delete cascade,
  created_at timestamptz not null default now(),
  expo_push_token text not null,
  status text not null default 'pending' check (status in ('pending','attempted','accepted','error','unknown','expired','delivered')),
  attempted_at timestamptz,
  ticket_id text,
  receipt_checked_at timestamptz,
  error_code text,
  unique (order_id, device_id)
);
create index push_deliveries_pending on public.push_deliveries(created_at) where status = 'pending';
create index push_deliveries_receipts on public.push_deliveries(attempted_at) where status = 'accepted';

alter table public.push_pilot_businesses enable row level security;
alter table public.push_pilot_members enable row level security;
alter table public.push_devices enable row level security;
alter table public.push_deliveries enable row level security;
revoke all on public.push_pilot_businesses, public.push_pilot_members, public.push_devices, public.push_deliveries from public, anon, authenticated;
grant all on public.push_pilot_businesses, public.push_pilot_members, public.push_devices, public.push_deliveries to service_role;

create function push_private.pilot_info() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('organization_id', m.organization_id, 'expo_project_id', b.expo_project_id)
  from public.push_pilot_members m join public.push_pilot_businesses b using (organization_id)
  where auth.uid() is not null and m.user_id = auth.uid() and m.enabled;
$$;

create function push_private.register_device(p_id uuid, p_token text, p_platform text, p_project_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_session uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_session := (auth.jwt()->>'session_id')::uuid;
  if not exists (select 1 from auth.sessions where id = v_session and user_id = auth.uid() and (not_after is null or not_after > now())) then
    raise exception 'Active session required';
  end if;
  select m.organization_id into v_org from public.push_pilot_members m
    join public.push_pilot_businesses b using (organization_id)
    where m.user_id = auth.uid() and m.enabled and b.expo_project_id = p_project_id;
  if v_org is null then raise exception 'Not enrolled in this push pilot'; end if;
  insert into public.push_devices(id,user_id,session_id,organization_id,expo_push_token,platform,expires_at)
    values(p_id,auth.uid(),v_session,v_org,p_token,p_platform,now() + interval '24 hours')
    on conflict (id) do update set session_id = excluded.session_id,
      organization_id = excluded.organization_id, expo_push_token = excluded.expo_push_token,
      platform = excluded.platform, expires_at = excluded.expires_at, updated_at = now()
    where public.push_devices.user_id = auth.uid()
    returning id into v_id;
  if v_id is null then raise exception 'Device belongs to another account'; end if;
  return v_id;
end;
$$;

create function push_private.unregister_device(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from public.push_devices where id = p_id and user_id = auth.uid();
end;
$$;

-- Do not use the existing permissive orders SELECT policy to authorize a tap.
create function push_private.order_detail(p_order_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(o) || jsonb_build_object(
    'order_items', coalesce((select jsonb_agg(to_jsonb(i) || jsonb_build_object(
      'order_item_variants', coalesce((select jsonb_agg(to_jsonb(v)) from public.order_item_variants v where v.order_item_id = i.id),'[]'::jsonb),
      'order_item_ingredients', coalesce((select jsonb_agg(to_jsonb(g)) from public.order_item_ingredients g where g.order_item_id = i.id),'[]'::jsonb)
    )) from public.order_items i where i.order_id = o.id),'[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(p)) from public.payments p where p.order_id = o.id),'[]'::jsonb)
  ) from public.orders o
  join public.push_pilot_members m on m.organization_id = o.organization_id
  where auth.uid() is not null and m.user_id = auth.uid() and m.enabled and o.id = p_order_id
    and exists (select 1 from auth.sessions s where s.id = (auth.jwt()->>'session_id')::uuid and s.user_id = auth.uid() and (s.not_after is null or s.not_after > now()));
$$;

revoke all on all functions in schema push_private from public, anon, authenticated;
grant execute on function push_private.pilot_info(), push_private.register_device(uuid,text,text,uuid),
  push_private.unregister_device(uuid), push_private.order_detail(uuid) to authenticated;

-- Thin invoker wrappers expose only the explicitly authorized operations.
create function public.push_pilot_info() returns jsonb language sql security invoker set search_path = '' as $$ select push_private.pilot_info(); $$;
create function public.register_push_device(p_id uuid, p_token text, p_platform text, p_project_id uuid) returns uuid
language sql security invoker set search_path = '' as $$ select push_private.register_device(p_id,p_token,p_platform,p_project_id); $$;
create function public.unregister_push_device(p_id uuid) returns void
language sql security invoker set search_path = '' as $$ select push_private.unregister_device(p_id); $$;
create function public.push_order_detail(p_order_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select push_private.order_detail(p_order_id); $$;
revoke all on function public.push_pilot_info(), public.register_push_device(uuid,text,text,uuid),
  public.unregister_push_device(uuid), public.push_order_detail(uuid) from public, anon;
grant execute on function public.push_pilot_info(), public.register_push_device(uuid,text,text,uuid),
  public.unregister_push_device(uuid), public.push_order_detail(uuid) to authenticated;

create function push_private.enqueue_new_order() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- This function is trigger-only; it accepts neither client events nor old orders.
  insert into public.push_deliveries(order_id,device_id,organization_id,expo_push_token)
    select new.id,d.id,new.organization_id,d.expo_push_token from public.push_devices d
    join public.push_pilot_businesses b on b.organization_id = d.organization_id and b.enabled
    join public.push_pilot_members m on m.user_id = d.user_id and m.organization_id = d.organization_id and m.enabled
    join auth.sessions s on s.id = d.session_id and s.user_id = d.user_id and (s.not_after is null or s.not_after > now())
    where d.organization_id = new.organization_id and d.expires_at > now()
      and exists (select 1 from public.branches br where br.id = new.branch_id and br.organization_id = new.organization_id)
    on conflict (order_id,device_id) do nothing;
  return new;
exception when others then
  -- A pilot failure must not block checkout. No PII or tokens in the log.
  raise warning 'Push pilot enqueue failed (%)', SQLSTATE;
  return new;
end;
$$;
revoke all on function push_private.enqueue_new_order() from public, anon, authenticated;
create trigger push_pilot_new_order after insert on public.orders
for each row execute function push_private.enqueue_new_order();

-- Claim and commit BEFORE contacting Expo. A claimed attempt is never resent:
-- ambiguous network failures trade possible loss for avoiding duplicate sends.
create function public.claim_push_deliveries() returns table(delivery_id uuid, order_id uuid, organization_id uuid, token text)
language sql security invoker set search_path = '' as $$
  with candidates as (
    select q.id from public.push_deliveries q
    join public.push_devices d on d.id = q.device_id and d.organization_id = q.organization_id and d.expo_push_token = q.expo_push_token
    join public.push_pilot_businesses b on b.organization_id = q.organization_id and b.enabled
    join public.push_pilot_members m on m.user_id = d.user_id and m.organization_id = q.organization_id and m.enabled
    join auth.sessions s on s.id = d.session_id and s.user_id = d.user_id and (s.not_after is null or s.not_after > now())
    where q.status = 'pending' and q.created_at > now() - interval '5 minutes'
      and q.created_at < now() - interval '5 seconds' and d.expires_at > now()
    order by q.created_at limit 50 for update of q skip locked
  ), claimed as (
    update public.push_deliveries q set status = 'attempted', attempted_at = now()
    from candidates c where q.id = c.id returning q.*
  ) select q.id,q.order_id,q.organization_id,d.expo_push_token
    from claimed q join public.push_devices d on d.id = q.device_id;
$$;
revoke all on function public.claim_push_deliveries() from public, anon, authenticated;
grant execute on function public.claim_push_deliveries() to service_role;

-- Recheck immediately before HTTP, since a batch can outlive a logout/revocation.
create function public.push_delivery_authorized(p_delivery_id uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.push_deliveries q
    join public.push_devices d on d.id = q.device_id and d.organization_id = q.organization_id and d.expo_push_token = q.expo_push_token
    join public.push_pilot_businesses b on b.organization_id = q.organization_id and b.enabled
    join public.push_pilot_members m on m.user_id = d.user_id and m.organization_id = q.organization_id and m.enabled
    join auth.sessions s on s.id = d.session_id and s.user_id = d.user_id and (s.not_after is null or s.not_after > now())
    where q.id = p_delivery_id and q.status = 'attempted' and d.expires_at > now()
      and q.created_at > now() - interval '5 minutes'
  );
$$;
revoke all on function public.push_delivery_authorized(uuid) from public, anon, authenticated;
grant execute on function public.push_delivery_authorized(uuid) to service_role;
-- service_role needs only session identity for the invoker worker RPCs.
grant usage on schema auth to service_role;
grant select (id,user_id,not_after) on auth.sessions to service_role;
