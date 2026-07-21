-- ============================================================
-- FoodHub POS — WhatsApp Session Storage
-- Persiste el estado conversacional de cada número de WhatsApp
-- ============================================================

create table if not exists whatsapp_sessions (
  phone        text        primary key,                        -- número E.164: +56912345678
  session_data jsonb       not null default '{}'::jsonb,       -- { messages, cart, collect, org_slug }
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- Índice para limpiar sesiones viejas (TTL manual)
create index if not exists whatsapp_sessions_updated_at_idx
  on whatsapp_sessions (updated_at);

-- RLS: solo service role puede acceder (la edge function usa SUPABASE_SERVICE_ROLE_KEY)
alter table whatsapp_sessions enable row level security;

-- No policies públicas — acceso solo vía service role key
comment on table whatsapp_sessions is
  'Almacena el estado conversacional de cada sesión de WhatsApp (carrito, historial, flujo de confirmación).';
