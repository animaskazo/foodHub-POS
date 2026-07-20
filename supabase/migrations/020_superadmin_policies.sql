-- ============================================================
-- Super Admin Policies
-- ============================================================
-- Permite a los super administradores leer todos los datos de 
-- organizaciones, órdenes y staff sin restricciones de tenant.

-- 1. Organizations
CREATE POLICY "Super admins can view all organizations" 
ON organizations
FOR SELECT 
USING (
  EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

-- 2. Orders
CREATE POLICY "Super admins can view all orders" 
ON orders
FOR SELECT 
USING (
  EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);

-- 3. Staff
CREATE POLICY "Super admins can view all staff" 
ON staff
FOR SELECT 
USING (
  EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
);
