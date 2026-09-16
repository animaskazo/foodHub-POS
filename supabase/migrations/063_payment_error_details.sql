-- Capturar detalle de errores en pagos online (Klap)
alter table payments add column if not exists error_details text;
alter type payment_status add value if not exists 'failed';