-- FoodHub multichannel inbox: customer-facing message history, staff visibility and human handoff.
-- Apply after 029_instagram_multichannel_foundation.sql.
create table if not exists public.channel_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null check (channel in ('instagram','whatsapp')),
  channel_account_id text not null,
  external_customer_id text not null,
  customer_display_name text,
  last_message_preview text,
  last_message_at timestamptz,
  unread_count integer not null default 0 check (unread_count >= 0),
  mode text not null default 'ai' check (mode in ('ai','human')),
  assigned_staff_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, channel, channel_account_id, external_customer_id),
  unique (id, organization_id)
);
create index if not exists channel_conversations_org_recent_idx
  on public.channel_conversations(organization_id,last_message_at desc nulls last);

create table if not exists public.channel_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  organization_id uuid not null,
  provider_message_id text,
  direction text not null check (direction in ('inbound','outbound')),
  sender_type text not null check (sender_type in ('customer','agent','staff','system')),
  message_type text not null default 'text' check (message_type in ('text','image','attachment','unsupported')),
  body text,
  delivery_status text not null default 'received'
    check (delivery_status in ('received','queued','sent','delivered','failed')),
  created_at timestamptz not null default now(),
  foreign key (conversation_id,organization_id)
    references public.channel_conversations(id,organization_id) on delete cascade,
  unique (conversation_id,provider_message_id)
);
create index if not exists channel_messages_conversation_recent_idx
  on public.channel_messages(conversation_id,created_at desc);

alter table public.channel_conversations enable row level security;
alter table public.channel_messages enable row level security;

-- Staff may read only their own organization's conversations.
create policy "staff_read_own_org_conversations"
  on public.channel_conversations for select to authenticated
  using (exists (
    select 1 from public.staff s
    where s.id = (select auth.uid())
      and s.organization_id = channel_conversations.organization_id
  ));
create policy "staff_read_own_org_messages"
  on public.channel_messages for select to authenticated
  using (exists (
    select 1 from public.staff s
    where s.id = (select auth.uid())
      and s.organization_id = channel_messages.organization_id
  ));
-- No browser INSERT/UPDATE/DELETE grants or policies.
-- Authenticated users cannot switch the AI/human mode directly;
-- use an authenticated Edge Function that verifies staff membership.
