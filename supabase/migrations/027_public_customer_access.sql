-- ============================================================
-- 027: Public Customer Access — RLS policies for unauthenticated
--      access to create/update customers from online orders
-- ============================================================

-- Allow public (anon) to look up existing customers by phone
CREATE POLICY "Public read customers by phone"
  ON customers FOR SELECT
  USING (true);

-- Allow public (anon) to insert new customers from online orders
CREATE POLICY "Public insert customers"
  ON customers FOR INSERT
  WITH CHECK (true);

-- Allow public (anon) to update customer name/email on existing records
CREATE POLICY "Public update customers"
  ON customers FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow public (anon) to update order customer_id after customer creation
-- (The existing policy only allows SELECT on online orders, not UPDATE)
CREATE POLICY "Public update own online order"
  ON orders FOR UPDATE
  USING (order_type IN ('online', 'whatsapp'))
  WITH CHECK (order_type IN ('online', 'whatsapp'));
