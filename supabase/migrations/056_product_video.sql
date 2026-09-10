-- Soporta foto + video en productos. El video se reproduce en hover en la tienda pública.
alter table products
  add column if not exists video_url text;
