const axios = require('axios');
const qrModel = require('../models/qrModel');
const merchantModel = require('../models/merchantModel');
const authModel = require('../models/authModel');
const bookingModel = require('../models/bookingModel');
const slotModel = require('../models/slotModel');
const bookingNotificationModel = require('../models/bookingNotificationModel');
const staffModel = require('../models/staffModel');
const cancellationPolicyModel = require('../models/cancellationPolicyModel');
const notificationModel = require('../models/notificationModel');
const waitlistModel = require('../models/waitlistModel');
const emailService = require('../services/emailService');
const walletModel = require('../models/walletModel');
const refundService = require('../services/refundService');

// Power Automate webhook URL: paste your webhook URL here or set POWER_AUTOMATE_WEBHOOK_URL in .env
const POWER_AUTOMATE_WEBHOOK_URL = process.env.POWER_AUTOMATE_WEBHOOK_URL || 'PASTE_YOUR_POWER_AUTOMATE_WEBHOOK_URL_HERE';

async function sendPowerAutomateWebhook(payload) {
  if (!POWER_AUTOMATE_WEBHOOK_URL || POWER_AUTOMATE_WEBHOOK_URL.includes('PASTE_YOUR_POWER_AUTOMATE_WEBHOOK_URL_HERE')) {
    console.warn('Power Automate webhook URL is not configured. Skipping webhook call.');
    return;
  }

  await axios.post(POWER_AUTOMATE_WEBHOOK_URL, payload, {
    headers: {
      'Content-Type': 'application/json'
    },
    timeout: 10000
  });
}

function isMerchantUser(req) {
  return req.session.user && req.session.user.role === 'merchant';
}

function redirectMerchantAwayFromBooking(req, res) {
  if (!isMerchantUser(req)) return false;

  if (req.originalUrl && req.originalUrl.startsWith('/book/api/')) {
    res.status(403).json({ error: res.locals.t('messages.merchantCannotBook') });
    return true;
  }

  res.redirect('/merchant/dashboard');
  return true;
}

function isCurrentOrFutureSlot(bookingDate, bookingTime) {
  if (!bookingDate || !bookingTime) return false;
  if (!slotModel.isDateWithinAdvanceLimit(bookingDate)) return false;
  const slot = new Date(`${bookingDate}T${String(bookingTime).slice(0, 5)}:00`);
  return !Number.isNaN(slot.getTime()) && slot >= new Date();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function formatDateForInput(value) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return String(value || '').slice(0, 10);
}

function buildQrNextUrl(token, state = {}) {
  const params = new URLSearchParams();
  if (state.service_id) params.set('serviceId', state.service_id);
  if (state.booking_date) params.set('bookingDate', state.booking_date);
  if (state.booking_time) params.set('bookingTime', state.booking_time);
  if (state.staff_id) params.set('staffId', state.staff_id);
  if (state.waitlist) params.set('waitlist', state.waitlist);

  const query = params.toString();
  return `/book/${token}${query ? '?' + query : ''}`;
}

function getQrFormState(req) {
  return {
    service_id: req.body.service_id || req.query.serviceId || '',
    booking_date: req.body.booking_date || req.query.bookingDate || '',
    booking_time: req.body.booking_time || req.query.bookingTime || '',
    staff_id: req.body.staff_id || req.query.staffId || '',
    waitlist: req.body.waitlist || req.query.waitlist || '',
    full_name: req.body.full_name || '',
    phone: req.body.phone || '',
    email: req.body.email || '',
    booking_mode: req.body.booking_mode || 'guest',
  };
}

function rememberGuestBooking(req, bookingId) {
  req.session.guestBookingIds = Array.isArray(req.session.guestBookingIds)
    ? req.session.guestBookingIds
    : [];

  const safeBookingId = String(bookingId);
  if (!req.session.guestBookingIds.includes(safeBookingId)) {
    req.session.guestBookingIds.push(safeBookingId);
  }
}

