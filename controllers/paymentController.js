const {
  createPaymentIntent,
  createPayNowCheckoutSession,
  retrieveCheckoutSession,
  retrievePaymentIntent,
  capturePaymentIntent,
  constructWebhookEvent,
  isTestModeKey,
} = require('../services/stripeService');
const { buildReceiptPdf } = require('../services/receiptPdfService');
const bookingModel = require('../models/bookingModel');
const paymentModel = require('../models/paymentModel');
const loyaltyModel = require('../models/loyaltyModel');
const promotionModel = require('../models/promotionModel');
const voucherModel = require('../models/voucherModel');

function hasGuestBookingAccess(req, bookingId) {
  // Allow guests to pay only for bookings created in their session.
  return Array.isArray(req.session.guestBookingIds)
    && req.session.guestBookingIds.includes(String(bookingId));
}

function canAccessBooking(req, booking) {
  // Protect payment pages from unrelated users.
  if (!booking) return false;

  const user = req.session.user;
  if (hasGuestBookingAccess(req, booking.booking_id) && !booking.customer_id) {
    return true;
  }

  if (!user) return false;
  if (user.role === 'admin') return true;

  if (user.role === 'merchant') {
    return String(user.merchant_id || '') === String(booking.merchant_id);
  }

  if (user.role === 'customer') {
    return String(user.customer_id || user.user_id || '') === String(booking.customer_id);
  }

  return false;
}

function formatDateOnly(value) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return String(value || '').slice(0, 10);
}

async function getAuthorizedBooking(req, res, bookingId, { json = false } = {}) {
  // Load booking and confirm the current user can access it.
  if (!bookingId) {
    if (json) res.status(400).json({ error: 'Missing booking id' });
    else res.status(400).send('Missing booking id.');
    return null;
  }

  const booking = await bookingModel.getBookingById(bookingId);

  if (!booking) {
    if (json) res.status(404).json({ error: 'Booking not found' });
    else res.redirect('/');
    return null;
  }

  if (!canAccessBooking(req, booking)) {
    if (json) res.status(403).json({ error: 'You do not have access to this booking' });
    else res.status(403).send('You do not have access to this booking.');
    return null;
  }

  return booking;
}

async function confirmPaidBooking(bookingId) {
  // Confirm booking only after successful payment.
  await bookingModel.updateBookingStatus(bookingId, 'confirmed');

  try {
    await loyaltyModel.awardBookingPoints(bookingId);
  } catch (err) {
    console.error('loyalty award failed:', err);
  }

  try {
    const booking = await bookingModel.getBookingById(bookingId);
    // Only customer bookings can have vouchers; guest bookings have no customer_id.
    if (booking && booking.applied_cv_id && booking.customer_id) {
      const marked = await voucherModel.markVoucherUsed(booking.applied_cv_id, booking.customer_id);
      if (!marked) {
        // Already used (duplicate confirm call) or ownership mismatch; safe to continue.
        console.warn('[voucher] cv_id %d not marked used for booking %d (already used or wrong owner)', booking.applied_cv_id, bookingId);
      }
    }
  } catch (err) {
    console.error('voucher mark-used failed:', err);
  }
}

