-- 062_public_coupon_read.sql – Allow anonymous/public read on active coupons
-- This mirrors the public read policies used in 013_public_order.sql for
-- categories/products/organizations, allowing the public storefront checkout
-- to validate coupon codes without requiring authentication.
--
-- Run manually in the Supabase SQL Editor if supabase db push is blocked by
-- migration desync:

create policy "Public read active coupons"
  on coupons for select
  using (is_active = true);
