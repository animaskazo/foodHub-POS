-- 064_expenses.sql
-- Sección Gastos fijos y variables + cruce con ventas para utilidades
-- Patrón: multi-tenant por organization_id, RLS como 033_inventory_items.sql

-- ── EXPENSE CATEGORIES ───────────────────────────────────────
-- Ej: Arriendo (fijo), Sueldos (fijo), Insumos (variable), Delivery (variable)

create table expense_categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  type            text not null default 'variable' check (type in ('fijo', 'variable')),
  color           text default '#6b7280',
  icon            text,
  is_active       boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (organization_id, name)
);

create index on expense_categories(organization_id);
create index on expense_categories(organization_id, type);

-- ── EXPENSES ─────────────────────────────────────────────────
-- Nivel intermedio: fecha + monto + categoría + proveedor opcional + medio pago
-- Recurrencia auto sin cron: fila madre con is_recurring=true se expande virtualmente en app

create table expenses (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  branch_id       uuid references branches(id) on delete set null,
  category_id     uuid references expense_categories(id) on delete set null,
  amount          numeric(12,2) not null check (amount >= 0),
  expense_date    date not null,
  description     text not null default '',
  supplier        text,
  payment_method  text,
  is_recurring    boolean default false,
  recurrence      text default 'monthly' check (recurrence in ('monthly')),
  recurrence_end  date,
  notes           text,
  created_by      uuid references staff(id) on delete set null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index on expenses(organization_id);
create index on expenses(organization_id, expense_date);
create index on expenses(organization_id, category_id);
create index on expenses(category_id);

-- ── UPDATED_AT ───────────────────────────────────────────────

create trigger set_expenses_updated_at
  before update on expenses
  for each row
  execute function set_updated_at();

create trigger set_expense_categories_updated_at
  before update on expense_categories
  for each row
  execute function set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────

alter table expense_categories enable row level security;
alter table expenses enable row level security;

create policy "Enable read for authenticated on expense_categories"
  on expense_categories for select using (auth.role() = 'authenticated');

create policy "Enable insert for authenticated on expense_categories"
  on expense_categories for insert with check (auth.role() = 'authenticated');

create policy "Enable update for authenticated on expense_categories"
  on expense_categories for update using (auth.role() = 'authenticated');

create policy "Enable delete for authenticated on expense_categories"
  on expense_categories for delete using (auth.role() = 'authenticated');

create policy "Enable read for authenticated on expenses"
  on expenses for select using (auth.role() = 'authenticated');

create policy "Enable insert for authenticated on expenses"
  on expenses for insert with check (auth.role() = 'authenticated');

create policy "Enable update for authenticated on expenses"
  on expenses for update using (auth.role() = 'authenticated');

create policy "Enable delete for authenticated on expenses"
  on expenses for delete using (auth.role() = 'authenticated');
