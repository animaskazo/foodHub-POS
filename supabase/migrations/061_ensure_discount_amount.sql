-- 061_ensure_discount_amount.sql
-- Asegurar que discount_amount y coupon_id existan en orders

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'orders' and column_name = 'discount_amount'
  ) then
    alter table orders add column discount_amount numeric(12,2) default 0;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'orders' and column_name = 'coupon_id'
  ) then
    alter table orders add column coupon_id uuid references coupons(id) on delete set null;
  end if;
end $$;
