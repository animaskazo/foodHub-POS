-- 040_scheduled_orders.sql
-- Pedidos programados (agendados para una hora futura)

alter table orders
  add column if not exists scheduled_at timestamptz;

create index if not exists idx_orders_scheduled_at on orders(scheduled_at)
  where scheduled_at is not null;

-- Programa la edge function que activa los pedidos pendientes vencidos
-- (requiere que scheduled-orders-cron esté desplegada y la extensión pg_cron activa).
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'activate-scheduled-orders',
      '*/1 * * * *',
      $job$
      select net.http_post(
        url := 'https://fgvhbniauzjvzeuespmf.supabase.co/functions/v1/scheduled-orders-cron',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', concat('Bearer ', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1))
        ),
        body := '{}'
      );
      $job$
    );
  end if;
end $do$;
