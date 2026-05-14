const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

function assertStripeConfigured() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Missing STRIPE_SECRET_KEY');
  }
}

async function createPaymentIntent(amount, booking) {
  assertStripeConfigured();
  const amountInCents = Math.round(Number(amount) * 100);
  if (!Number.isInteger(amountInCents) || amountInCents < 50) {
    throw new Error('Invalid payment amount');
  }

  const intent = await stripe.paymentIntents.create({
    amount: amountInCents,
    currency: 'sgd',
    capture_method: 'automatic',
    payment_method_types: ['card'],
    metadata: {
      booking_id: String(booking.booking_id),
      merchant_name: booking.merchant_name || '',
      service_name: booking.service_name || '',
    },
  });

  console.log('[stripe] created PaymentIntent', {
    id: intent.id,
    status: intent.status,
    amount: intent.amount,
    currency: intent.currency,
    testModeKey: isTestModeKey(),
  });

  return intent;
}

async function retrievePaymentIntent(paymentIntentId) {
  assertStripeConfigured();
  return stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ['latest_charge.balance_transaction'],
  });
}

async function capturePaymentIntent(paymentIntentId) {
  assertStripeConfigured();
  return stripe.paymentIntents.capture(paymentIntentId);
}

function constructWebhookEvent(rawBody, signature) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('Missing STRIPE_WEBHOOK_SECRET');
  }
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

function isTestModeKey() {
  return (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_');
}

module.exports = {
  createPaymentIntent,
  retrievePaymentIntent,
  capturePaymentIntent,
  constructWebhookEvent,
  isTestModeKey,
};
