alter table public.organization_subscriptions
  add column if not exists activation_email_status text
    check (activation_email_status in ('sending', 'sent', 'failed')),
  add column if not exists activation_email_sent_at timestamptz,
  add column if not exists activation_email_message_id text,
  add column if not exists activation_email_error text;

revoke select (
  activation_email_status, activation_email_sent_at,
  activation_email_message_id, activation_email_error
) on public.organization_subscriptions from anon, authenticated;
