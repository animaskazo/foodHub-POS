const TRIAL_DAYS = 15;
const STORAGE_PREFIX = 'foodhub_subscription_demo:';

export const SUBSCRIPTION_PLANS = [
  {
    id: 'basic',
    name: 'Básico',
    price: 12900,
    description: 'Para comenzar a ordenar las ventas y la operación de tu negocio.',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 24900,
    description: 'Para restaurantes que necesitan más herramientas para crecer.',
    featured: true,
  },
  {
    id: 'restaurant',
    name: 'Restaurant',
    price: 64900,
    description: 'Para operaciones de restaurante con una gestión más completa.',
  },
];

const storageKey = (organizationId) => `${STORAGE_PREFIX}${organizationId}`;

export function readSubscriptionDemo(organizationId) {
  if (!organizationId || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(organizationId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function startSubscriptionTrial(organizationId, startedAt = new Date().toISOString()) {
  if (!organizationId || typeof window === 'undefined') return null;
  const existing = readSubscriptionDemo(organizationId);
  if (existing) return existing;
  const state = { trialStartedAt: startedAt, status: 'trialing', planId: null, activatedAt: null };
  window.localStorage.setItem(storageKey(organizationId), JSON.stringify(state));
  return state;
}

export function saveMockSubscription(organizationId, planId) {
  const plan = SUBSCRIPTION_PLANS.find((item) => item.id === planId);
  if (!organizationId || !plan || typeof window === 'undefined') return null;
  const state = {
    ...(readSubscriptionDemo(organizationId) || {}),
    trialStartedAt: readSubscriptionDemo(organizationId)?.trialStartedAt || new Date().toISOString(),
    status: 'active',
    planId,
    activatedAt: new Date().toISOString(),
    paymentMode: 'mock',
  };
  window.localStorage.setItem(storageKey(organizationId), JSON.stringify(state));
  return state;
}

export function getSubscriptionStatus(organizationId) {
  const state = readSubscriptionDemo(organizationId);
  if (!state) return { state: null, daysLeft: TRIAL_DAYS, isActive: true, isTrial: true };
  if (state.status === 'active') return { state, daysLeft: 0, isActive: true, isTrial: false };
  const start = new Date(state.trialStartedAt).getTime();
  const elapsed = Math.floor((Date.now() - start) / 86400000);
  const daysLeft = Math.max(0, TRIAL_DAYS - elapsed);
  const expired = Date.now() >= start + TRIAL_DAYS * 86400000;
  return { state, daysLeft, isActive: !expired, isTrial: true };
}

export function formatClp(value) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
  }).format(value);
}
