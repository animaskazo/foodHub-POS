-- 035_product_recipes_variant.sql
-- Allow per-variant recipe quantities

alter table product_recipes add column if not exists variant_option_id uuid references variant_options(id) on delete cascade;

create index if not exists product_recipes_variant_option_id on product_recipes(variant_option_id);

alter table product_recipes drop constraint if exists product_recipes_product_id_inventory_item_id_key;

create unique index product_recipes_product_inventory_key
  on product_recipes(product_id, inventory_item_id)
  where variant_option_id is null;

create unique index product_recipes_product_inventory_variant_key
  on product_recipes(product_id, inventory_item_id, variant_option_id)
  where variant_option_id is not null;
