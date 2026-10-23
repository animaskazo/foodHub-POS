-- Free access is independent of the underlying trial/billing state.
alter table public.organization_subscriptions
  add column free_access boolean not null default false;

-- Prevent an exemption from coexisting with an in-progress checkout or paid subscription.
alter table public.organization_subscriptions
  add constraint free_access_requires_no_billing check (
    not free_access or (
      status not in ('active', 'pending_card', 'pending_payment', 'past_due')
      and (flow_subscription_id is null or status = 'cancelled')
    )
  );
grant select (free_access) on public.organization_subscriptions to authenticated;
grant update (free_access) on public.organization_subscriptions to authenticated;
create policy "Super admins manage free access"
  on public.organization_subscriptions for update to authenticated
  using (exists (select 1 from public.super_admins sa where sa.user_id = (select auth.uid())))
  with check (exists (select 1 from public.super_admins sa where sa.user_id = (select auth.uid())));
