-- Development foundation: no CAF, certificate, real folio or SII acceptance is stored here.
-- Real emission will use a separate server-only pipeline after certification.
begin;

create function public.sii_valid_rut(p_rut text)
returns boolean language plpgsql immutable strict set search_path = '' as $$
declare
  v_body text;
  v_sum integer := 0;
  v_factor integer := 2;
  v_check integer;
begin
  if p_rut !~ '^[0-9]{7,8}-[0-9K]$' then return false; end if;
  v_body := split_part(p_rut, '-', 1);
  if v_body::bigint = 0 then return false; end if;
  for i in reverse length(v_body)..1 loop
    v_sum := v_sum + substr(v_body, i, 1)::integer * v_factor;
    v_factor := case when v_factor = 7 then 2 else v_factor + 1 end;
  end loop;
  v_check := 11 - v_sum % 11;
  return right(p_rut, 1) = case v_check when 11 then '0' when 10 then 'K' else v_check::text end;
end;
$$;

create function public.sii_can_manage(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff s join public.organizations o on o.id = s.organization_id
    where s.id = auth.uid() and s.organization_id = p_organization_id
      and s.is_active = true and o.is_active = true
      and s.role::text in ('owner', 'admin', 'manager')
  );
$$;
revoke all on function public.sii_can_manage(uuid) from public, anon;
grant execute on function public.sii_can_manage(uuid) to authenticated;

create table public.sii_issuer_profiles (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  environment text not null default 'certification' check (environment = 'certification'),
  rut text not null check (public.sii_valid_rut(rut)),
  legal_name text not null check (length(btrim(legal_name)) between 1 and 100),
  business_activity text not null check (length(btrim(business_activity)) between 1 and 100),
  address text not null check (length(btrim(address)) between 1 and 100),
  commune text not null check (length(btrim(commune)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger sii_issuer_updated before update on public.sii_issuer_profiles
  for each row execute function public.set_updated_at();

alter table public.sii_issuer_profiles enable row level security;
revoke all on public.sii_issuer_profiles from anon, authenticated;
grant select, insert, update on public.sii_issuer_profiles to authenticated;
create policy sii_profile_read on public.sii_issuer_profiles for select to authenticated
  using (public.sii_can_manage(organization_id));
create policy sii_profile_insert on public.sii_issuer_profiles for insert to authenticated
  with check (public.sii_can_manage(organization_id));
create policy sii_profile_update on public.sii_issuer_profiles for update to authenticated
  using (public.sii_can_manage(organization_id)) with check (public.sii_can_manage(organization_id));

create table public.sii_receipt_simulations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null,
  environment text not null default 'simulation' check (environment = 'simulation'),
  status text not null default 'simulated' check (status = 'simulated'),
  document_type integer not null default 39 check (document_type = 39),
  issuer_snapshot jsonb not null,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  total bigint not null check (total between 1 and 1000000000),
  net bigint not null check (net > 0),
  vat bigint not null check (vat >= 0 and net + vat = total),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, request_id)
);
create index sii_simulations_org_date on public.sii_receipt_simulations (organization_id, created_at desc);
alter table public.sii_receipt_simulations enable row level security;
revoke all on public.sii_receipt_simulations from anon, authenticated;
grant select on public.sii_receipt_simulations to authenticated;
create policy sii_simulations_read on public.sii_receipt_simulations for select to authenticated
  using (public.sii_can_manage(organization_id));

create function public.simulate_sii_receipt(p_organization_id uuid, p_request_id uuid, p_items jsonb)
returns public.sii_receipt_simulations language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.sii_issuer_profiles;
  v_result public.sii_receipt_simulations;
  v_item jsonb;
  v_total numeric := 0;
  v_net bigint;
begin
  if auth.uid() is null or not public.sii_can_manage(p_organization_id) then
    raise exception 'No tienes permiso para gestionar boletas de este negocio.' using errcode = '42501';
  end if;
  if p_request_id is null or p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Solicitud de simulación inválida.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Agrega entre 1 y 50 productos.' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
      or jsonb_typeof(v_item->'name') is distinct from 'string'
      or length(btrim(v_item->>'name')) not between 1 and 80
      or jsonb_typeof(v_item->'quantity') is distinct from 'number'
      or jsonb_typeof(v_item->'unit_price') is distinct from 'number' then
      raise exception 'Producto inválido.' using errcode = '22023';
    end if;
    if (v_item->>'quantity')::numeric not between 1 and 10000
      or trunc((v_item->>'quantity')::numeric) <> (v_item->>'quantity')::numeric
      or (v_item->>'unit_price')::numeric not between 1 and 100000000
      or trunc((v_item->>'unit_price')::numeric) <> (v_item->>'unit_price')::numeric then
      raise exception 'Cantidad o precio inválido.' using errcode = '22023';
    end if;
    v_total := v_total + (v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric;
  end loop;
  if v_total > 1000000000 then raise exception 'Total supera el límite de simulación.' using errcode = '22023'; end if;

  -- A retry returns the original snapshot, even if the issuer profile has since changed.
  -- The lock also serializes concurrent retries with the same organization/request.
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || p_request_id::text, 0));
  select * into v_result from public.sii_receipt_simulations
    where organization_id = p_organization_id and request_id = p_request_id;
  if found then
    if v_result.items <> p_items then raise exception 'La solicitud ya existe con otros productos.' using errcode = '22023'; end if;
    return v_result;
  end if;
  select * into v_profile from public.sii_issuer_profiles where organization_id = p_organization_id;
  if not found then raise exception 'Guarda primero los datos del emisor.' using errcode = '22023'; end if;
  v_net := round(v_total * 100 / 119);
  insert into public.sii_receipt_simulations (
    organization_id, request_id, issuer_snapshot, items, total, net, vat, created_by
  ) values (
    p_organization_id, p_request_id,
    jsonb_build_object('rut', v_profile.rut, 'legal_name', v_profile.legal_name,
      'business_activity', v_profile.business_activity, 'address', v_profile.address, 'commune', v_profile.commune),
    p_items, v_total, v_net, v_total - v_net, auth.uid()
  ) returning * into v_result;
  return v_result;
end;
$$;
revoke all on function public.simulate_sii_receipt(uuid, uuid, jsonb) from public, anon;
grant execute on function public.simulate_sii_receipt(uuid, uuid, jsonb) to authenticated;
commit;
