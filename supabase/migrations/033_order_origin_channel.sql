-- Apply in staging first. Keep existing order_type enum unchanged.
-- Instagram orders already use external_order_key for idempotency.
alter table public.orders
  add column if not exists origin_channel text;

update public.orders
set origin_channel = case
  when external_order_key is not null then 'instagram'
  when order_type::text = 'whatsapp' then 'whatsapp'
  else 'other'
end
where origin_channel is null;

create or replace function public.foodhub_set_order_origin()
returns trigger language plpgsql as $$
begin
  if new.external_order_key is not null then
    new.origin_channel := 'instagram';
  elsif new.origin_channel is null then
    new.origin_channel := case when new.order_type::text = 'whatsapp'
      then 'whatsapp' else 'other' end;
  end if;
  return new;
end;
$$;

drop trigger if exists foodhub_set_order_origin_trigger on public.orders;
create trigger foodhub_set_order_origin_trigger
before insert or update of external_order_key, origin_channel on public.orders
for each row execute function public.foodhub_set_order_origin();

alter table public.orders alter column origin_channel set default 'other';
alter table public.orders alter column origin_channel set not null;
alter table public.orders add constraint orders_origin_channel_check
  check (origin_channel in ('instagram','whatsapp','other'));
create index if not exists orders_org_origin_created_idx
  on public.orders (organization_id,origin_channel,created_at desc);
comment on column public.orders.origin_channel is
  'Real customer acquisition channel; independent of legacy order_type enum.';
