-- migration 049_order_items_status.sql

ALTER TABLE order_items 
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready'));

-- Backfill existing items to 'pending' if null
UPDATE order_items SET status = 'pending' WHERE status IS NULL;
