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
const bookingNotificationModel = require('../models/bookingNotificationModel');
const paymentModel = require('../models/paymentModel');
const loyaltyModel = require('../models/loyaltyModel');
const emailService = require('../services/emailService');
const promotionModel = require('../models/promotionModel');
const voucherModel = require('../models/voucherModel');
const cancellationPolicyModel = require('../models/cancellationPolicyModel');
const whatsappNotificationService = require('../services/whatsappNotificationService');
const notificationModel = require('../models/notificationModel');

const MIN_STRIPE_CHECKOUT_HOLD_MINUTES = 31;

function getRedirectPaymentHoldMinutes() {
  const configured = Number(process.env.REDIRECT_PAYMENT_HOLD_MINUTES);
  return Number.isFinite(configured) && configured >= MIN_STRIPE_CHECKOUT_HOLD_MINUTES
    ? Math.ceil(configured)
    : MIN_STRIPE_CHECKOUT_HOLD_MINUTES;
}

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

function bookingEmailRecipients(booking) {
  return [
    {
      kind: 'customer',
      email: booking.customer_email,
      name: booking.customer_name,
    },
    {
      kind: 'merchant',
      email: booking.merchant_email,
      name: booking.merchant_name,
    },
  ].filter(recipient => recipient.email);
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

function getBookingBaseAmount(booking) {
  const totalAmount = Number(booking.total_amount);
  if (Number.isFinite(totalAmount) && totalAmount > 0) return totalAmount;

  const servicePrice = Number(booking.price);
  return Number.isFinite(servicePrice) && servicePrice > 0 ? servicePrice : 0;
}

function getBookingPayableAmount(booking) {
  const payableAmount = Number(booking.payable_amount);
  if (Number.isFinite(payableAmount) && payableAmount > 0) return payableAmount;

  const base = getBookingBaseAmount(booking);
  const promoDiscount = Number(booking.discount_amount || 0);
  const voucherDiscount = Number(booking.voucher_discount_amount || 0);
  return parseFloat(Math.max(base - promoDiscount - voucherDiscount, 0).toFixed(2));
}

function getVoucherPricingContext(booking) {
  const base = getBookingBaseAmount(booking);
  const promoDiscount = Number(booking.discount_amount || 0);
  return {
    qualificationAmount: parseFloat(Math.max(base, 0).toFixed(2)),
    discountBase: parseFloat(Math.max(base - promoDiscount, 0).toFixed(2)),
  };
}

function calculateVoucherDiscount(voucher, discountBase) {
  const discountValue = Number(voucher.discount_value || 0);
  const rawDiscount = voucher.discount_type === 'percent'
    ? discountBase * discountValue / 100
    : discountValue;

  return parseFloat(Math.min(Math.max(rawDiscount, 0), discountBase).toFixed(2));
}

function buildVoucherOptions(vouchers, pricingContext, appliedCvId = null) {
  const { qualificationAmount, discountBase } = pricingContext;

  const options = vouchers.map(voucher => {
    const minSpend = Number(voucher.min_spend || 0);
    // Voucher min spend is checked before promotion discount so promos and vouchers can stack.
    const meetsMinSpend = !minSpend || qualificationAmount >= minSpend;
    const discountAmount = meetsMinSpend ? calculateVoucherDiscount(voucher, discountBase) : 0;
    const isUsable = meetsMinSpend && discountAmount > 0;

    return {
      ...voucher,
      discountAmount,
      isUsable,
      isApplied: String(voucher.cv_id) === String(appliedCvId || ''),
      unavailableReason: !meetsMinSpend
        ? `Minimum spend S$${minSpend.toFixed(2)} required`
        : discountAmount <= 0
          ? 'Not usable for this booking'
          : null,
    };
  });

  const best = options
    .filter(voucher => voucher.isUsable)
    .sort((a, b) => {
      const discountDiff = Number(b.discountAmount) - Number(a.discountAmount);
      if (discountDiff) return discountDiff;
      return (Date.parse(a.voucher_expiry) || 0) - (Date.parse(b.voucher_expiry) || 0);
    })[0];

  if (best) best.isBestValue = true;
  return options;
}

function getBestVoucherOption(options) {
  return options.find(voucher => voucher.isBestValue) || null;
}

async function syncBestPromotion(booking) {
  const bookingDate = formatDateOnly(booking.booking_date);
  const baseAmount = getBookingBaseAmount(booking);

  const promo = await promotionModel.getApplicablePromotionForBooking({
    merchantId: booking.merchant_id,
    serviceId: booking.service_id,
    bookingDate,
    baseAmount,
  });

  let currentBooking = booking;
  if (promo) {
    const discountAmount = parseFloat((baseAmount * Number(promo.discount_pct || 0) / 100).toFixed(2));
    const promoChanged = String(currentBooking.applied_promo_id || '') !== String(promo.promo_id)
      || Number(currentBooking.discount_amount || 0) !== discountAmount;

    if (promoChanged) {
      await bookingModel.applyPromotion(currentBooking.booking_id, promo.promo_id, discountAmount);
      currentBooking = await bookingModel.getBookingById(currentBooking.booking_id);
    }
  } else if (currentBooking.applied_promo_id || Number(currentBooking.discount_amount || 0) > 0) {
    await bookingModel.applyPromotion(currentBooking.booking_id, null, 0);
    currentBooking = await bookingModel.getBookingById(currentBooking.booking_id);
  }

  return { booking: currentBooking, appliedPromotion: promo || null };
}

async function syncCheckoutVoucher(booking, customerId, { autoSelectBest = true } = {}) {
  let currentBooking = booking;
  let vouchers = await voucherModel.getEligibleCustomerVouchers(customerId, currentBooking.merchant_id);
  let voucherOptions = buildVoucherOptions(vouchers, getVoucherPricingContext(currentBooking), currentBooking.applied_cv_id);
  let appliedVoucher = currentBooking.applied_cv_id
    ? voucherOptions.find(voucher => Number(voucher.cv_id) === Number(currentBooking.applied_cv_id)) || null
    : null;

  if (currentBooking.applied_cv_id && (!appliedVoucher || !appliedVoucher.isUsable)) {
    await bookingModel.applyVoucher(currentBooking.booking_id, null, 0);
    currentBooking = await bookingModel.getBookingById(currentBooking.booking_id);
    voucherOptions = buildVoucherOptions(vouchers, getVoucherPricingContext(currentBooking));
    appliedVoucher = null;
  }

  const bestVoucher = getBestVoucherOption(voucherOptions);
  if (!appliedVoucher && autoSelectBest && bestVoucher) {
    await bookingModel.applyVoucher(currentBooking.booking_id, bestVoucher.cv_id, bestVoucher.discountAmount);
    currentBooking = await bookingModel.getBookingById(currentBooking.booking_id);
    voucherOptions = buildVoucherOptions(vouchers, getVoucherPricingContext(currentBooking), bestVoucher.cv_id);
    appliedVoucher = voucherOptions.find(voucher => Number(voucher.cv_id) === Number(bestVoucher.cv_id)) || null;
  } else if (
    appliedVoucher
    && Number(currentBooking.voucher_discount_amount || 0) !== Number(appliedVoucher.discountAmount || 0)
  ) {
    await bookingModel.applyVoucher(currentBooking.booking_id, appliedVoucher.cv_id, appliedVoucher.discountAmount);
    currentBooking = await bookingModel.getBookingById(currentBooking.booking_id);
    voucherOptions = buildVoucherOptions(vouchers, getVoucherPricingContext(currentBooking), appliedVoucher.cv_id);
    appliedVoucher = voucherOptions.find(voucher => Number(voucher.cv_id) === Number(appliedVoucher.cv_id)) || null;
  }

  return { booking: currentBooking, voucherOptions, appliedVoucher };
}

async function revalidateAppliedVoucherForPayment(booking) {
  if (!booking.applied_cv_id || !booking.customer_id) return booking;

  const vouchers = await voucherModel.getEligibleCustomerVouchers(booking.customer_id, booking.merchant_id);
  const voucherOptions = buildVoucherOptions(vouchers, getVoucherPricingContext(booking), booking.applied_cv_id);
  const appliedVoucher = voucherOptions.find(voucher => Number(voucher.cv_id) === Number(booking.applied_cv_id));

  if (!appliedVoucher || !appliedVoucher.isUsable) {
    await bookingModel.applyVoucher(booking.booking_id, null, 0);
    const err = new Error('Selected voucher is no longer eligible. Please refresh checkout.');
    err.statusCode = 400;
    throw err;
  }

  if (Number(booking.voucher_discount_amount || 0) !== Number(appliedVoucher.discountAmount || 0)) {
    await bookingModel.applyVoucher(booking.booking_id, appliedVoucher.cv_id, appliedVoucher.discountAmount);
    return bookingModel.getBookingById(booking.booking_id);
  }

  return booking;
}

async function revalidateCheckoutDiscountsForPayment(booking) {
  const promoSync = await syncBestPromotion(booking);
  const currentBooking = await revalidateAppliedVoucherForPayment(promoSync.booking);
  return { booking: currentBooking, appliedPromotion: promoSync.appliedPromotion };
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
  await bookingNotificationModel.expirePendingPaymentBookings();
  const current = await bookingModel.getBookingById(bookingId);
  if (!current) return;
  if (!['pending_payment', 'confirmed'].includes(current.status)) {
    console.warn('[payment] Refusing to confirm expired/non-payable booking %s with status %s', bookingId, current.status);
    return;
  }

  if (current.status === 'pending_payment') {
    // Confirm booking only after successful payment.
    await bookingModel.updateBookingStatus(bookingId, 'confirmed');
  }

  try {
    const confirmedBooking = await bookingModel.getBookingById(bookingId);
    await notificationModel.notifyBookingConfirmed(confirmedBooking);
  } catch (err) {
    console.error('assistant booking confirmation failed:', err);
  }

  if (current.source === 'whatsapp') {
    try {
      const confirmedBooking = await bookingModel.getBookingById(bookingId);
      const alreadySent = await bookingNotificationModel.hasSentWhatsAppNotification(bookingId, 'confirmation');
      if (!alreadySent) {
        const result = await whatsappNotificationService.sendBookingConfirmation(confirmedBooking);
        if (result && result.skipped) {
          console.warn('[whatsapp] confirmation skipped for booking %s: %s', bookingId, result.reason);
        }
        await bookingNotificationModel.recordWhatsAppNotification(
          confirmedBooking,
          'confirmation',
          `WhatsApp booking confirmation for booking #${bookingId}`,
          result && result.skipped ? 'failed' : 'sent'
        );
      }
    } catch (err) {
      console.error('[whatsapp] confirmation failed for booking %s:', bookingId, err.message || err);
      try {
        const booking = await bookingModel.getBookingById(bookingId);
        if (booking) {
          await bookingNotificationModel.recordWhatsAppNotification(
            booking,
            'confirmation',
            `WhatsApp booking confirmation for booking #${bookingId}`,
            'failed'
          );
        }
      } catch (logErr) {
        console.error('[whatsapp] failed to record confirmation status for booking %s:', bookingId, logErr.message || logErr);
      }
    }
  }

  try {
    await loyaltyModel.awardBookingPoints(bookingId);
  } catch (err) {
    console.error('loyalty award failed:', err);
  }

  try {
    const booking = await bookingModel.getBookingById(bookingId);
    if (booking) {
      const baseUrl = (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
      const receiptUrl = `${baseUrl}/payment/receipt/${bookingId}.pdf`;
      const recipients = bookingEmailRecipients(booking);

      for (const recipient of recipients) {
        const alreadySent = await bookingNotificationModel.hasSentEmailNotification(
          bookingId,
          'confirmation',
          recipient.kind
        );

        if (!alreadySent) {
          const result = await emailService.sendBookingConfirmationEmail(
            booking,
            receiptUrl,
            recipient
          );

          await bookingNotificationModel.recordEmailNotification(
            booking,
            'confirmation',
            `confirmation email to ${recipient.kind} (${recipient.email}) for booking #${bookingId}`,
            result.sent ? 'sent' : 'failed'
          );
        }
      }
    }

    // Only customer bookings can have vouchers; guest bookings have no customer_id.
    if (booking && booking.applied_cv_id && booking.customer_id) {
      const marked = await voucherModel.markVoucherUsed(booking.applied_cv_id, booking.customer_id);
      if (!marked) {
        // Already used (duplicate confirm call) or ownership mismatch; safe to continue.
        console.warn('[voucher] cv_id %d not marked used for booking %d (already used or wrong owner)', booking.applied_cv_id, bookingId);
      }
    }
  } catch (err) {
    console.error('post-confirm booking actions failed:', err);
  }
}

async function showCheckout(req, res) {
  const { bookingId } = req.params;
  try {
    await bookingNotificationModel.expirePendingPaymentBookings();

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

    const promoSync = await syncBestPromotion(booking);
    booking = promoSync.booking;
    const appliedPromotion = promoSync.appliedPromotion;

    const payment = await paymentModel.getPaymentByBooking(bookingId);
    const cancellationPolicy = await cancellationPolicyModel.getPolicyByMerchantId(booking.merchant_id);

    const user = req.session.user;
    let voucherOptions = [];
    let appliedVoucher = null;

    if (user && user.role === 'customer') {
      const synced = await syncCheckoutVoucher(
        booking,
        user.customer_id || user.user_id,
        { autoSelectBest: req.query.manualVoucher !== 'none' }
      );
      booking = synced.booking;
      voucherOptions = synced.voucherOptions;
      appliedVoucher = synced.appliedVoucher;
    }

    res.render('payment/checkout', {
      title: 'Checkout',
      booking,
      payment,
      appliedPromotion,
      cancellationPolicy,
      cancellationPolicySummary: cancellationPolicyModel.getPolicySummary(cancellationPolicy),
      eligibleVouchers: voucherOptions,
      voucherOptions,
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

async function rejectLatePaidPaymentIfReleased(bookingId, details, context) {
  if (details.paymentStatus !== 'paid') return false;

  await bookingNotificationModel.expirePendingPaymentBookings();
  const booking = await bookingModel.getBookingById(bookingId);
  const existing = await paymentModel.getPaymentByBooking(bookingId);
  if (existing && existing.payment_status === 'paid') return false;

  const releasedStatuses = ['payment_failed', 'cancelled'];
  const holdExpired = booking
    && booking.status === 'pending_payment'
    && Number(booking.pending_remaining_seconds || 0) <= 0;

  if (booking && !releasedStatuses.includes(booking.status) && !holdExpired) return false;

  console.warn(
    '[stripe] Refusing late %s payment for booking %s with status %s',
    context,
    bookingId,
    booking ? booking.status : 'missing'
  );
  await paymentModel.updatePaymentStatus(bookingId, 'failed', details.paymentRef);
  return true;
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

  if (await rejectLatePaidPaymentIfReleased(bookingId, details, 'PaymentIntent')) {
    return {
      bookingId,
      details: { ...details, paymentStatus: 'failed' },
      latePayment: true,
    };
  }

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
    selectedPaymentMethod: session.metadata?.payment_method || 'checkout',
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

  if (await rejectLatePaidPaymentIfReleased(bookingId, details, 'Checkout')) {
    await paymentModel.updateStripeCheckoutSession(bookingId, session.id, details.paymentIntentId);
    return {
      bookingId,
      details: { ...details, paymentStatus: 'failed' },
      latePayment: true,
    };
  }

  await paymentModel.updateStripePaymentDetails(bookingId, details);
  if (details.paymentStatus === 'paid') {
    await confirmPaidBooking(bookingId);
  }
  return { bookingId, details };
}

async function createStripeIntent(req, res) {
  const bookingId = getBookingId(req);
  try {
    await bookingNotificationModel.expirePendingPaymentBookings();
    // Start card payment for this booking.
    let booking = await getAuthorizedBooking(req, res, bookingId, { json: true });
    if (!booking) return;
    if (booking.status !== 'pending_payment') {
      return res.status(410).json({ error: 'This payment session has expired. Please make a new booking.' });
    }

    ({ booking } = await revalidateCheckoutDiscountsForPayment(booking));
    const amount = getBookingPayableAmount(booking);
    const intent = await createPaymentIntent(amount, booking);

    await paymentModel.createOrUpdatePayment(bookingId, amount, 'stripe');
    res.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
  } catch (err) {
    console.error('createStripeIntent error:', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Failed to initialise payment' });
  }
}

async function confirmStripePayment(req, res) {
  const { bookingId } = req.params;
  const { paymentIntentId } = req.body;
  try {
    if (!paymentIntentId) return res.status(400).json({ error: 'Missing paymentIntentId' });

    await bookingNotificationModel.expirePendingPaymentBookings();
    let booking = await getAuthorizedBooking(req, res, bookingId, { json: true });
    if (!booking) return;
    if (booking.status !== 'pending_payment') {
      return res.status(410).json({ error: 'This payment session has expired. Please make a new booking.' });
    }

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

    ({ booking } = await revalidateCheckoutDiscountsForPayment(booking));
    const expectedAmount = getBookingPayableAmount(booking);
    const paidAmount = Number(intent.amount_received || intent.amount || 0) / 100;
    if (Math.abs(paidAmount - expectedAmount) > 0.01) {
      return res.status(400).json({ error: 'Payment amount no longer matches checkout total.' });
    }

    // Save successful payment and send customer to success page.
    const amount = getBookingPayableAmount(booking);
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
    await bookingNotificationModel.expirePendingPaymentBookings();
    // Start PayNow QR checkout for this booking.
    let booking = await getAuthorizedBooking(req, res, bookingId, { json: true });
    if (!booking) return;
    if (booking.status !== 'pending_payment') {
      return res.status(410).json({ error: 'This payment session has expired. Please make a new booking.' });
    }

    ({ booking } = await revalidateCheckoutDiscountsForPayment(booking));
    const amount = getBookingPayableAmount(booking);
    const baseUrl = getBaseUrl(req);
    const redirectHoldMinutes = getRedirectPaymentHoldMinutes();
    const checkoutExpiresAt = new Date(Date.now() + redirectHoldMinutes * 60 * 1000);
    const session = await createPayNowCheckoutSession({
      booking,
      amount,
      successUrl: `${baseUrl}/payment/success?booking_id=${bookingId}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/payment/checkout/${bookingId}`,
      userId: req.session.user && req.session.user.user_id,
      expiresAt: checkoutExpiresAt,
    });

    console.log('[stripe] selected payment method', {
      selectedPaymentMethod: 'paynow',
      checkoutSessionId: session.id,
      paymentIntentId: session.payment_intent,
      holdMinutes: redirectHoldMinutes,
    });

    await paymentModel.createOrUpdatePayment(bookingId, amount, 'paynow', {
      holdMinutes: redirectHoldMinutes,
    });
    await paymentModel.updateStripeCheckoutSession(bookingId, session.id, session.payment_intent);
    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('createPayNowSession error:', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Failed to initialise PayNow payment' });
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

    // Failed/cancelled attempts do not release the hold early; expiry owns that.
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

    if (booking && booking.customer_id) {
      try {
        await loyaltyModel.awardBookingPoints(booking_id);
      } catch (err) {
        console.error('loyalty award on success page failed:', err);
      }
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
    await bookingNotificationModel.expirePendingPaymentBookings();

    let booking = await getAuthorizedBooking(req, res, bookingId);
    if (!booking) return;

    if (booking.status !== 'pending_payment') {
      return res.redirect('/book/viewBookings?error=' + encodeURIComponent('This payment session is no longer payable.'));
    }

    const user = req.session.user;
    if (!user || user.role !== 'customer') {
      return res.redirect(`/payment/checkout/${bookingId}`);
    }

    ({ booking } = await syncBestPromotion(booking));

    // Remove voucher when no cvId supplied.
    if (!cvId) {
      await bookingModel.applyVoucher(bookingId, null, 0);
      return res.redirect(`/payment/checkout/${bookingId}?manualVoucher=none`);
    }

    const customerId = user.customer_id || user.user_id;
    const vouchers = await voucherModel.getEligibleCustomerVouchers(customerId, booking.merchant_id);
    const voucherOptions = buildVoucherOptions(vouchers, getVoucherPricingContext(booking), booking.applied_cv_id);
    const voucher = voucherOptions.find(v => Number(v.cv_id) === cvId);

    if (!voucher) {
      return res.redirect(`/payment/checkout/${bookingId}?voucherError=` + encodeURIComponent('This voucher is not available for this booking.'));
    }

    if (!voucher.isUsable) {
      return res.redirect(`/payment/checkout/${bookingId}?voucherError=` + encodeURIComponent(voucher.unavailableReason || 'This voucher is not eligible for this booking.'));
    }

    await bookingModel.applyVoucher(bookingId, cvId, voucher.discountAmount);
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
