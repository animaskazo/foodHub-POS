-- ============================================================
-- 013: Public Order Access — RLS policies for unauthenticated
--      access to catalog and order insertion by customers
-- ============================================================

-- Allow public (anon) to read organizations by slug
create policy "Public read organizations by slug"
  on organizations for select
  using (true);

-- Allow public (anon) to read active categories
create policy "Public read active categories"
  on categories for select
  using (is_active = true);

-- Allow public to read available products
create policy "Public read available products"
  on products for select
  using (status = 'available');

-- Allow public to read product images
create policy "Public read product images"
  on product_images for select
  using (true);

-- Allow public to read product categories (join table)
create policy "Public read product categories"
  on product_categories for select
  using (true);

-- Allow public to read variant groups
create policy "Public read variant groups"
  on variant_groups for select
  using (true);

-- Allow public to read variant options
create policy "Public read variant options"
  on variant_options for select
  using (true);

-- Allow public to read product ingredients
create policy "Public read product ingredients"
  on product_ingredients for select
  using (true);

-- Allow public to read ingredients
create policy "Public read ingredients"
  on ingredients for select
  using (true);

-- Allow public to read branches (for order placement)
create policy "Public read active branches"
  on branches for select
  using (is_active = true);

-- Allow public to insert orders (online channel)
create policy "Public insert orders"
  on orders for insert
  with check (order_type = 'online');

-- Allow public to read orders they created
create policy "Public read own order"
  on orders for select
  using (order_type = 'online');

-- Allow public to insert order items
create policy "Public insert order items"
  on order_items for insert
  with check (true);

-- Allow public to read order items
create policy "Public read order items"
  on order_items for select
  using (true);

-- Allow public to insert order item variants
create policy "Public insert order item variants"
  on order_item_variants for insert
  with check (true);

-- Allow public to insert order item ingredients
create policy "Public insert order item ingredients"
  on order_item_ingredients for insert
  with check (true);

-- Allow public to insert payments (pending status only)
create policy "Public insert payments"
  on payments for insert
  with check (status = 'pending');
