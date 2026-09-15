-- ============================================================
-- 060_coupons.sql – Tabla de cupones de descuento
-- ============================================================

-- 1. Crear tabla coupons primero
create table if not exists coupons (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code            text not null,
  type            text not null check (type in ('percentage', 'fixed')),
  value           numeric(12,2) not null check (value > 0),
  min_total       numeric(12,2) default 0,
  max_uses        int,
  used_count      int default 0,
  expires_at      timestamptz,
  is_active       boolean default true,
  created_at      timestamptz default now()
);

-- Un código único por organización
create unique index idx_coupons_org_code on coupons(organization_id, upper(code));

-- Habilitar RLS
alter table coupons enable row level security;

create policy "Staff can view coupons for their org"
  on coupons for select
  using (
    organization_id in (
      select organization_id from staff where id = auth.uid()
    )
  );

create policy "Managers can manage coupons for their org"
  on coupons for all
  using (
    organization_id in (
      select organization_id from staff where id = auth.uid()
        and role in ('owner', 'manager', 'admin')
    )
  );

-- 2. Agregar coupon_id a orders (después de crear coupons)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'orders' and column_name = 'coupon_id'
  ) then
    alter table orders add column coupon_id uuid references coupons(id) on delete set null;
  end if;
end $$;