async function ensureSessionCustomer(req) {
  const sessionUser = req.session.user;
  if (!sessionUser || sessionUser.role !== 'customer') {
    throw new Error('Please use a customer account for waitlist requests.');
  }

  let customerId = sessionUser.customer_id;
  if (!customerId) {
    const customer = await authModel.ensureCustomerProfile(
      sessionUser.user_id,
      sessionUser.full_name,
      sessionUser.email,
      sessionUser.phone || null
    );
    customerId = customer.customer_id;
    req.session.user.customer_id = customerId;
  }

  return customerId;
}

function bookingRecipients(booking) {
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

async function recordLifecycleEmail(booking, notificationType, recipient, result) {
  await bookingNotificationModel.recordEmailNotification(
    booking,
    notificationType,
    `${notificationType} email to ${recipient.kind} (${recipient.email}) for booking #${booking.booking_id}`,
    result.sent ? 'sent' : 'failed'
  );
}

async function sendCancellationEmails(booking) {
  for (const recipient of bookingRecipients(booking)) {
    try {
      const result = await emailService.sendBookingCancellationEmail(booking, recipient);
      await recordLifecycleEmail(booking, 'cancellation', recipient, result);
    } catch (err) {
      console.error('booking cancellation email failed:', err);
    }
  }
}

async function sendBookingCreatedNotification(bookingId) {
  try {
    const booking = await bookingModel.getBookingById(bookingId);
    await notificationModel.notifyBookingCreated(booking);
  } catch (err) {
    console.error('booking created notification failed:', err);
  }
}

async function sendWaitlistBookingCreatedNotification(bookingId) {
  await sendBookingCreatedNotification(bookingId);
}

async function sendCancellationNotification(booking) {
  try {
    await notificationModel.notifyBookingCancelled(booking);
  } catch (err) {
    console.error('booking cancellation notification failed:', err);
  }
}

async function sendRescheduleNotification(booking, previousBooking) {
  try {
    await notificationModel.notifyBookingRescheduled(booking, previousBooking);
  } catch (err) {
    console.error('booking reschedule notification failed:', err);
  }
}

async function sendRescheduleEmails(booking, previousBooking) {
  for (const recipient of bookingRecipients(booking)) {
    try {
      const result = await emailService.sendBookingRescheduledEmail(booking, previousBooking, recipient);
      await recordLifecycleEmail(booking, 'reschedule', recipient, result);
    } catch (err) {
      console.error('booking reschedule email failed:', err);
    }
  }
}

async function renderQRBookingPage(req, res, {
  token,
  qr,
  services,
  error = null,
  statusCode = 200,
  formState = null,
} = {}) {
  const state = formState || getQrFormState(req);
  const nextUrl = buildQrNextUrl(token, state);

  return res.status(statusCode).render('booking/page', {
    title: res.locals.t('booking.qrScanBooking'),
    qr,
    services,
    error,
    formState: state,
    loginUrl: `/auth/login?next=${encodeURIComponent(nextUrl)}`,
    registerUrl: `/auth/register?next=${encodeURIComponent(nextUrl)}`,
  });
}

async function confirmPortalBooking(req, res) {
  if (redirectMerchantAwayFromBooking(req, res)) return;

  const { merchant_id, service_id, booking_date, booking_time, staff_id } = req.body;
  try {
    if (!req.session.user) {
      return res.redirect(`/auth/login?next=/book?merchantId=${merchant_id}`);
    }

    const bookingId = await bookingModel.createBooking({
      customerId:  req.session.user.customer_id,
      serviceId:   service_id,
      merchantId:  merchant_id,
      bookingDate: booking_date,
      bookingTime: booking_time,
      staffId:     staff_id || null,
      source:      'portal',
    });
    await sendBookingCreatedNotification(bookingId);

    try {
      await sendPowerAutomateWebhook({
        name: req.session.user.full_name || null,
        email: req.session.user.email || null,
        serviceId: service_id,
        bookingDate: booking_date,
        bookingTime: booking_time,
        source: 'portal'
      });
    } catch (webhookErr) {
      console.error('Power Automate webhook failed:', webhookErr.message || webhookErr);
      return res.redirect(`/payment/checkout/${bookingId}?webhookError=${encodeURIComponent(res.locals.t('messages.bookingNotificationFailed'))}`);
    }

    res.redirect(`/payment/checkout/${bookingId}`);
  } catch (err) {
    console.error(err);
    const merchant = merchant_id ? await merchantModel.getMerchantById(merchant_id).catch(() => null) : null;
    const serviceList = merchant_id ? await merchantModel.getMerchantServices(merchant_id).catch(() => []) : [];
    const selectedService =
      serviceList.find(s => String(s.service_id) === String(service_id)) ||
      serviceList[0] ||
      {};
    const staff = selectedService?.service_id
      ? await staffModel.getStaffByService(selectedService.service_id, merchant_id).catch(() => [])
      : [];
    const cancellationPolicy = merchant
      ? await cancellationPolicyModel.getPolicyByMerchantId(merchant.merchant_id).catch(() => null)
      : null;

    res.status(400).render('booking/book', {
      title: res.locals.t('portalBooking.complete'),
      merchant,
      serviceList,
      selectedService,
      staff,
      cancellationPolicy,
      cancellationPolicySummary: cancellationPolicy
        ? cancellationPolicyModel.getPolicySummary(cancellationPolicy)
        : '',
      merchantName: merchant?.merchant_name || '',
      merchantAddress: merchant?.address || '',
      error: err.message || 'Booking failed. Please try again.',
    });
  }
}

async function viewCustomerBookings(req, res) {
  try {
    const customerId = await ensureSessionCustomer(req);
    const [bookings, waitlists] = await Promise.all([
      bookingModel.getCustomerBookings(customerId),
      waitlistModel.getCustomerWaitlists(customerId),
    ]);
    res.render('booking/viewBookings', {
      title: res.locals.t('booking.myBookings'),
      bookings,
      waitlists,
      success: req.query.success,
      error: req.query.error,
    });
  } catch (err) {
    console.error(err);
    res.render('booking/viewBookings', {
      title: res.locals.t('booking.myBookings'),
      bookings: [],
      waitlists: [],
      error: 'Could not load your bookings. Please try again.',
    });
  }
}

async function joinWaitlistFromQR(req, res) {
  if (redirectMerchantAwayFromBooking(req, res)) return;

  const { token } = req.params;
  const { service_id, booking_date, booking_time } = req.body;

  try {
    const qr = await qrModel.getQRByToken(token);
    if (!qr) {
      return res.status(404).render('booking/invalid', { title: res.locals.t('titles.invalidTitle') });
    }

    const customerId = await ensureSessionCustomer(req);
    const availableStaff = await slotModel.getAvailableStaffForSlot({
      merchantId: qr.merchant_id,
      serviceId: service_id,
      bookingDate: booking_date,
      bookingTime: booking_time,
    });
    const hasActiveOffer = await waitlistModel.hasActiveOfferForSlot({
      merchantId: qr.merchant_id,
      serviceId: service_id,
      bookingDate: booking_date,
      bookingTime: booking_time,
    });

    if (availableStaff.length && !hasActiveOffer) {
      return res.redirect(`/book/${token}?serviceId=${encodeURIComponent(service_id)}&bookingDate=${encodeURIComponent(booking_date)}&bookingTime=${encodeURIComponent(booking_time)}&error=${encodeURIComponent(res.locals.t('messages.slotAvailable'))}`);
    }

    const result = await waitlistModel.joinWaitlist({
      customerId,
      merchantId: qr.merchant_id,
      serviceId: service_id,
      bookingDate: booking_date,
      bookingTime: booking_time,
    });

    const message = result.alreadyJoined
      ? res.locals.t('messages.alreadyWaitlisted')
      : res.locals.t('messages.joinedWaitlist');
    res.redirect(`/book/viewBookings?success=${encodeURIComponent(message)}`);
  } catch (err) {
    console.error(err);
    res.redirect(`/book/${token}?error=${encodeURIComponent(err.message || res.locals.t('messages.joinWaitlistFailed'))}`);
  }
}

async function confirmWaitlistOffer(req, res) {
  try {
    const customerId = await ensureSessionCustomer(req);
    const waitlist = await waitlistModel.getWaitlistByIdForCustomer(req.params.waitlistId, customerId);

    if (!waitlist || waitlist.status !== 'offered') {
      return res.redirect('/book/viewBookings?error=' + encodeURIComponent(res.locals.t('messages.waitlistOfferUnavailable')));
    }

    if (waitlist.offer_expires_at && new Date(waitlist.offer_expires_at) < new Date()) {
      await waitlistModel.expireOffersAndPromote();
      return res.redirect('/book/viewBookings?error=' + encodeURIComponent(res.locals.t('messages.waitlistOfferExpired')));
    }

    const bookingId = await bookingModel.createBooking({
      customerId,
      serviceId: waitlist.service_id,
      merchantId: waitlist.merchant_id,
      bookingDate: formatDateForInput(waitlist.booking_date),
      bookingTime: String(waitlist.booking_time).slice(0, 5),
      source: 'qr',
      waitlistId: waitlist.waitlist_id,
    });

    await waitlistModel.markConfirmed(waitlist.waitlist_id, bookingId);
    await sendWaitlistBookingCreatedNotification(bookingId);

    res.redirect(`/payment/checkout/${bookingId}`);
  } catch (err) {
    console.error(err);
    res.redirect('/book/viewBookings?error=' + encodeURIComponent(err.message || res.locals.t('messages.confirmWaitlistFailed')));
  }
}

async function cancelWaitlistRequest(req, res) {
  try {
    const customerId = await ensureSessionCustomer(req);
    await waitlistModel.cancelCustomerWaitlist(req.params.waitlistId, customerId);
    res.redirect('/book/viewBookings?success=' + encodeURIComponent(res.locals.t('messages.waitlistCancelled')));
  } catch (err) {
    console.error(err);
    res.redirect('/book/viewBookings?error=' + encodeURIComponent(err.message || res.locals.t('messages.cancelWaitlistFailed')));
  }
}

async function cancelCustomerBooking(req, res) {
  try {
    const customerId = req.session.user.customer_id || req.session.user.user_id;
    const beforeCancel = (await bookingModel.getCustomerBookings(customerId))
      .find(item => String(item.booking_id) === String(req.params.bookingId));
    await bookingModel.cancelCustomerBooking(req.params.bookingId, customerId);
    const walletRefund = await walletModel.refundBooking({
      customerId,
      bookingId: req.params.bookingId,
      refundPercentage: beforeCancel ? beforeCancel.refund_percentage : 100,
    });
    const booking = await bookingModel.getBookingById(req.params.bookingId);
    let refundResult = null;
    let refundError = null;

    if (booking) {
      try {
        refundResult = await refundService.refundCancelledBookingByPolicy(req.params.bookingId);
      } catch (err) {
        refundError = err;
        console.error('[refund] cancellation refund failed:', err.message || err);
      }
    }

    if (booking) {
      await sendCancellationEmails(booking);
      await sendCancellationNotification(booking);
    }
    let message = res.locals.t('messages.bookingCancelled');
    if (walletRefund.refunded) {
      message += ` S$${walletRefund.amount.toFixed(2)} was returned to your payment wallet.`;
    }
    if (refundResult && !refundResult.skipped) {
      message += ` Refund of S$${Number(refundResult.refundAmount || 0).toFixed(2)} was sent to Stripe.`;
    }

    if (refundError) {
      return res.redirect('/book/viewBookings?error=' + encodeURIComponent(
        `${message} Refund could not be processed in Stripe: ${refundError.message || 'Stripe refund failed.'}`
      ));
    }
    res.redirect('/book/viewBookings?success=' + encodeURIComponent(message));
  } catch (err) {
    console.error(err);
    res.redirect(`/book/viewBookings?error=${encodeURIComponent(err.message || res.locals.t('messages.cancelBookingFailed'))}`);
  }
}

async function showRescheduleBooking(req, res) {
  try {
    const booking = await bookingModel.getCustomerBookingById(req.params.bookingId, req.session.user.customer_id);

    if (!booking) {
      return res.redirect('/book/viewBookings?error=' + encodeURIComponent(res.locals.t('messages.bookingNotFound')));
    }

    res.render('booking/reschedule', {
      title: res.locals.t('reschedule.title'),
      booking,
      error: null,
    });
  } catch (err) {
    console.error(err);
    res.redirect('/book/viewBookings?error=' + encodeURIComponent(res.locals.t('messages.loadBookingFailed')));
  }
}

async function rescheduleCustomerBooking(req, res) {
  const { booking_date, booking_time } = req.body;

  try {
    const previousBooking = await bookingModel.getBookingById(req.params.bookingId);
    await bookingModel.rescheduleCustomerBooking(
      req.params.bookingId,
      req.session.user.customer_id,
      booking_date,
      booking_time
    );
    const booking = await bookingModel.getBookingById(req.params.bookingId);
    if (booking && previousBooking) {
      await sendRescheduleEmails(booking, previousBooking);
      await sendRescheduleNotification(booking, previousBooking);
    }
    res.redirect('/book/viewBookings?success=' + encodeURIComponent(res.locals.t('messages.bookingRescheduled')));
  } catch (err) {
    console.error(err);
    const booking = await bookingModel.getCustomerBookingById(req.params.bookingId, req.session.user.customer_id).catch(() => null);

    if (!booking) {
      return res.redirect('/book/viewBookings?error=' + encodeURIComponent(res.locals.t('messages.rescheduleBookingFailed')));
    }

    res.render('booking/reschedule', {
      title: res.locals.t('reschedule.title'),
      booking,
      error: err.message || res.locals.t('messages.rescheduleBookingFailed'),
    });
  }
}

async function showBookingPage(req, res) {
  if (redirectMerchantAwayFromBooking(req, res)) return;

  const { token } = req.params;

  try {
    const qr = await qrModel.getQRByToken(token);

    if (!qr) {
      return res.status(404).render('booking/invalid', {
        title: res.locals.t('titles.invalidTitle'),
      });
    }

    const services = await merchantModel.getMerchantServices(qr.merchant_id);

    return renderQRBookingPage(req, res, {
      token,
      qr,
      services,
      error: req.query.error || null
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('booking/invalid', {
      title: 'Unable to Load QR Code',
    });
  }
}

async function showPortalBookingPage(req, res) {
  if (redirectMerchantAwayFromBooking(req, res)) return;

  const { merchantId, serviceId } = req.query;

  try {
    const merchant = merchantId ? await merchantModel.getMerchantById(merchantId) : null;
    const serviceList = merchantId ? await merchantModel.getMerchantServices(merchantId) : [];

    const selectedService =
      serviceList.find(s => String(s.service_id) === String(serviceId)) ||
      serviceList[0] ||
      {};

    const staff = selectedService?.service_id
      ? await staffModel.getStaffByService(selectedService.service_id, merchantId)
      : [];

    const cancellationPolicy = merchant
      ? await cancellationPolicyModel.getPolicyByMerchantId(merchant.merchant_id)
      : null;

    res.render('booking/book', {
      title: res.locals.t('portalBooking.complete'),
      merchant,
      serviceList,
      selectedService,
      staff,
      cancellationPolicy,
      cancellationPolicySummary: cancellationPolicy
        ? cancellationPolicyModel.getPolicySummary(cancellationPolicy)
        : '',
      merchantName: merchant?.merchant_name || '',
      merchantAddress: merchant?.address || '',
      error: null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading booking page');
  }
}

async function confirmBooking(req, res) {
  if (redirectMerchantAwayFromBooking(req, res)) return;

  const { token } = req.params;
  const { service_id, booking_date, booking_time, staff_id, full_name, phone, email, booking_mode } = req.body;
  try {
    const qr = await qrModel.getQRByToken(token);
    if (!qr) return res.redirect(`/book/${token}`);
    const services = await merchantModel.getMerchantServices(qr.merchant_id).catch(() => []);

    if (!isCurrentOrFutureSlot(booking_date, booking_time)) {
      return renderQRBookingPage(req, res, {
        token,
        qr,
        services,
        error: slotModel.isDateWithinAdvanceLimit(booking_date)
          ? 'Please choose a booking date and time that is not in the past.'
          : 'Bookings can only be made within the next 12 months.',
        statusCode: 400,
      });
    }

    const sessionUser = req.session.user && req.session.user.role === 'customer'
      ? req.session.user
      : null;

    let customerId = null;
    let guestName = null;
    let guestEmail = null;
    let guestPhone = null;

    if (sessionUser) {
      customerId = sessionUser.customer_id;
      if (!customerId) {
        const customer = await authModel.ensureCustomerProfile(
          sessionUser.user_id,
          sessionUser.full_name,
          sessionUser.email,
          sessionUser.phone || null
        );
        customerId = customer.customer_id;
        req.session.user.customer_id = customerId;
      }
    } else {
      const normalizedEmail = normalizeEmail(email);
      const existingUser = await authModel.findUserByEmail(normalizedEmail);

      if (existingUser && existingUser.role === 'customer') {
        const nextUrl = buildQrNextUrl(token, req.body);
        return res.redirect(`/auth/login?reason=member_email&next=${encodeURIComponent(nextUrl)}`);
      }

      if (existingUser) {
        return renderQRBookingPage(req, res, {
          token,
          qr,
          services,
          error: 'This email belongs to a non-customer account. Please use a customer account or continue with a different email.',
          statusCode: 403,
        });
      }

      if (booking_mode === 'register') {
        return res.redirect(`/auth/register?next=${encodeURIComponent(buildQrNextUrl(token, req.body))}`);
      }

      guestName = full_name;
      guestEmail = normalizedEmail;
      guestPhone = phone;
      if (!guestName || !guestEmail || !guestPhone) {
        return renderQRBookingPage(req, res, {
          token,
          qr,
          services,
          error: 'Please enter your name, email, and phone number to continue as guest.',
          statusCode: 400,
        });
      }
    }

    const bookingId = await bookingModel.createBooking({
      customerId,
      serviceId:   service_id,
      merchantId:  qr.merchant_id,
      bookingDate: booking_date,
      bookingTime: booking_time,
      staffId:     staff_id || null,
      source:      'qr',
      guestName,
      guestEmail,
      guestPhone,
    });
    await sendBookingCreatedNotification(bookingId);

    if (!customerId) {
      rememberGuestBooking(req, bookingId);
    }

    try {
      await sendPowerAutomateWebhook({
        name: full_name || null,
        email: email || null,
        serviceId: service_id,
        bookingDate: booking_date,
        bookingTime: booking_time,
        source: 'qr'
      });
    } catch (webhookErr) {
      console.error('Power Automate webhook failed:', webhookErr.message || webhookErr);
      return res.redirect(`/payment/checkout/${bookingId}?webhookError=${encodeURIComponent(res.locals.t('messages.bookingNotificationFailed'))}`);
    }

    res.redirect(`/payment/checkout/${bookingId}`);
  } catch (err) {
    console.error(err);
    const qr      = await qrModel.getQRByToken(token).catch(() => null);
    const services = qr ? await merchantModel.getMerchantServices(qr.merchant_id).catch(() => []) : [];
    if (!qr) {
      return res.status(404).render('booking/invalid', { title: res.locals.t('titles.invalidTitle') });
    }
    return renderQRBookingPage(req, res, {
      token,
      qr,
      services,
      error: err.message || 'Booking failed. Please try again.',
      statusCode: 400,
    });
  }
}

async function checkEmailMember(req, res) {
  if (redirectMerchantAwayFromBooking(req, res)) return;

  try {
    const email = normalizeEmail(req.query.email);
    if (!email) return res.status(400).json({ exists: false, error: 'Email is required' });

    const user = await authModel.findUserByEmail(email);
    res.json({
      exists: Boolean(user),
      isCustomer: Boolean(user && user.role === 'customer'),
      role: user ? user.role : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ exists: false, error: 'Unable to check email' });
  }
}

async function confirmArrivalByQR(req, res) {
  if (redirectMerchantAwayFromBooking(req, res)) return;

  const { token } = req.params;

  try {
    const qr = await qrModel.getQRByToken(token, 'check_in');

    if (!qr) {
      return res.status(404).render('booking/arrivalStatus', {
        title: res.locals.t('titles.invalidArrivalTitle'),
        state: 'invalid',
        merchantName: '',
        booking: null,
        message: res.locals.t('arrival.invalidQrMessage'),
      });
    }

    if (!req.session.user) {
      return res.redirect(`/auth/login?next=${encodeURIComponent(`/book/arrival/${token}`)}`);
    }

    if (req.session.user.role !== 'customer' || !req.session.user.customer_id) {
      return res.status(403).render('booking/arrivalStatus', {
        title: 'Customer Login Required',
        state: 'invalid',
        merchantName: qr.merchant_name,
        booking: null,
        message: res.locals.t('arrival.customerOnlyMessage'),
      });
    }

    const result = await bookingModel.markCustomerArrivedForMerchant(
      req.session.user.customer_id,
      qr.merchant_id
    );

    const messageMap = {
      arrived: res.locals.t('arrival.arrivedMessage'),
      already_arrived: res.locals.t('arrival.alreadyArrivedMessage'),
      no_active_booking: res.locals.t('arrival.noActiveBookingMessage'),
    };

    return res.render('booking/arrivalStatus', {
      title: res.locals.t('titles.arrivalTitle'),
      state: result.status,
      merchantName: qr.merchant_name,
      booking: result.booking,
      message: messageMap[result.status] || messageMap.no_active_booking,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).render('booking/arrivalStatus', {
      title: res.locals.t('titles.arrivalFailedTitle'),
      state: 'invalid',
      merchantName: '',
      booking: null,
      message: res.locals.t('arrival.failedMessage'),
    });
  }
}

async function confirmArrival(req, res) {
  const { bookingId } = req.params;
  try {
    await bookingModel.updateBookingStatus(bookingId, 'arrived');
    res.redirect('/merchant/dashboard');
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
}

async function getAvailableSlots(req, res) {
  if (redirectMerchantAwayFromBooking(req, res)) return;

  try {
    const { merchantId, serviceId, staffId, bookingDate } = req.query;
    const slots = await slotModel.getAvailableSlots({
      merchantId,
      serviceId,
      staffId,
      bookingDate,
      includeUnavailable: true,
    });
    res.json(slots);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
}

async function getAvailableStaff(req, res) {
  if (redirectMerchantAwayFromBooking(req, res)) return;

  try {
    const {
      merchantId,
      serviceId,
      bookingDate,
      bookingTime,
    } = req.query;

    const staff = await slotModel.getAvailableStaffForSlot({
      merchantId,
      serviceId,
      bookingDate,
      bookingTime,
    });

    res.json(staff);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
}

module.exports = {
  showBookingPage,
  showPortalBookingPage,
  confirmPortalBooking,
  confirmBooking,
  joinWaitlistFromQR,
  confirmWaitlistOffer,
  cancelWaitlistRequest,
  checkEmailMember,
  confirmArrivalByQR,
  viewCustomerBookings,
  cancelCustomerBooking,
  showRescheduleBooking,
  rescheduleCustomerBooking,
  confirmArrival,
  getAvailableSlots,
  getAvailableStaff
};
