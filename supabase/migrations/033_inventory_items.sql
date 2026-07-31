-- 033_inventory_items.sql
-- Inventory system for raw materials/insumos tracking

-- ── INVENTORY ITEMS ──────────────────────────────────────────
-- Raw materials / ingredients tracked in stock

create table inventory_items (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid          not null references organizations(id) on delete cascade,
  name                 text          not null,
  unit                 text          not null default 'unit',
  unit_price           numeric(12,2) default 0,
  stock_quantity       numeric(12,3) default 0,
  low_stock_threshold  numeric(12,3),
  is_active            boolean       default true,
  created_at           timestamptz   default now(),
  updated_at           timestamptz   default now()
);

create index on inventory_items(organization_id);

-- ── PRODUCT RECIPES ──────────────────────────────────────────
-- How many raw materials each menu product consumes

create table product_recipes (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid          not null references products(id) on delete cascade,
  inventory_item_id uuid          not null references inventory_items(id) on delete cascade,
  quantity          numeric(12,3) not null,
  is_active         boolean       default true,
  created_at        timestamptz   default now(),
  unique (product_id, inventory_item_id)
);

create index on product_recipes(product_id);
create index on product_recipes(inventory_item_id);

-- ── INVENTORY ITEM MOVEMENTS ────────────────────────────────
-- Audit trail for all stock changes

create table inventory_item_movements (
  id                uuid primary key default gen_random_uuid(),
  inventory_item_id uuid          not null references inventory_items(id) on delete cascade,
  organization_id   uuid          not null references organizations(id) on delete cascade,
  branch_id         uuid          references branches(id) on delete set null,
  quantity          numeric(12,3) not null,
  movement_type     text          not null,
  reference_type    text,
  reference_id      uuid,
  notes             text,
  created_by        uuid          references staff(id) on delete set null,
  created_at        timestamptz   default now()
);

create index on inventory_item_movements(inventory_item_id);
create index on inventory_item_movements(organization_id);

-- ── AUTO-UPDATE UPDATED_AT ───────────────────────────────────

create or replace function update_inventory_items_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_inventory_items_updated_at
  before update on inventory_items
  for each row
  execute function update_inventory_items_updated_at();

-- ── RLS POLICIES ─────────────────────────────────────────────

alter table inventory_items enable row level security;
alter table product_recipes enable row level security;
alter table inventory_item_movements enable row level security;

-- inventory_items
create policy "Enable read for authenticated on inventory_items"
  on inventory_items for select using (auth.role() = 'authenticated');

create policy "Enable insert for authenticated on inventory_items"
  on inventory_items for insert with check (auth.role() = 'authenticated');

create policy "Enable update for authenticated on inventory_items"
  on inventory_items for update using (auth.role() = 'authenticated');

create policy "Enable delete for authenticated on inventory_items"
  on inventory_items for delete using (auth.role() = 'authenticated');

-- product_recipes
create policy "Enable read for authenticated on product_recipes"
  on product_recipes for select using (auth.role() = 'authenticated');

create policy "Enable insert for authenticated on product_recipes"
  on product_recipes for insert with check (auth.role() = 'authenticated');

create policy "Enable update for authenticated on product_recipes"
  on product_recipes for update using (auth.role() = 'authenticated');

create policy "Enable delete for authenticated on product_recipes"
  on product_recipes for delete using (auth.role() = 'authenticated');

-- inventory_item_movements
create policy "Enable read for authenticated on inventory_item_movements"
  on inventory_item_movements for select using (auth.role() = 'authenticated');

create policy "Enable insert for authenticated on inventory_item_movements"
  on inventory_item_movements for insert with check (auth.role() = 'authenticated');
