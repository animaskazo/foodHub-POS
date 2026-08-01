-- 041_pickup_hours.sql
-- Horarios de retiro y habilitación de opciones "Ahora" / "Programar" en pedidos online

alter table organizations
  add column if not exists pickup_hours jsonb,
  add column if not exists instant_enabled boolean default true,
  add column if not exists scheduling_enabled boolean default true;
