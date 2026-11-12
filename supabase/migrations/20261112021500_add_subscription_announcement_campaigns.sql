create table public.subscription_announcement_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'partial_failed', 'failed')),
  total_recipients integer not null default 0 check (total_recipients >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  created_by uuid not null references auth.users(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscription_announcement_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.subscription_announcement_campaigns(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  organization_name text not null,
  user_id uuid references auth.users(id) on delete set null,
  recipient_name text not null,
  email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, email)
);

create index subscription_announcement_campaigns_created_at_idx
  on public.subscription_announcement_campaigns (created_at desc);
create index subscription_announcement_campaigns_created_by_idx
  on public.subscription_announcement_campaigns (created_by);
create index subscription_announcement_recipients_campaign_status_idx
  on public.subscription_announcement_recipients (campaign_id, status);
create index subscription_announcement_recipients_organization_idx
  on public.subscription_announcement_recipients (organization_id);
create index subscription_announcement_recipients_user_idx
  on public.subscription_announcement_recipients (user_id);

alter table public.subscription_announcement_campaigns enable row level security;
alter table public.subscription_announcement_recipients enable row level security;

revoke all on table public.subscription_announcement_campaigns from anon, authenticated;
revoke all on table public.subscription_announcement_recipients from anon, authenticated;
grant select on table public.subscription_announcement_campaigns to authenticated;
grant select on table public.subscription_announcement_recipients to authenticated;

create policy "Super admins read announcement campaigns"
  on public.subscription_announcement_campaigns for select
  to authenticated
  using (exists (
    select 1 from public.super_admins sa where sa.user_id = (select auth.uid())
  ));

create policy "Super admins read announcement recipients"
  on public.subscription_announcement_recipients for select
  to authenticated
  using (exists (
    select 1 from public.super_admins sa where sa.user_id = (select auth.uid())
  ));
