create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

alter table public.organization_subscriptions
  add column if not exists last_payment_at timestamptz,
  add column if not exists last_flow_sync_at timestamptz,
  add column if not exists flow_status integer,
  add column if not exists flow_morose boolean,
  add column if not exists payment_failure_reason text,
  add column if not exists flow_registration_token_hash text;

create unique index if not exists organization_subscriptions_registration_token_hash_idx
  on public.organization_subscriptions (flow_registration_token_hash)
  where flow_registration_token_hash is not null;

grant select (
  last_payment_at, last_flow_sync_at, flow_status, flow_morose, payment_failure_reason
) on public.organization_subscriptions to authenticated;

create table if not exists public.subscription_payment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  flow_subscription_id text not null,
  flow_order bigint,
  commerce_order text not null,
  token_hash text,
  flow_status integer not null,
  amount numeric(14,2),
  currency text,
  paid_at timestamptz,
  source text not null check (source in ('callback', 'reconciliation')),
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  unique (flow_order),
  unique (token_hash)
);

create table if not exists public.subscription_reconciliation_credentials (
  id boolean primary key default true check (id),
  secret text not null,
  created_at timestamptz not null default now()
);
alter table public.subscription_reconciliation_credentials enable row level security;
revoke all on public.subscription_reconciliation_credentials from public, anon, authenticated;
grant all on public.subscription_reconciliation_credentials to service_role;
insert into public.subscription_reconciliation_credentials (id, secret)
values (true, encode(gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;

create index if not exists subscription_payment_events_org_received_idx
  on public.subscription_payment_events (organization_id, received_at desc);
create index if not exists subscription_payment_events_subscription_idx
  on public.subscription_payment_events (flow_subscription_id, received_at desc);

alter table public.subscription_payment_events enable row level security;
revoke all on public.subscription_payment_events from anon, authenticated;
grant all on public.subscription_payment_events to service_role;
grant select (
  id, organization_id, flow_subscription_id, flow_order, commerce_order,
  flow_status, amount, currency, paid_at, source, received_at
) on public.subscription_payment_events to authenticated;

create policy "Staff can read own subscription payments"
  on public.subscription_payment_events for select to authenticated
  using (
    exists (
      select 1 from public.staff s
      where s.id = (select auth.uid())
        and s.organization_id = subscription_payment_events.organization_id
    )
    or exists (
      select 1 from public.super_admins sa
      where sa.user_id = (select auth.uid())
    )
  );

-- Flow documents commerceOrder for recurring charges as
-- <subscriptionId><invoiceId><invoiceDate>. Matching the longest known
-- subscription prefix makes the callback deterministic without trusting input.
create or replace function public.record_flow_subscription_payment(
  p_token_hash text,
  p_flow_order bigint,
  p_commerce_order text,
  p_flow_status integer,
  p_amount numeric,
  p_currency text,
  p_paid_at timestamptz,
  p_source text,
  p_payload jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_subscription public.organization_subscriptions%rowtype;
  v_event_id uuid;
  v_period_end timestamptz;
begin
  if p_source not in ('callback', 'reconciliation') then
    raise exception 'Invalid payment event source';
  end if;

  select s.* into v_subscription
  from public.organization_subscriptions s
  where s.flow_subscription_id is not null
    and p_commerce_order like s.flow_subscription_id || '%'
  order by length(s.flow_subscription_id) desc
  limit 1
  for update;

  if not found then
    raise exception 'Unknown Flow subscription for commerceOrder %', p_commerce_order;
  end if;

  insert into public.subscription_payment_events (
    organization_id, flow_subscription_id, flow_order, commerce_order,
    token_hash, flow_status, amount, currency, paid_at, source, payload
  ) values (
    v_subscription.organization_id, v_subscription.flow_subscription_id,
    p_flow_order, p_commerce_order, p_token_hash, p_flow_status,
    p_amount, p_currency, p_paid_at, p_source, coalesce(p_payload, '{}'::jsonb)
  )
  on conflict do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select e.id into v_event_id
    from public.subscription_payment_events e
    where (p_flow_order is not null and e.flow_order = p_flow_order)
       or (p_token_hash is not null and e.token_hash = p_token_hash)
    order by e.received_at desc
    limit 1;
    return v_event_id;
  end if;

  if p_flow_status = 2 then
    v_period_end := case coalesce(v_subscription.flow_plan_interval, 3)
      when 1 then coalesce(p_paid_at, now()) + make_interval(days => coalesce(v_subscription.flow_plan_interval_count, 1))
      when 2 then coalesce(p_paid_at, now()) + make_interval(weeks => coalesce(v_subscription.flow_plan_interval_count, 1))
      when 4 then coalesce(p_paid_at, now()) + make_interval(years => coalesce(v_subscription.flow_plan_interval_count, 1))
      else coalesce(p_paid_at, now()) + make_interval(months => coalesce(v_subscription.flow_plan_interval_count, 1))
    end;

    update public.organization_subscriptions
    set status = 'active',
        last_payment_at = coalesce(p_paid_at, now()),
        current_period_end = greatest(coalesce(current_period_end, '-infinity'::timestamptz), v_period_end),
        last_invoice_id = p_commerce_order,
        flow_status = p_flow_status,
        flow_morose = false,
        payment_failure_reason = null,
        last_flow_sync_at = now(),
        free_access = false,
        free_access_starts_at = null,
        free_access_ends_at = null,
        free_access_granted_by = null,
        free_access_note = null
    where organization_id = v_subscription.organization_id;
  else
    update public.organization_subscriptions
    set flow_status = p_flow_status,
        last_flow_sync_at = now()
    where organization_id = v_subscription.organization_id;
  end if;

  return v_event_id;
end;
$$;

revoke all on function public.record_flow_subscription_payment(text,bigint,text,integer,numeric,text,timestamptz,text,jsonb) from public, anon, authenticated;
grant execute on function public.record_flow_subscription_payment(text,bigint,text,integer,numeric,text,timestamptz,text,jsonb) to service_role;

-- The callback must remain the primary source, while this periodic job repairs
-- missed callbacks and synchronizes cancelled or delinquent subscriptions.
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net')
  then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'reconcile-flow-subscriptions';

    perform cron.schedule(
      'reconcile-flow-subscriptions',
      '17 * * * *',
      $job$
      select net.http_post(
        url := 'https://fgvhbniauzjvzeuespmf.supabase.co/functions/v1/reconcile-flow-subscriptions',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-reconciliation-key', (select secret from public.subscription_reconciliation_credentials where id limit 1)
        ),
        body := '{"source":"cron"}'::jsonb,
        timeout_milliseconds := 55000
      );
      $job$
    );
  end if;
end $do$;
