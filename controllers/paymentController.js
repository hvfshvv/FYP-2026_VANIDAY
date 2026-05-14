const {
  createPaymentIntent,
  retrievePaymentIntent,
  capturePaymentIntent,
  constructWebhookEvent,
  isTestModeKey,
} = require('../services/stripeService');
const { getPayNowDetails, generateTransactionRef }   = require('../services/paynowService');
const bookingModel = require('../models/bookingModel');
const paymentModel = require('../models/paymentModel');

async function showCheckout(req, res) {
  const { bookingId } = req.params;
  try {
    const booking = await bookingModel.getBookingById(bookingId);
    if (!booking) return res.redirect('/');

    const payment  = await paymentModel.getPaymentByBooking(bookingId);
    const amount   = Number(booking.payable_amount || booking.total_amount || booking.price);
    const paynow   = getPayNowDetails(bookingId, amount);

    res.render('payment/checkout', {
      title: 'Checkout',
      booking,
      payment,
      paynow,
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    });
  } catch (err) {
    console.error('showCheckout error:', err);
    res.redirect('/');
  }
}

function getBookingId(req) {
  return req.params.bookingId || req.body.bookingId;
}

function extractStripePaymentDetails(intent) {
  const latestCharge = intent.latest_charge && typeof intent.latest_charge === 'object'
    ? intent.latest_charge
    : null;
  const balanceTransaction = latestCharge && latestCharge.balance_transaction
    ? latestCharge.balance_transaction
    : null;
  const balanceTransactionId = balanceTransaction && typeof balanceTransaction === 'object'
    ? balanceTransaction.id
    : balanceTransaction;

  return {
    paymentStatus: intent.status === 'succeeded' ? 'paid' : intent.status === 'canceled' ? 'failed' : 'pending',
    paymentRef: intent.id,
    paymentIntentId: intent.id,
    latestChargeId: latestCharge ? latestCharge.id : intent.latest_charge,
    balanceTransactionId: balanceTransactionId || null,
    stripeStatus: intent.status,
    amount: Number(intent.amount_received || intent.amount || 0) / 100,
    currency: intent.currency,
    receiptUrl: latestCharge ? latestCharge.receipt_url : null,
  };
}

async function persistStripePaymentIntent(intent) {
  const bookingId = intent.metadata && intent.metadata.booking_id;
  if (!bookingId) {
    console.warn('[stripe] PaymentIntent missing booking_id metadata', intent.id);
    return null;
  }

  const expandedIntent = intent.latest_charge && typeof intent.latest_charge === 'object'
    ? intent
    : await retrievePaymentIntent(intent.id);
  const details = extractStripePaymentDetails(expandedIntent);

  console.log('[stripe] persist PaymentIntent', {
    id: expandedIntent.id,
    status: expandedIntent.status,
    latestCharge: details.latestChargeId,
    balanceTransaction: details.balanceTransactionId,
    testModeKey: isTestModeKey(),
  });

  await paymentModel.updateStripePaymentDetails(bookingId, details);
  if (details.paymentStatus === 'paid') {
    await bookingModel.updateBookingStatus(bookingId, 'confirmed');
  }

  return { bookingId, details };
}

