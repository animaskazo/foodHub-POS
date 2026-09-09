-- Cierre temporal completo de la tienda online.
-- Cuando force_closed = true, el storefront muestra pantalla de "Tienda cerrada"
-- y no permite navegar el menú ni pedir (ni ahora ni programado).
-- closed_message es opcional; si es NULL se muestra el mensaje por defecto.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS force_closed BOOLEAN DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS closed_message TEXT;
