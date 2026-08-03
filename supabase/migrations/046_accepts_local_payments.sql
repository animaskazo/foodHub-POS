-- Add accepts_local_payments column to organizations table
alter table organizations add column if not exists accepts_local_payments boolean default true;