async function createStripeIntent(req, res) {
  const bookingId = getBookingId(req);
  try {
    if (!bookingId) return res.status(400).json({ error: 'Missing booking id' });

    const booking = await bookingModel.getBookingById(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const amount = Number(booking.payable_amount || booking.total_amount || booking.price);
    const intent = await createPaymentIntent(amount, booking);

    await paymentModel.createOrUpdatePayment(bookingId, amount, 'stripe');
    res.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
  } catch (err) {
    console.error('createStripeIntent error:', err);
    res.status(500).json({ error: 'Failed to initialise payment' });
  }
}

async function confirmStripePayment(req, res) {
  const { bookingId } = req.params;
  const { paymentIntentId } = req.body;
  try {
    if (!paymentIntentId) return res.status(400).json({ error: 'Missing paymentIntentId' });

    let intent = await retrievePaymentIntent(paymentIntentId);
    if (String(intent.metadata.booking_id) !== String(bookingId)) {
      return res.status(400).json({ error: 'Payment does not match this booking' });
    }

    console.log('[stripe] confirm result', {
      id: intent.id,
      status: intent.status,
      latestCharge: intent.latest_charge && typeof intent.latest_charge === 'object' ? intent.latest_charge.id : intent.latest_charge,
      testModeKey: isTestModeKey(),
    });

    if (intent.status === 'requires_capture') {
      await capturePaymentIntent(intent.id);
      intent = await retrievePaymentIntent(intent.id);
      console.log('[stripe] captured manual PaymentIntent', { id: intent.id, status: intent.status });
    }

    if (intent.status !== 'succeeded') {
      return res.status(400).json({ error: 'Payment has not succeeded' });
    }

    const booking = await bookingModel.getBookingById(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const amount = Number(booking.payable_amount || booking.total_amount || booking.price);
    await paymentModel.createOrUpdatePayment(bookingId, amount, 'stripe');
    await persistStripePaymentIntent(intent);
    res.json({ success: true, redirectUrl: `/payment/success?booking_id=${bookingId}` });
  } catch (err) {
    console.error('confirmStripePayment error:', err);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
}

async function handleStripeWebhook(req, res) {
  let event;
  try {
    event = constructWebhookEvent(req.body, req.headers['stripe-signature']);
  } catch (err) {
    console.error('[stripe] webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      await persistStripePaymentIntent(event.data.object);
    } else if (event.type === 'payment_intent.payment_failed') {
      const result = await persistStripePaymentIntent(event.data.object);
      if (result) {
        await paymentModel.updatePaymentStatus(result.bookingId, 'failed', event.data.object.id);
      }
    } else if (event.type === 'charge.updated') {
      const charge = event.data.object;
      if (charge.payment_intent) {
        const intent = await retrievePaymentIntent(charge.payment_intent);
        await persistStripePaymentIntent(intent);
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error('[stripe] webhook handling error:', err);
    res.status(500).json({ error: 'Webhook handling failed' });
  }
}

async function markStripePaymentFailed(req, res) {
  const { bookingId } = req.params;
  const { paymentIntentId } = req.body;
  try {
    if (!paymentIntentId) return res.status(400).json({ error: 'Missing paymentIntentId' });

    const intent = await retrievePaymentIntent(paymentIntentId);
    if (String(intent.metadata.booking_id) !== String(bookingId)) {
      return res.status(400).json({ error: 'Payment does not match this booking' });
    }

    await paymentModel.updatePaymentStatus(bookingId, 'failed', intent.id);
    res.json({ success: true });
  } catch (err) {
    console.error('markStripePaymentFailed error:', err);
    res.status(500).json({ error: 'Failed to save payment failure' });
  }
}

async function confirmPayNow(req, res) {
  const { bookingId } = req.params;
  try {
    const booking = await bookingModel.getBookingById(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const amount = Number(booking.payable_amount || booking.total_amount || booking.price);
    const ref    = generateTransactionRef(bookingId);

    await paymentModel.createOrUpdatePayment(bookingId, amount, 'paynow');
    await paymentModel.updatePaymentStatus(bookingId, 'paid', ref);
    await bookingModel.updateBookingStatus(bookingId, 'confirmed');
    res.json({ success: true, redirectUrl: `/payment/success?booking_id=${bookingId}` });
  } catch (err) {
    console.error('confirmPayNow error:', err);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
}

async function paymentSuccess(req, res) {
  const { booking_id } = req.query;
  try {
    const existing = await paymentModel.getPaymentByBooking(booking_id);
    if (!existing || existing.payment_status !== 'paid') {
      return res.redirect(`/payment/checkout/${booking_id}`);
    }
    const booking = await bookingModel.getBookingById(booking_id);
    res.render('payment/success', { title: 'Payment Successful', booking, payment: existing });
  } catch (err) {
    console.error('paymentSuccess error:', err);
    res.redirect('/');
  }
}

module.exports = {
  showCheckout,
  createStripeIntent,
  confirmStripePayment,
  markStripePaymentFailed,
  handleStripeWebhook,
  confirmPayNow,
  paymentSuccess,
};
