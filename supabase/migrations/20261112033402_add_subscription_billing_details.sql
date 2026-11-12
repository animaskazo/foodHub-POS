alter table public.organization_subscriptions
  add column if not exists subscribed_at timestamptz,
  add column if not exists next_payment_at timestamptz,
  add column if not exists scheduled_plan_id text,
  add column if not exists scheduled_plan_name text,
  add column if not exists scheduled_plan_change_at timestamptz;

grant select (
  subscribed_at, next_payment_at, scheduled_plan_id,
  scheduled_plan_name, scheduled_plan_change_at
) on public.organization_subscriptions to authenticated;

create table if not exists public.subscription_plan_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  flow_subscription_id text not null,
  old_plan_id text not null,
  old_plan_name text,
  new_plan_id text not null,
  new_plan_name text not null,
  effective_at timestamptz not null,
  requested_by uuid references auth.users(id) on delete set null,
  status text not null default 'scheduled' check (status in ('scheduled', 'applied', 'cancelled', 'failed')),
  flow_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscription_plan_changes_org_created_idx
  on public.subscription_plan_changes (organization_id, created_at desc);

alter table public.subscription_plan_changes enable row level security;
revoke all on public.subscription_plan_changes from anon, authenticated;
grant all on public.subscription_plan_changes to service_role;
grant select (
  id, organization_id, old_plan_id, old_plan_name, new_plan_id,
  new_plan_name, effective_at, status, created_at, updated_at
) on public.subscription_plan_changes to authenticated;

create policy "Staff can read own subscription plan changes"
  on public.subscription_plan_changes for select to authenticated
  using (
    exists (
      select 1 from public.staff s
      where s.id = (select auth.uid())
        and s.organization_id = subscription_plan_changes.organization_id
    )
    or exists (
      select 1 from public.super_admins sa
      where sa.user_id = (select auth.uid())
    )
  );
