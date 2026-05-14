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

async function createPayNowCheckoutSession({ booking, amount, successUrl, cancelUrl, userId }) {
  assertStripeConfigured();
  const amountInCents = Math.round(Number(amount) * 100);
  if (!Number.isInteger(amountInCents) || amountInCents < 50) {
    throw new Error('Invalid payment amount');
  }

  const metadata = {
    booking_id: String(booking.booking_id),
    merchant_name: booking.merchant_name || '',
    service_name: booking.service_name || '',
  };
  if (userId) metadata.user_id = String(userId);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['paynow'],
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'sgd',
        product_data: {
          name: booking.service_name || 'Uniday booking',
          description: booking.merchant_name ? `at ${booking.merchant_name}` : undefined,
        },
        unit_amount: amountInCents,
      },
      quantity: 1,
    }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
    payment_intent_data: {
      capture_method: 'automatic',
      metadata,
    },
  });

  console.log('[stripe] created PayNow Checkout Session', {
    sessionId: session.id,
    paymentIntentId: session.payment_intent,
    bookingId: booking.booking_id,
    selectedPaymentMethod: 'paynow',
    testModeKey: isTestModeKey(),
  });

  return session;
}

async function retrieveCheckoutSession(sessionId) {
  assertStripeConfigured();
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['payment_intent.latest_charge.balance_transaction'],
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
  createPayNowCheckoutSession,
  retrieveCheckoutSession,
  retrievePaymentIntent,
  capturePaymentIntent,
  constructWebhookEvent,
  isTestModeKey,
};
