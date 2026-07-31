alter table ingredients
  add column if not exists inventory_item_id uuid references inventory_items(id) on delete set null,
  add column if not exists portion_quantity numeric(12,3) default 0;

create index if not exists idx_ingredients_inventory_item_id on ingredients(inventory_item_id);
