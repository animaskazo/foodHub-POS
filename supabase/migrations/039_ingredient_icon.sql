-- Add icon (lucide icon name) to ingredients for visual identification
alter table public.ingredients
  add column if not exists icon text;
