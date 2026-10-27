-- Short-lived one-time OAuth state. Service-role access only.
create table if not exists public.instagram_oauth_states (
 state text primary key,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 initiated_by uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
alter table public.instagram_oauth_states enable row level security;
create index if not exists instagram_oauth_states_expires_idx on public.instagram_oauth_states(expires_at);
create unique index if not exists instagram_connections_org_unique_idx on public.instagram_connections(organization_id);
