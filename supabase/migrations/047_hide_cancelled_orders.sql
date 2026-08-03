-- Add hide_cancelled_orders column to organizations table
alter table organizations add column if not exists hide_cancelled_orders boolean default false;
