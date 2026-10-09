-- Add payment_details to store Klap extra info like card type and calculated settlement
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_details jsonb DEFAULT '{}'::jsonb;