async function showCheckout(req, res) {
  const { bookingId } = req.params;
  try {
    await bookingModel.expirePendingPaymentBookings();

    // Show checkout only for an authorized booking.
    let booking = await getAuthorizedBooking(req, res, bookingId);
    if (!booking) return;

    if (booking.status !== 'pending_payment') {
      const message = 'This payment session has expired or is no longer payable. Please make a new booking.';
      if (req.session.user && req.session.user.role === 'customer') {
        return res.redirect('/book/viewBookings?error=' + encodeURIComponent(message));
      }
      return res.status(410).send(message);
    }

    // Auto-detect the best promotion for this booking's merchant, service, and date.
    const bookingDate = formatDateOnly(booking.booking_date);
    const baseAmount = Number(booking.total_amount || booking.price);

    const promo = await promotionModel.getApplicablePromotionForBooking({
      merchantId:  booking.merchant_id,
      serviceId:   booking.service_id,
      bookingDate,
      baseAmount,
    });

    if (promo) {
      const discountAmount = parseFloat((baseAmount * promo.discount_pct / 100).toFixed(2));
      const promoChanged = String(booking.applied_promo_id) !== String(promo.promo_id)
        || Number(booking.discount_amount) !== discountAmount;
      if (promoChanged) {
        await bookingModel.applyPromotion(bookingId, promo.promo_id, discountAmount);
        booking = await bookingModel.getBookingById(bookingId);
      }
    } else if (booking.applied_promo_id) {
      // Clear a stale promotion that no longer qualifies.
      await bookingModel.applyPromotion(bookingId, null, 0);
      booking = await bookingModel.getBookingById(bookingId);
    }

    const payment = await paymentModel.getPaymentByBooking(bookingId);

    const user = req.session.user;
    const eligibleVouchers = (user && user.role === 'customer')
      ? await voucherModel.getEligibleCustomerVouchers(
          user.customer_id || user.user_id,
          booking.merchant_id
        )
      : [];

    let appliedVoucher = booking.applied_cv_id
      ? (eligibleVouchers.find(v => Number(v.cv_id) === Number(booking.applied_cv_id)) || null)
      : null;

    if (booking.applied_cv_id && !appliedVoucher) {
      await bookingModel.applyVoucher(bookingId, null, 0);
      booking = await bookingModel.getBookingById(bookingId);
      appliedVoucher = null;
    }

    res.render('payment/checkout', {
      title: 'Checkout',
      booking,
      payment,
      appliedPromotion: promo || null,
      eligibleVouchers,
      appliedVoucher,
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      webhookError: req.query.webhookError || null,
      voucherError: req.query.voucherError || null,
    });
  } catch (err) {
    console.error('showCheckout error:', err);
    res.redirect('/');
  }
}

function getBaseUrl(req) {
  return process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
}

function getBookingId(req) {
  return req.params.bookingId || req.body.bookingId;
}

function extractStripePaymentDetails(intent) {
  // Convert Stripe result into payment fields we store.
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
    checkoutSessionId: null,
  };
}

async function persistStripePaymentIntent(intent) {
  // Save Stripe card payment result and confirm paid bookings.
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
    await confirmPaidBooking(bookingId);
  }

  return { bookingId, details };
}

async function persistCheckoutSession(session) {
  // Save PayNow checkout result after Stripe redirects back.
  const bookingId = session.metadata && session.metadata.booking_id;
  if (!bookingId) {
    console.warn('[stripe] Checkout Session missing booking_id metadata', session.id);
    return null;
  }

  const paymentIntent = session.payment_intent && typeof session.payment_intent === 'object'
    ? session.payment_intent
    : session.payment_intent
      ? await retrievePaymentIntent(session.payment_intent)
      : null;

  console.log('[stripe] persist Checkout Session', {
    sessionId: session.id,
    paymentIntentId: paymentIntent ? paymentIntent.id : session.payment_intent,
    paymentStatus: session.payment_status,
    selectedPaymentMethod: 'paynow',
    testModeKey: isTestModeKey(),
  });

  if (!paymentIntent) {
    await paymentModel.updateStripeCheckoutSession(bookingId, session.id, null);
    return { bookingId, details: null };
  }

  const expandedIntent = paymentIntent.latest_charge && typeof paymentIntent.latest_charge === 'object'
    ? paymentIntent
    : await retrievePaymentIntent(paymentIntent.id);
  const details = {
    ...extractStripePaymentDetails(expandedIntent),
    checkoutSessionId: session.id,
  };

  await paymentModel.updateStripePaymentDetails(bookingId, details);
  if (details.paymentStatus === 'paid') {
    await confirmPaidBooking(bookingId);
  }
  return { bookingId, details };
}

