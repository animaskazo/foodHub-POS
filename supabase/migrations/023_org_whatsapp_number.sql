-- Agregar campo para vincular el número de WhatsApp de Kapso a cada organización
alter table organizations
  add column if not exists whatsapp_phone_number_id text unique;

-- Comentario
comment on column organizations.whatsapp_phone_number_id is
  'Phone Number ID de Kapso/Meta que corresponde al número de WhatsApp de este local.
   Se obtiene desde Kapso → WhatsApp → Configurations → seleccionar número → Phone Number ID.';

-- Índice para búsqueda rápida desde la edge function
create index if not exists organizations_whatsapp_phone_number_id_idx
  on organizations (whatsapp_phone_number_id)
  where whatsapp_phone_number_id is not null;
