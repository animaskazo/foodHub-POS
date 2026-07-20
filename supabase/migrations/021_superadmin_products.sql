-- Super Admin policy for products
CREATE POLICY "Super admins can view all products" 
ON products FOR SELECT USING (
  EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);
