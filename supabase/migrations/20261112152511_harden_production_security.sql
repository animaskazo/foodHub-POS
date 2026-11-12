-- Internal sequence state must never be writable through the Data API.
alter table public.branch_order_sequences enable row level security;
revoke all on table public.branch_order_sequences from anon, authenticated;
grant all on table public.branch_order_sequences to service_role;

-- Generate order numbers inside the trigger's privileged context. Trigger
-- execution does not require exposing either helper as a public RPC.
create or replace function public.set_order_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next integer;
  v_prefix text;
begin
  case new.order_type::text
    when 'table' then v_prefix := 'local#';
    when 'pickup' then v_prefix := 'retiro#';
    when 'online' then v_prefix := 'online#';
    when 'whatsapp' then v_prefix := 'wsp#';
    else v_prefix := 'gen#';
  end case;

  insert into public.branch_order_sequences (branch_id, last_order_number)
  values (new.branch_id, 1)
  on conflict (branch_id)
  do update set last_order_number = public.branch_order_sequences.last_order_number + 1
  returning last_order_number into v_next;

  new.order_number := v_prefix || lpad(v_next::text, 4, '0');
  return new;
end;
$$;

revoke all on function public.set_order_number() from public, anon, authenticated;
revoke all on function public.get_next_order_number(uuid, public.order_type) from public, anon, authenticated;

-- Fix mutable search paths without changing the established behavior of
-- existing invoker functions.
alter function public.current_org_id() set search_path = public, pg_temp;
alter function public.generate_order_number(uuid) set search_path = public, pg_temp;
alter function public.decrement_inventory() set search_path = public, pg_temp;
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.is_super_admin() set search_path = public, pg_temp;
alter function public.get_next_order_number(uuid, public.order_type) set search_path = public, pg_temp;
alter function public.update_inventory_items_updated_at() set search_path = public, pg_temp;

-- This RPC is intentionally public for anonymous storefront analytics, but
-- all objects are schema-qualified to prevent search-path substitution.
create or replace function public.increment_store_visits(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.organizations
    where id = p_organization_id and is_active = true
  ) then
    return;
  end if;

  insert into public.store_visits (organization_id, date, visit_count)
  values (p_organization_id, current_date, 1)
  on conflict (organization_id, date)
  do update set
    visit_count = public.store_visits.visit_count + 1,
    updated_at = now();
end;
$$;

revoke all on function public.increment_store_visits(uuid) from public;
grant execute on function public.increment_store_visits(uuid) to anon, authenticated, service_role;
