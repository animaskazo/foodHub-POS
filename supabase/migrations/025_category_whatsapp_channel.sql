-- Agregar la columna show_in_whatsapp a la tabla categories para filtrar categorías en el agente de WhatsApp
alter table categories
  add column if not exists show_in_whatsapp boolean default true;

-- Comentario explicativo
comment on column categories.show_in_whatsapp is
  'Controla si esta categoría y sus productos asociados se listan en el menú proporcionado al agente de IA de WhatsApp.';
