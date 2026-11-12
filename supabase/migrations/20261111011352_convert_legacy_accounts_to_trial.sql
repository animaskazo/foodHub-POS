-- Legacy accounts no longer have permanent access. Their original organization
-- creation date defines the same 15-day trial window used for new accounts.
update public.organization_subscriptions as subscription
set
  status = 'trialing',
  trial_started_at = coalesce(subscription.trial_started_at, organization.created_at, subscription.created_at),
  trial_ends_at = coalesce(
    subscription.trial_ends_at,
    coalesce(subscription.trial_started_at, organization.created_at, subscription.created_at) + interval '15 days'
  )
from public.organizations as organization
where organization.id = subscription.organization_id
  and subscription.status = 'legacy_active';
