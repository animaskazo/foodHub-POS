-- Por defecto todas las organizaciones informan tiempo de cocina.
-- Cambio el default a "No informar" (0) para las organizaciones sin valor personalizado.
alter table organizations
  alter column prep_time set default 0;exit