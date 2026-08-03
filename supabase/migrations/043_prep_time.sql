-- Tiempo de preparación del local (minutos) para pedidos online agendados/retiro
-- Por defecto "No informar" (0)
alter table organizations
  add column if not exists prep_time integer default 0;