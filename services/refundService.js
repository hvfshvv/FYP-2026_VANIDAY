const paymentModel = require('../models/paymentModel');
const bookingModel = require('../models/bookingModel');
const cancellationPolicyModel = require('../models/cancellationPolicyModel');
const {
  createRefund,
  retrieveCheckoutSession,
} = require('./stripeService');

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function isStripeBackedPayment(payment) {
  return ['stripe', 'paynow'].includes(String(payment.payment_method || '').toLowerCase());
}

function inferPaymentIntentId(payment) {
  const candidates = [
    payment.stripe_payment_intent_id,
    payment.payment_ref,
    payment.transaction_ref,
  ].filter(Boolean);

  return candidates.find(value => String(value).startsWith('pi_')) || null;
}

function inferCheckoutSessionId(payment) {
  const candidates = [
    payment.stripe_checkout_session_id,
    payment.payment_ref,
    payment.transaction_ref,
  ].filter(Boolean);

  return candidates.find(value => String(value).startsWith('cs_')) || null;
}

async function getStripeRefundTarget(payment) {
  let paymentIntentId = inferPaymentIntentId(payment);
  let chargeId = payment.stripe_latest_charge_id || null;

  if (paymentIntentId || chargeId) {
    return { paymentIntentId, chargeId };
  }

  const checkoutSessionId = inferCheckoutSessionId(payment);
  if (!checkoutSessionId) {
    throw new Error('Missing Stripe payment intent or charge ID for this payment.');
  }

  const session = await retrieveCheckoutSession(checkoutSessionId);
  const intent = session.payment_intent && typeof session.payment_intent === 'object'
    ? session.payment_intent
    : null;

  paymentIntentId = intent ? intent.id : session.payment_intent;
  const latestCharge = intent && intent.latest_charge && typeof intent.latest_charge === 'object'
    ? intent.latest_charge
    : null;
  chargeId = latestCharge ? latestCharge.id : intent?.latest_charge || null;

  if (!paymentIntentId && !chargeId) {
    throw new Error('Missing Stripe payment intent or charge ID for this payment.');
  }

  return { paymentIntentId, chargeId };
}

async function refundBookingPayment(bookingId, {
  amount = null,
  refundPercentage = null,
  reason = 'requested_by_customer',
} = {}) {
  const booking = await bookingModel.getBookingById(bookingId);
  if (!booking) {
    throw new Error('Booking not found for refund.');
  }

  const payment = await paymentModel.getPaymentByBooking(bookingId);
  if (!payment || !['paid', 'partially_refunded'].includes(payment.payment_status)) {
    return { skipped: true, reason: 'No paid payment found for this booking.' };
  }

  if (!isStripeBackedPayment(payment)) {
    return { skipped: true, reason: 'This payment was not processed through Stripe.' };
  }

  const originalAmount = roundMoney(payment.amount);
  const alreadyRefunded = await paymentModel.getRefundedAmount(bookingId);
  const remainingAmount = roundMoney(originalAmount - alreadyRefunded);

  if (remainingAmount <= 0 || payment.payment_status === 'refunded') {
    throw new Error('This payment has already been fully refunded.');
  }

  const percentage = refundPercentage === null || typeof refundPercentage === 'undefined'
    ? 100
    : Number(refundPercentage);
  const requestedAmount = amount === null || typeof amount === 'undefined'
    ? roundMoney(originalAmount * percentage / 100)
    : roundMoney(amount);

  const refundAmount = roundMoney(Math.min(requestedAmount, remainingAmount));
  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    return { skipped: true, reason: 'Refund amount is zero.' };
  }

  if (requestedAmount > remainingAmount + 0.01) {
    throw new Error('Refund amount exceeds the remaining refundable payment amount.');
  }

  await paymentModel.markRefundPending(bookingId, refundAmount);

  try {
    const { paymentIntentId, chargeId } = await getStripeRefundTarget(payment);
    const stripeRefund = await createRefund({
      paymentIntentId,
      chargeId,
      amount: refundAmount,
      reason,
      metadata: {
        booking_id: String(bookingId),
        merchant_id: String(booking.merchant_id || ''),
        payment_id: String(payment.payment_id || ''),
      },
      idempotencyKey: `booking-${bookingId}-refund-${Math.round(refundAmount * 100)}`,
    });

    const totalRefundedAmount = roundMoney(alreadyRefunded + refundAmount);
    await paymentModel.markRefundSucceeded(bookingId, {
      stripeRefundId: stripeRefund.id,
      stripeRefundStatus: stripeRefund.status,
      totalRefundedAmount,
      originalPaymentAmount: originalAmount,
    });

    return {
      skipped: false,
      stripeRefundId: stripeRefund.id,
      stripeRefundStatus: stripeRefund.status,
      refundAmount,
      totalRefundedAmount,
    };
  } catch (err) {
    await paymentModel.markRefundFailed(bookingId, refundAmount, err.type || err.code || 'failed').catch(logErr => {
      console.error('[refund] failed to persist refund failure:', logErr.message || logErr);
    });
    throw err;
  }
}

async function refundCancelledBookingByPolicy(bookingId) {
  const booking = await bookingModel.getBookingById(bookingId);
  if (!booking) {
    throw new Error('Booking not found for refund.');
  }

  const policy = await cancellationPolicyModel.getPolicyByMerchantId(booking.merchant_id);
  const decision = cancellationPolicyModel.calculateCustomerCancellationRefund({
    policy,
    bookingDate: booking.booking_date,
    bookingTime: booking.booking_time,
  });

  return refundBookingPayment(bookingId, {
    refundPercentage: decision.refundPercentage,
    reason: 'requested_by_customer',
  });
}

module.exports = {
  refundBookingPayment,
  refundCancelledBookingByPolicy,
};
