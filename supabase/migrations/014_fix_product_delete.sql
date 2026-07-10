-- Fix: Allow products to be deleted without breaking past orders.
-- 1. Drop the existing foreign key constraint on order_items(product_id).
-- 2. Alter the column to allow NULL.
-- 3. Add the foreign key constraint back with ON DELETE SET NULL.

ALTER TABLE order_items 
  DROP CONSTRAINT order_items_product_id_fkey;

ALTER TABLE order_items 
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE order_items 
  ADD CONSTRAINT order_items_product_id_fkey 
  FOREIGN KEY (product_id) 
  REFERENCES products(id) 
  ON DELETE SET NULL;
