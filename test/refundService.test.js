const test = require('node:test');
const assert = require('node:assert/strict');

const { isStripeBackedPayment } = require('../services/refundService');

test('refund service recognises current and legacy Stripe payment method names', () => {
  assert.equal(isStripeBackedPayment({ payment_method: 'stripe' }), true);
  assert.equal(isStripeBackedPayment({ payment_method: 'card' }), true);
  assert.equal(isStripeBackedPayment({ payment_method: 'paynow' }), true);
  assert.equal(isStripeBackedPayment({ payment_method: 'wallet' }), false);
});
