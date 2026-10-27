-- Run in staging first. Unique source key prevents duplicate Instagram orders.
alter table public.orders add column if not exists external_order_key text;
create unique index if not exists orders_org_external_order_key_uidx
  on public.orders (organization_id, external_order_key)
  where external_order_key is not null;
comment on column public.orders.external_order_key is 'Server-generated idempotency key for external channel checkout';
