-- Migration: add delivery_service to orders

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS delivery_service text DEFAULT 'own';

-- Opcional: comentar la columna para saber qué valores puede tener
COMMENT ON COLUMN public.orders.delivery_service IS 'Identificador del servicio de reparto seleccionado (ej: "uber", "own")';