async function createStripeIntent(req, res) {
  const bookingId = getBookingId(req);
  try {
    // Start card payment for this booking.
    const booking = await getAuthorizedBooking(req, res, bookingId, { json: true });
    if (!booking) return;

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

    const booking = await getAuthorizedBooking(req, res, bookingId, { json: true });
    if (!booking) return;

    let intent = await retrievePaymentIntent(paymentIntentId);
    // Make sure the Stripe payment belongs to this booking.
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

    // Save successful payment and send customer to success page.
    const amount = Number(booking.payable_amount || booking.total_amount || booking.price);
    await paymentModel.createOrUpdatePayment(bookingId, amount, 'stripe');
    await persistStripePaymentIntent(intent);
    res.json({ success: true, redirectUrl: `/payment/success?booking_id=${bookingId}` });
  } catch (err) {
    console.error('confirmStripePayment error:', err);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
}

async function createPayNowSession(req, res) {
  const { bookingId } = req.params;
  try {
    // Start PayNow QR checkout for this booking.
    const booking = await getAuthorizedBooking(req, res, bookingId, { json: true });
    if (!booking) return;

    const amount = Number(booking.payable_amount || booking.total_amount || booking.price);
    const baseUrl = getBaseUrl(req);
    const session = await createPayNowCheckoutSession({
      booking,
      amount,
      successUrl: `${baseUrl}/payment/success?booking_id=${bookingId}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/payment/checkout/${bookingId}`,
      userId: req.session.user && req.session.user.user_id,
    });

    console.log('[stripe] selected payment method', {
      selectedPaymentMethod: 'paynow',
      checkoutSessionId: session.id,
      paymentIntentId: session.payment_intent,
    });

    await paymentModel.createOrUpdatePayment(bookingId, amount, 'paynow');
    await paymentModel.updateStripeCheckoutSession(bookingId, session.id, session.payment_intent);
    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('createPayNowSession error:', err);
    res.status(500).json({ error: 'Failed to initialise PayNow payment' });
  }
}

async function handleStripeWebhook(req, res) {
  let event;
  try {
    // Verify Stripe sent this payment update.
    event = constructWebhookEvent(req.body, req.headers['stripe-signature']);
  } catch (err) {
    console.error('[stripe] webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    console.log('[stripe] webhook event', { type: event.type });
    if (event.type === 'payment_intent.succeeded') {
      await persistStripePaymentIntent(event.data.object);
    } else if (event.type === 'payment_intent.payment_failed') {
      const result = await persistStripePaymentIntent(event.data.object);
      if (result) {
        await paymentModel.updatePaymentStatus(result.bookingId, 'failed', event.data.object.id);
      }
    } else if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = await retrieveCheckoutSession(event.data.object.id);
      await persistCheckoutSession(session);
    } else if (event.type === 'checkout.session.async_payment_failed') {
      const session = await retrieveCheckoutSession(event.data.object.id);
      const bookingId = session.metadata && session.metadata.booking_id;
      if (bookingId) {
        await paymentModel.updateStripeCheckoutSession(bookingId, session.id, session.payment_intent);
        await paymentModel.updatePaymentStatus(bookingId, 'failed', session.payment_intent || session.id);
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

    const booking = await getAuthorizedBooking(req, res, bookingId, { json: true });
    if (!booking) return;

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

async function paymentSuccess(req, res) {
  const { booking_id, session_id } = req.query;
  try {
    // Re-check payment before showing the success page.
    const booking = await getAuthorizedBooking(req, res, booking_id);
    if (!booking) return;

    if (session_id) {
      const session = await retrieveCheckoutSession(session_id);
      console.log('[stripe] success page session lookup', {
        checkoutSessionId: session.id,
        paymentIntentId: session.payment_intent && typeof session.payment_intent === 'object' ? session.payment_intent.id : session.payment_intent,
        paymentStatus: session.payment_status,
      });
      if (session.payment_status === 'paid') {
        await persistCheckoutSession(session);
      }
    }

    const existing = await paymentModel.getPaymentByBooking(booking_id);
    if (!existing || existing.payment_status !== 'paid') {
      return res.redirect(`/payment/checkout/${booking_id}`);
    }
    const loyaltyEarned = booking && booking.customer_id
      ? await loyaltyModel.getEarnedPointsForBooking(booking_id).catch(() => 0)
      : 0;
    res.render('payment/success', { title: 'Payment Successful', booking, payment: existing, loyaltyEarned });
  } catch (err) {
    console.error('paymentSuccess error:', err);
    res.redirect('/');
  }
}

async function applyVoucher(req, res) {
  const { bookingId } = req.params;
  const cvId = req.body.cvId ? parseInt(req.body.cvId, 10) : null;

  try {
    await bookingModel.expirePendingPaymentBookings();

    const booking = await getAuthorizedBooking(req, res, bookingId);
    if (!booking) return;

    if (booking.status !== 'pending_payment') {
      return res.redirect('/book/viewBookings?error=' + encodeURIComponent('This payment session is no longer payable.'));
    }

    const user = req.session.user;
    if (!user || user.role !== 'customer') {
      return res.redirect(`/payment/checkout/${bookingId}`);
    }

    // Remove voucher when no cvId supplied.
    if (!cvId) {
      await bookingModel.applyVoucher(bookingId, null, 0);
      return res.redirect(`/payment/checkout/${bookingId}`);
    }

    const customerId = user.customer_id || user.user_id;
    const eligible = await voucherModel.getEligibleCustomerVouchers(customerId, booking.merchant_id);
    const voucher = eligible.find(v => Number(v.cv_id) === cvId);

    if (!voucher) {
      return res.redirect(`/payment/checkout/${bookingId}?voucherError=` + encodeURIComponent('This voucher is not available for this booking.'));
    }

    // Base after promotion discount, before any voucher discount.
    const base = Number(booking.total_amount || booking.price);
    const promoDiscount = Number(booking.discount_amount || 0);
    const afterPromo = base - promoDiscount;

    if (voucher.min_spend && afterPromo < Number(voucher.min_spend)) {
      return res.redirect(`/payment/checkout/${bookingId}?voucherError=` + encodeURIComponent(`Minimum spend of S$${Number(voucher.min_spend).toFixed(2)} required.`));
    }

    let voucherDiscount;
    if (voucher.discount_type === 'percent') {
      voucherDiscount = parseFloat((afterPromo * Number(voucher.discount_value) / 100).toFixed(2));
    } else {
      voucherDiscount = Math.min(Number(voucher.discount_value), afterPromo);
    }
    voucherDiscount = parseFloat(Math.min(voucherDiscount, afterPromo).toFixed(2));

    await bookingModel.applyVoucher(bookingId, cvId, voucherDiscount);
    return res.redirect(`/payment/checkout/${bookingId}`);
  } catch (err) {
    console.error('applyVoucher error:', err);
    return res.redirect(`/payment/checkout/${bookingId}`);
  }
}

async function downloadReceipt(req, res) {
  const { bookingId } = req.params;
  try {
    // Generate receipt only for paid bookings.
    const booking = await getAuthorizedBooking(req, res, bookingId);
    if (!booking) return;

    const payment = await paymentModel.getPaymentByBooking(bookingId);

    if (!booking || !payment || payment.payment_status !== 'paid') {
      return res.status(404).send('Receipt not available.');
    }

    const pdf = buildReceiptPdf({ booking, payment });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="uniday-receipt-${bookingId}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  } catch (err) {
    console.error('downloadReceipt error:', err);
    res.status(500).send('Could not generate receipt.');
  }
}

module.exports = {
  showCheckout,
  createStripeIntent,
  confirmStripePayment,
  createPayNowSession,
  markStripePaymentFailed,
  handleStripeWebhook,
  paymentSuccess,
  downloadReceipt,
  applyVoucher,
};

