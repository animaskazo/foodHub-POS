-- 010_ingredients.sql

-- ── INGREDIENTS ──────────────────────────────────────────────

create table ingredients (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid          not null references organizations(id) on delete cascade,
  name            text          not null,
  price           numeric(12,2) default 0,
  is_active       boolean       default true,
  created_at      timestamptz   default now()
);

create index on ingredients(organization_id);

-- Products <-> Ingredients (Many-to-Many)
create table product_ingredients (
  product_id      uuid references products(id) on delete cascade,
  ingredient_id   uuid references ingredients(id) on delete cascade,
  primary key (product_id, ingredient_id)
);

-- Selected ingredients per item (snapshot)
create table order_item_ingredients (
  id                  uuid primary key default gen_random_uuid(),
  order_item_id       uuid          not null references order_items(id) on delete cascade,
  ingredient_id       uuid          references ingredients(id) on delete set null,
  ingredient_name     text          not null,
  price               numeric(12,2) default 0
);

create index on order_item_ingredients(order_item_id);

-- RLS Policies for ingredients
alter table ingredients enable row level security;
alter table product_ingredients enable row level security;
alter table order_item_ingredients enable row level security;

-- Policies
create policy "Enable read access for authenticated users on ingredients"
  on ingredients for select using (auth.role() = 'authenticated');

create policy "Enable insert for authenticated users on ingredients"
  on ingredients for insert with check (auth.role() = 'authenticated');

create policy "Enable update for authenticated users on ingredients"
  on ingredients for update using (auth.role() = 'authenticated');

create policy "Enable delete for authenticated users on ingredients"
  on ingredients for delete using (auth.role() = 'authenticated');

create policy "Enable read access for authenticated users on product_ingredients"
  on product_ingredients for select using (auth.role() = 'authenticated');

create policy "Enable insert for authenticated users on product_ingredients"
  on product_ingredients for insert with check (auth.role() = 'authenticated');

create policy "Enable delete for authenticated users on product_ingredients"
  on product_ingredients for delete using (auth.role() = 'authenticated');

create policy "Enable read access for authenticated users on order_item_ingredients"
  on order_item_ingredients for select using (auth.role() = 'authenticated');

create policy "Enable insert for authenticated users on order_item_ingredients"
  on order_item_ingredients for insert with check (auth.role() = 'authenticated');
