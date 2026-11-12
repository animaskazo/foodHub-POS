alter table public.organization_subscriptions
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists cancellation_requested_at timestamptz,
  add column if not exists cancellation_effective_at timestamptz,
  add column if not exists cancellation_requested_by uuid references auth.users(id) on delete set null;

grant select (
  cancel_at_period_end, cancellation_requested_at, cancellation_effective_at
) on public.organization_subscriptions to authenticated;

create table if not exists public.subscription_cancellation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  flow_subscription_id text not null,
  mode text not null check (mode in ('period_end', 'immediate')),
  effective_at timestamptz,
  requested_by uuid references auth.users(id) on delete set null,
  flow_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists subscription_cancellation_events_org_created_idx
  on public.subscription_cancellation_events (organization_id, created_at desc);

alter table public.subscription_cancellation_events enable row level security;
revoke all on public.subscription_cancellation_events from anon, authenticated;
grant all on public.subscription_cancellation_events to service_role;
grant select (id, organization_id, mode, effective_at, created_at)
  on public.subscription_cancellation_events to authenticated;

create policy "Staff can read own subscription cancellations"
  on public.subscription_cancellation_events for select to authenticated
  using (
    exists (
      select 1 from public.staff s
      where s.id = (select auth.uid())
        and s.organization_id = subscription_cancellation_events.organization_id
    )
    or exists (
      select 1 from public.super_admins sa
      where sa.user_id = (select auth.uid())
    )
  );
