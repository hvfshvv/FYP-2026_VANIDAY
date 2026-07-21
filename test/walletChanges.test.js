const test = require('node:test');
const assert = require('node:assert/strict');
const walletController = require('../controllers/walletController');
const walletModel = require('../models/walletModel');
const loyaltyModel = require('../models/loyaltyModel');

test('abandoned top-up attempts use a finite pending window', () => {
  assert.equal(walletModel.PENDING_TOPUP_EXPIRY_HOURS, 24);
});

test('wallet preserves a valid booking return context', () => {
  assert.equal(
    walletController.returnToPaymentQuery({ bookingId: '153', amountDue: '58' }),
    '&bookingId=153&amountDue=58.00'
  );
  assert.equal(walletController.returnToPaymentQuery({ bookingId: 'bad', amountDue: '58' }), '');
});

test('wallet accepts preset, custom, and exact-shortfall top-up amounts', () => {
  assert.equal(walletController.parseAmount(10), 10);
  assert.equal(walletController.parseAmount('43.27'), 43.27);
  assert.equal(walletController.parseAmount('5.00'), 5);
});

test('wallet rejects invalid or out-of-range top-up amounts', () => {
  assert.throws(() => walletController.parseAmount('10.999'));
  assert.throws(() => walletController.parseAmount('4.99'));
  assert.throws(() => walletController.parseAmount('500.01'));
  assert.throws(() => walletController.parseAmount('not-a-number'));
});

test('new wallet payments earn 12% points while standard payments earn 10%', () => {
  const effectiveAt = '2026-07-21T00:00:00+08:00';
  const paidAfterLaunch = '2026-07-21T10:00:00+08:00';
  assert.equal(loyaltyModel.calculateBookingPoints(100, 'wallet', paidAfterLaunch, effectiveAt), 12);
  assert.equal(loyaltyModel.calculateBookingPoints(100, 'stripe', paidAfterLaunch, effectiveAt), 10);
  assert.equal(loyaltyModel.calculateBookingPoints(43, 'wallet', paidAfterLaunch, effectiveAt), 5);
});

test('wallet payments made before launch retain the historical 10% rate', () => {
  assert.equal(loyaltyModel.calculateBookingPoints(
    100,
    'wallet',
    '2026-07-20T23:59:59+08:00',
    '2026-07-21T00:00:00+08:00'
  ), 10);
});
