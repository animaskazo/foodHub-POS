const TRIAL_DAYS = 15;

export function getSubscriptionStatus(subscription) {
  if (subscription?.free_access) {
    return { state: subscription, daysLeft: 0, isActive: true, isTrial: false, status: 'free', isFree: true };
  }
  if (!subscription) {
    return { state: null, daysLeft: TRIAL_DAYS, isActive: true, isTrial: true, status: 'trialing' };
  }
  if (subscription.status === 'legacy_active' || subscription.status === 'active') {
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
