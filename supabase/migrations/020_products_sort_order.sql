-- ── PRODUCTS SORT ORDER ─────────────────────────────────────
-- Permite ordenar los productos con drag & drop desde el admin
-- y respetar ese orden en el POS y el ecommerce.

alter table public.products
  add column if not exists sort_order int default 0;

create index if not exists products_org_sort_idx
  on public.products(organization_id, sort_order);
