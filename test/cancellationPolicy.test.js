const test = require('node:test');
const assert = require('node:assert/strict');
const cancellationPolicyModel = require('../models/cancellationPolicyModel');

function decision(hoursUntil, policy = {}) {
  const now = new Date('2026-07-20T10:00:00');
  const startsAt = new Date(now.getTime() + hoursUntil * 60 * 60 * 1000);
  return cancellationPolicyModel.calculateCustomerCancellationRefund({
    policy: {
      ...cancellationPolicyModel.DEFAULT_POLICY,
      ...policy,
    },
    bookingDate: startsAt,
    bookingTime: `${String(startsAt.getHours()).padStart(2, '0')}:${String(startsAt.getMinutes()).padStart(2, '0')}`,
    now,
  }).refundPercentage;
}

test('platform cancellation refunds are tiered by time before appointment', () => {
  assert.equal(decision(25), 95);
  assert.equal(decision(24), 50);
  assert.equal(decision(6), 50);
  assert.equal(decision(5.99), 0);
});

test('merchant policy can cap customer-caused refunds but not increase them', () => {
  assert.equal(decision(25, { refund_percentage: 80 }), 80);
  assert.equal(decision(10, { refund_percentage: 80 }), 50);
  assert.equal(decision(25, { min_cancel_hours: 48 }), 0);
});
