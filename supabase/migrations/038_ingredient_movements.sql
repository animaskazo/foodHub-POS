create table if not exists ingredient_movements (
  id                uuid primary key default gen_random_uuid(),
  ingredient_id     uuid          not null references ingredients(id) on delete cascade,
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

create index if not exists idx_ingredient_movements_ingredient_id on ingredient_movements(ingredient_id);
create index if not exists idx_ingredient_movements_organization_id on ingredient_movements(organization_id);

alter table ingredient_movements enable row level security;

create policy "Enable read for authenticated on ingredient_movements"
  on ingredient_movements for select using (auth.role() = 'authenticated');

create policy "Enable insert for authenticated on ingredient_movements"
  on ingredient_movements for insert with check (auth.role() = 'authenticated');

create policy "Enable update for authenticated on ingredient_movements"
  on ingredient_movements for update using (auth.role() = 'authenticated');

create policy "Enable delete for authenticated on ingredient_movements"
  on ingredient_movements for delete using (auth.role() = 'authenticated');
