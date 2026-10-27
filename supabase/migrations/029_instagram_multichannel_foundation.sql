-- Instagram / multi-channel foundation. No live webhooks or token storage activated.
create table if not exists public.instagram_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  instagram_user_id text not null unique,
  username text,
  encrypted_access_token text,
  token_expires_at timestamptz,
  status text not null default 'pending' check (status in ('pending','connected','expired','disconnected','error')),
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists instagram_connections_org_idx on public.instagram_connections(organization_id);
alter table public.instagram_connections enable row level security;
-- Intentionally no client RLS policies: connection credentials are server-only.

create table if not exists public.channel_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','instagram')),
  channel_account_id text not null,
  external_customer_id text not null,
  session_data jsonb not null default '{}'::jsonb,
  automation_paused_at timestamptz,
  last_inbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, channel, channel_account_id, external_customer_id)
);
create index if not exists channel_sessions_org_updated_idx on public.channel_sessions(organization_id,updated_at desc);
alter table public.channel_sessions enable row level security;
-- Service-role only until audited staff-scoped RLS policies are added.

create table if not exists public.channel_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','instagram')),
  provider_event_id text not null,
  event_type text not null,
  status text not null default 'received' check (status in ('received','processing','processed','failed','ignored')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(channel,provider_event_id)
);
create index if not exists channel_events_org_created_idx on public.channel_events(organization_id,created_at desc);
alter table public.channel_events enable row level security;
-- Never store raw OAuth tokens in event payloads.
