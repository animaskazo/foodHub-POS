-- ============================================================
-- FoodHub POS — Datos de Prueba y Políticas de Desarrollo
-- ============================================================

-- 1. Políticas temporales para Desarrollo (Permitir lectura anónima)
-- En un entorno real, estas políticas no existirían, el usuario debería estar logueado.
create policy "dev_public_read_orgs" on organizations for select using (true);
create policy "dev_public_read_branches" on branches for select using (true);
create policy "dev_public_read_categories" on categories for select using (true);
create policy "dev_public_read_products" on products for select using (true);

-- 2. Insertar Organización y Sucursal de prueba
DO $$
DECLARE
  v_org_id uuid;
  v_branch_id uuid;
  v_cat_burgers uuid;
  v_cat_drinks uuid;
  v_cat_sides uuid;
BEGIN
  -- Insert Organization
  insert into organizations (name, slug, primary_color, currency)
  values ('FoodHub Demo', 'foodhub-demo', '#000000', 'CLP')
  returning id into v_org_id;

  -- Insert Branch
  insert into branches (organization_id, name, address, accepts_table, accepts_pickup)
  values (v_org_id, 'Local Providencia', 'Av. Providencia 1234', true, true)
  returning id into v_branch_id;

  -- Insert Categories
  insert into categories (organization_id, name, sort_order) values (v_org_id, 'Hamburguesas', 1) returning id into v_cat_burgers;
  insert into categories (organization_id, name, sort_order) values (v_org_id, 'Bebidas', 2) returning id into v_cat_drinks;
  insert into categories (organization_id, name, sort_order) values (v_org_id, 'Acompañamientos', 3) returning id into v_cat_sides;

  -- Insert Products (Burgers)
  insert into products (id, organization_id, name, base_price, status) 
  values 
    (gen_random_uuid(), v_org_id, 'Classic Burger', 5900, 'available'),
    (gen_random_uuid(), v_org_id, 'Cheese Burger', 6900, 'available'),
    (gen_random_uuid(), v_org_id, 'Double Bacon Burger', 8900, 'available'),
    (gen_random_uuid(), v_org_id, 'Veggie Burger', 7500, 'available');

  -- Assign Burgers to category
  insert into product_categories (product_id, category_id)
  select id, v_cat_burgers from products where name like '%Burger%';

  -- Insert Products (Drinks)
  insert into products (id, organization_id, name, base_price, status)
  values
    (gen_random_uuid(), v_org_id, 'Coca-Cola 350ml', 1500, 'available'),
    (gen_random_uuid(), v_org_id, 'Sprite 350ml', 1500, 'available'),
    (gen_random_uuid(), v_org_id, 'Agua Mineral', 1200, 'available');

  -- Assign Drinks to category
  insert into product_categories (product_id, category_id)
  select id, v_cat_drinks from products where name in ('Coca-Cola 350ml', 'Sprite 350ml', 'Agua Mineral');

  -- Insert Products (Sides)
  insert into products (id, organization_id, name, base_price, status)
  values
    (gen_random_uuid(), v_org_id, 'Papas Fritas', 2500, 'available'),
    (gen_random_uuid(), v_org_id, 'Aros de Cebolla', 3000, 'available');

  -- Assign Sides to category
  insert into product_categories (product_id, category_id)
  select id, v_cat_sides from products where name in ('Papas Fritas', 'Aros de Cebolla');

END $$;
