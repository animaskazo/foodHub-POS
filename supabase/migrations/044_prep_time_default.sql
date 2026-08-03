-- Por defecto todas las organizaciones informan tiempo de cocina.
-- Cambio el default a "No informar" (0) para las organizaciones sin valor personalizado.
alter table organizations
  alter column prep_time set default 0;

-- "Retiro programado" (reservar para más tarde) apagado por defecto.
alter table organizations
  alter column scheduling_enabled set default false;