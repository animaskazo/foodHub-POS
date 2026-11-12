const TRIAL_DAYS = 15;

export function isComplimentaryAccessActive(subscription, now = Date.now()) {
  if (!subscription?.free_access) return false;
  const startsAt = subscription.free_access_starts_at
    ? new Date(subscription.free_access_starts_at).getTime()
    : Number.NEGATIVE_INFINITY;
  const endsAt = subscription.free_access_ends_at
    ? new Date(subscription.free_access_ends_at).getTime()
    : Number.POSITIVE_INFINITY;
  return startsAt <= now && endsAt > now;
}

export function getSubscriptionStatus(subscription) {
  if (isComplimentaryAccessActive(subscription)) {
    const endsAt = subscription.free_access_ends_at
      ? new Date(subscription.free_access_ends_at).getTime()
      : null;
    const daysLeft = endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 86400000)) : null;
    return {
      state: subscription,
      daysLeft,
      isActive: true,
      isTrial: false,
      status: 'complimentary',
      isFree: true,
      isComplimentary: true,
    };
  }
  if (!subscription) {
    return { state: null, daysLeft: TRIAL_DAYS, isActive: true, isTrial: true, status: 'trialing' };
  }
  if (subscription.status === 'active') {
    return { state: subscription, daysLeft: 0, isActive: true, isTrial: false, status: subscription.status };
  }
  if (subscription.status === 'trialing') {
    const end = subscription.trial_ends_at ? new Date(subscription.trial_ends_at).getTime() : Date.now() + TRIAL_DAYS * 86400000;
    const daysLeft = Math.max(0, Math.ceil((end - Date.now()) / 86400000));
    const isActive = Date.now() < end;
    return { state: subscription, daysLeft, isActive, isTrial: true, status: isActive ? 'trialing' : 'expired' };
  }
  if (subscription.status === 'pending_card' || subscription.status === 'pending_payment') {
    const end = subscription.trial_ends_at ? new Date(subscription.trial_ends_at).getTime() : 0;
    if (end > Date.now()) {
      return { state: subscription, daysLeft: Math.max(0, Math.ceil((end - Date.now()) / 86400000)), isActive: true, isTrial: true, status: 'trialing' };
    }
  }
  return { state: subscription, daysLeft: 0, isActive: false, isTrial: false, status: subscription.status };
}

export function formatClp(value) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}
