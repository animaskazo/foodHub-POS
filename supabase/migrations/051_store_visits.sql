create table if not exists store_visits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade not null,
  date date not null default current_date,
  visit_count integer not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id, date)
);

alter table store_visits enable row level security;

-- Policies
create policy "Allow read access for all users"
  on store_visits for select
  using (true);

-- RPC for incrementing safely
create or replace function increment_store_visits(p_organization_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  insert into store_visits (organization_id, date, visit_count)
  values (p_organization_id, current_date, 1)
  on conflict (organization_id, date)
  do update set 
    visit_count = store_visits.visit_count + 1,
    updated_at = now();
end;
$$;
