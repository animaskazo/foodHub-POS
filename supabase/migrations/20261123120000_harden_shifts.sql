-- Endurece el flujo de Abrir/Cerrar caja.
--  1. Guarda el arqueo: efectivo esperado y diferencia (faltante < 0, sobrante > 0).
--  2. Garantiza un único turno abierto por organización.

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS expected_cash NUMERIC,
  ADD COLUMN IF NOT EXISTS cash_difference NUMERIC;

COMMENT ON COLUMN shifts.expected_cash IS 'Fondo inicial + ventas en efectivo del turno, calculado al cerrar.';
COMMENT ON COLUMN shifts.cash_difference IS 'reported_balance - expected_cash. Negativo = faltante, positivo = sobrante.';

-- Si hoy existe más de un turno abierto en una organización, se conserva el más
-- reciente y se cierran los anteriores (sin arqueo) para poder crear el índice.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY start_time DESC) AS rn
  FROM shifts
  WHERE status = 'open'
)
UPDATE shifts s
SET status = 'closed',
    end_time = NOW(),
    updated_at = NOW()
FROM ranked r
WHERE s.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_open_per_org
  ON shifts (organization_id)
  WHERE status = 'open';
