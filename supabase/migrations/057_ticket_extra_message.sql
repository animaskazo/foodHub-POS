-- Mensaje personalizado del negocio para imprimir como segundo ticket
-- (tras el corte del voucher). Si está vacío, solo se imprime el voucher.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ticket_extra_message TEXT DEFAULT '';
