alter table ingredients
  add column if not exists unit text not null default 'unit',
  add column if not exists stock_quantity numeric(12,3) default 0,
  add column if not exists low_stock_threshold numeric(12,3);

alter table product_ingredients
  add column if not exists portion_multiplier numeric(12,3) default 1,
  add column if not exists variant_option_id uuid references variant_options(id) on delete cascade;

alter table ingredients drop column if exists inventory_item_id;

create index if not exists idx_product_ingredients_variant on product_ingredients(variant_option_id);
