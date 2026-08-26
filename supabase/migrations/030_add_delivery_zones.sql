-- Migration 030: Add delivery_zones column to organizations table
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS delivery_zones JSONB DEFAULT '[]'::jsonb;
