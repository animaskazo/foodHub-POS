create table if not exists public.subscription_admin_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action text not null check (action in ('cancel_incomplete')),
  previous_status text not null check (previous_status in ('pending_card', 'pending_payment')),
  flow_subscription_id text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists subscription_admin_events_organization_created_idx
  on public.subscription_admin_events (organization_id, created_at desc);
create index if not exists subscription_admin_events_actor_idx
  on public.subscription_admin_events (actor_id)
  where actor_id is not null;

alter table public.subscription_admin_events enable row level security;
revoke all on public.subscription_admin_events from anon, authenticated;
grant all on public.subscription_admin_events to service_role;
