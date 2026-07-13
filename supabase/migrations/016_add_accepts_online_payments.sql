-- Add accepts_online_payments and online_payments_allowed columns to organizations table
alter table organizations add column if not exists accepts_online_payments boolean default true;
alter table organizations add column if not exists online_payments_allowed boolean default false;

-- Enable for the test organization
update organizations set online_payments_allowed = true where id = '75caf8f2-d8ce-4ef3-833f-ad968cb9ebf1';
