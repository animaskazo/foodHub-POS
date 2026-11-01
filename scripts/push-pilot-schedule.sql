-- Run ONLY against a separately confirmed test database, after deployment.
-- Requires two Vault secrets, created securely outside source control:
-- push_pilot_project_url = the test project's https://<ref>.supabase.co URL
-- push_pilot_worker_secret = same random secret as Edge PUSH_WORKER_SECRET
-- Does not put a service_role key in a scheduled command.
do $$
begin
  if to_regclass('public.push_deliveries') is null then raise exception 'Push migration missing'; end if;
  if not exists (select 1 from vault.decrypted_secrets where name='push_pilot_project_url')
    or not exists (select 1 from vault.decrypted_secrets where name='push_pilot_worker_secret') then
    raise exception 'Configure test project URL and worker secret in Vault first';
  end if;
end $$;
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.schedule('foodhub-new-order-push-pilot','* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='push_pilot_project_url') || '/functions/v1/new-order-push',
    headers := jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='push_pilot_worker_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 60000
  );
$job$);
