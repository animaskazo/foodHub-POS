-- 066_expense_receipts.sql
-- Comprobante o factura adjunta al gasto (foto o PDF) + resultado de IA
-- El archivo vive en el bucket público 'images' bajo la carpeta 'receipts/'.

alter table expenses add column if not exists receipt_url text;
alter table expenses add column if not exists receipt_type text check (receipt_type in ('image', 'pdf'));
alter table expenses add column if not exists receipt_name text;
