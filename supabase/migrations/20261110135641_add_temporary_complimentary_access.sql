-- Time-bounded complimentary access remains separate from the underlying
-- trial/Flow billing status. Access is evaluated from these timestamps at
-- read time, so expiration never depends on a scheduled job.
alter table public.organization_subscriptions
  add column if not exists free_access_starts_at timestamptz,
  add column if not exists free_access_ends_at timestamptz,
  add column if not exists free_access_granted_by uuid references auth.users(id) on delete set null,
  add column if not exists free_access_note text;

update public.organization_subscriptions
set free_access_starts_at = coalesce(free_access_starts_at, updated_at, created_at, now())
where free_access and free_access_starts_at is null;

alter table public.organization_subscriptions
  drop constraint if exists free_access_dates_are_valid;
alter table public.organization_subscriptions
  add constraint free_access_dates_are_valid check (
    not free_access or (
      free_access_starts_at is not null
      and (free_access_ends_at is null or free_access_ends_at > free_access_starts_at)
    )
  );

alter table public.organization_subscriptions
  drop constraint if exists free_access_note_length;
alter table public.organization_subscriptions
  add constraint free_access_note_length check (
    free_access_note is null or char_length(free_access_note) <= 500
  );

create index if not exists organization_subscriptions_free_access_granted_by_idx
  on public.organization_subscriptions (free_access_granted_by)
  where free_access_granted_by is not null;

create table if not exists public.complimentary_access_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action text not null check (action in ('grant', 'extend', 'revoke')),
  starts_at timestamptz,
  ends_at timestamptz,
  note text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint complimentary_access_events_dates_valid check (
    starts_at is null or ends_at is null or ends_at > starts_at
  ),
  constraint complimentary_access_events_note_length check (
    note is null or char_length(note) <= 500
  )
);

create index if not exists complimentary_access_events_organization_created_idx
  on public.complimentary_access_events (organization_id, created_at desc);
create index if not exists complimentary_access_events_actor_idx
  on public.complimentary_access_events (actor_id)
  where actor_id is not null;

alter table public.complimentary_access_events enable row level security;
revoke all on public.complimentary_access_events from anon, authenticated;
grant all on public.complimentary_access_events to service_role;
grant select on public.complimentary_access_events to authenticated;

drop policy if exists "Super admins read complimentary access history" on public.complimentary_access_events;
create policy "Super admins read complimentary access history"
  on public.complimentary_access_events for select to authenticated
  using (
    exists (
      select 1 from public.super_admins sa
      where sa.user_id = (select auth.uid())
    )
  );

-- Complimentary mutations go through the authenticated Edge Function. The
-- function is invoker-security and executable only by service_role, keeping
-- the state change and its audit event in one transaction.
create or replace function public.manage_complimentary_access(
  p_organization_id uuid,
  p_action text,
  p_ends_at timestamptz,
  p_note text,
  p_actor_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_subscription public.organization_subscriptions%rowtype;
  v_event_action text;
  v_starts_at timestamptz;
  v_previous_start timestamptz;
  v_previous_end timestamptz;
  v_previous_note text;
begin
  if p_action not in ('grant', 'revoke') then
    raise exception 'Acción de cortesía inválida.' using errcode = '22023';
  end if;
  if p_actor_id is null then
    raise exception 'No se pudo identificar al superadministrador.' using errcode = '22023';
  end if;
  if p_note is not null and char_length(trim(p_note)) > 500 then
    raise exception 'La nota no puede superar 500 caracteres.' using errcode = '22023';
  end if;

  select * into v_subscription
  from public.organization_subscriptions
  where organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'No existe la suscripción del negocio.' using errcode = 'P0002';
  end if;

  if p_action = 'grant' then
    if v_subscription.status in ('active', 'pending_card', 'pending_payment', 'past_due') then
      raise exception 'Primero debe resolverse o cancelarse la suscripción de Flow del negocio.' using errcode = '23514';
    end if;
    if p_ends_at is null or p_ends_at <= now() then
      raise exception 'La fecha de vencimiento debe estar en el futuro.' using errcode = '22023';
    end if;
    if v_subscription.free_access
      and (v_subscription.free_access_ends_at is null or v_subscription.free_access_ends_at > now())
      and v_subscription.free_access_ends_at is not null
      and p_ends_at <= v_subscription.free_access_ends_at then
      raise exception 'La nueva fecha debe extender la cortesía vigente.' using errcode = '22023';
    end if;

    v_event_action := case
      when v_subscription.free_access
        and (v_subscription.free_access_ends_at is null or v_subscription.free_access_ends_at > now())
      then 'extend'
      else 'grant'
    end;
    v_starts_at := case
      when v_event_action = 'extend' then v_subscription.free_access_starts_at
      else now()
    end;

    update public.organization_subscriptions
    set free_access = true,
        free_access_starts_at = v_starts_at,
        free_access_ends_at = p_ends_at,
        free_access_granted_by = p_actor_id,
        free_access_note = nullif(trim(p_note), '')
    where organization_id = p_organization_id;

    insert into public.complimentary_access_events (
      organization_id, action, starts_at, ends_at, note, actor_id
    ) values (
      p_organization_id, v_event_action, v_starts_at, p_ends_at,
      nullif(trim(p_note), ''), p_actor_id
    );
  else
    if not v_subscription.free_access then
      raise exception 'El negocio no tiene una cortesía para revocar.' using errcode = '22023';
    end if;

    v_previous_start := v_subscription.free_access_starts_at;
    v_previous_end := v_subscription.free_access_ends_at;
    v_previous_note := v_subscription.free_access_note;

    update public.organization_subscriptions
    set free_access = false,
        free_access_starts_at = null,
        free_access_ends_at = null,
        free_access_granted_by = null,
        free_access_note = null
    where organization_id = p_organization_id;

    insert into public.complimentary_access_events (
      organization_id, action, starts_at, ends_at, note, actor_id
    ) values (
      p_organization_id, 'revoke', v_previous_start, v_previous_end,
      coalesce(nullif(trim(p_note), ''), v_previous_note), p_actor_id
    );
  end if;
end;
$$;

revoke all on function public.manage_complimentary_access(uuid, text, timestamptz, text, uuid)
  from public, anon, authenticated;
grant execute on function public.manage_complimentary_access(uuid, text, timestamptz, text, uuid)
  to service_role;

-- Remove the previous direct browser mutation path. Reads remain available to
-- staff under the existing tenant-scoped SELECT policy.
drop policy if exists "Super admins manage free access" on public.organization_subscriptions;
revoke update (free_access) on public.organization_subscriptions from authenticated;
grant select (
  free_access_starts_at, free_access_ends_at, free_access_granted_by, free_access_note
) on public.organization_subscriptions to authenticated;
