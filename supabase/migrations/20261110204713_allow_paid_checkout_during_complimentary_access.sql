-- Keep complimentary access available while the customer completes a paid checkout.
-- The Flow callback clears free_access atomically when the paid subscription becomes active.
alter table public.organization_subscriptions
  drop constraint if exists free_access_requires_no_billing;

alter table public.organization_subscriptions
  add constraint free_access_requires_no_billing check (
    not free_access or (
      status not in ('active', 'past_due')
      and (flow_subscription_id is null or status = 'cancelled')
    )
  );
