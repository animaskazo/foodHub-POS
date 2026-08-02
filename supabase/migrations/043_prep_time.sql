-- Tiempo de preparación del local (minutos) para pedidos online agendados/retiro
alter table organizations
  add column if not exists prep_time integer default 15;