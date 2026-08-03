-- Permite que la portada (cover) de una organización sea un video en loop.
alter table organizations
  add column cover_is_video boolean default false;