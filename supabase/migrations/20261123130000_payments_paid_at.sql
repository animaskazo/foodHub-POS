-- El arqueo de caja cuenta los pagos por su hora real de cobro (payments.paid_at),
-- no por la hora de creación de la orden. Esta migración garantiza que paid_at
-- siempre esté poblado para pagos cobrados, venga del POS, del checkout público
-- o de webhooks (Klap).

CREATE OR REPLACE FUNCTION set_payment_paid_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'paid' AND NEW.paid_at IS NULL THEN
    NEW.paid_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_set_paid_at ON payments;
CREATE TRIGGER payments_set_paid_at
  BEFORE INSERT OR UPDATE OF status ON payments
  FOR EACH ROW
  EXECUTE FUNCTION set_payment_paid_at();

-- Histórico: pagos cobrados sin paid_at toman la hora de creación de su orden
-- (equivale a cómo se contaban hasta ahora).
UPDATE payments p
SET paid_at = o.created_at
FROM orders o
WHERE o.id = p.order_id
  AND p.status = 'paid'
  AND p.paid_at IS NULL;

CREATE INDEX IF NOT EXISTS payments_paid_at_idx ON payments (paid_at);
