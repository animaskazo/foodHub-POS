-- ============================================================
-- 028: WhatsApp Inbox — Add columns for Kapso embedded inbox
-- ============================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS whatsapp_inbox_url TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_inbox_enabled BOOLEAN NOT NULL DEFAULT false;
