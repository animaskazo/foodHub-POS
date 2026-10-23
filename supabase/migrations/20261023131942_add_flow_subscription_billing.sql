create table if not exists public.organization_subscriptions (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  status text not null check (status in (
    'trialing', 'pending_card', 'pending_payment', 'active', 'past_due', 'cancelled', 'expired', 'legacy_active'
  )),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  flow_customer_id text,
  flow_subscription_id text,
  flow_registration_token text,
  flow_checkout_url text,
  flow_plan_id text,
  flow_plan_name text,
  flow_plan_amount integer,
  flow_plan_currency text,
  flow_plan_interval integer,
  flow_plan_interval_count integer,
  flow_card_type text,
  flow_card_last4 text,
  current_period_end timestamptz,
  last_invoice_id text,
  redirect_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organization_subscriptions_flow_subscription_idx
  on public.organization_subscriptions (flow_subscription_id)
  where flow_subscription_id is not null;
create unique index if not exists organization_subscriptions_registration_token_idx
  on public.organization_subscriptions (flow_registration_token)
  where flow_registration_token is not null;

alter table public.organization_subscriptions enable row level security;
revoke all on public.organization_subscriptions from anon, authenticated;
grant all on public.organization_subscriptions to service_role;
grant select (
  organization_id, status, trial_started_at, trial_ends_at, flow_plan_id, flow_plan_name,
  flow_plan_amount, flow_plan_currency, flow_plan_interval, flow_plan_interval_count,
  flow_card_type, flow_card_last4, current_period_end, last_invoice_id, created_at, updated_at
) on public.organization_subscriptions to authenticated;
drop policy if exists "Staff can read own organization subscription" on public.organization_subscriptions;
create policy "Staff can read own organization subscription"
  on public.organization_subscriptions for select to authenticated
  using (
    exists (
      select 1 from public.staff s
      where s.id = auth.uid() and s.organization_id = organization_subscriptions.organization_id
    )
    or exists (select 1 from public.super_admins sa where sa.user_id = auth.uid())
  );

-- Existing merchants keep their current access while new organizations receive a trial.
insert into public.organization_subscriptions (organization_id, status)
select o.id, 'legacy_active'
from public.organizations o
on conflict (organization_id) do nothing;

create or replace function public.create_organization_trial_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_subscriptions (
    organization_id, status, trial_started_at, trial_ends_at
  ) values (
    new.id, 'trialing', now(), now() + interval '15 days'
  ) on conflict (organization_id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_organization_trial_subscription() from public, anon, authenticated;
drop trigger if exists create_organization_trial_subscription on public.organizations;
create trigger create_organization_trial_subscription
  after insert on public.organizations
  for each row execute function public.create_organization_trial_subscription();

create or replace function public.set_organization_subscription_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_organization_subscriptions_updated_at on public.organization_subscriptions;
create trigger set_organization_subscriptions_updated_at
  before update on public.organization_subscriptions
  for each row execute function public.set_organization_subscription_updated_at();
