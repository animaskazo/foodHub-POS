import test from 'node:test';
import assert from 'node:assert/strict';
import { getSubscriptionStatus } from '../src/services/subscription.js';

test('free access survives an expired trial and is not shown as a trial', () => {
  const result = getSubscriptionStatus({ status: 'trialing', trial_ends_at: '2020-01-01', free_access: true });
  assert.equal(result.isActive, true);
  assert.equal(result.isTrial, false);
  assert.equal(result.isFree, true);
});
test('removing free access restores the existing expired trial', () => {
  assert.equal(getSubscriptionStatus({ status: 'trialing', trial_ends_at: '2020-01-01', free_access: false }).isActive, false);
});
test('removing free access does not change legacy or paid access', () => {
  for (const status of ['legacy_active', 'active']) assert.equal(getSubscriptionStatus({ status, free_access: false }).isActive, true);
});
test('cancelled business may receive complimentary access', () => {
  assert.equal(getSubscriptionStatus({ status: 'cancelled', free_access: true }).isActive, true);
  assert.equal(getSubscriptionStatus({ status: 'cancelled', free_access: false }).isActive, false);
});
