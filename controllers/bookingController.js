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
const emailService = require('../services/emailService');
const whatsappNotificationService = require('../services/whatsappNotificationService');
const walletModel = require('../models/walletModel');
const waitlistModel = require('../models/waitlistModel');
const paymentModel = require('../models/paymentModel');
const refundService = require('../services/refundService');
const adminValidationModel = require('../models/adminValidationModel');

// Power Automate webhook URL: paste your webhook URL here or set POWER_AUTOMATE_WEBHOOK_URL in .env
const POWER_AUTOMATE_WEBHOOK_URL = process.env.POWER_AUTOMATE_WEBHOOK_URL || 'PASTE_YOUR_POWER_AUTOMATE_WEBHOOK_URL_HERE';

function sessionUserId(req) {
  return req.session && req.session.user ? req.session.user.user_id : null;
}

async function logBookingValidationError(req, {
  bookingId = null,
  errorType,
  errorMessage
}) {
  await adminValidationModel.logTechnicalValidationError({
    userId: sessionUserId(req),
    bookingId,
    module: 'booking',
    errorType,
    errorMessage
  });
}

async function logWhatsAppValidationError(booking, errorType, errorMessage) {
  await adminValidationModel.logTechnicalValidationError({
    userId: booking && booking.customer_id,
    bookingId: booking && booking.booking_id,
    module: 'whatsapp',
    errorType,
    errorMessage
  });
}

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

function currentCustomerId(req) {
  return req.session.user.customer_id || req.session.user.user_id;
}

function redirectMerchantAwayFromBooking(req, res) {
  if (!isMerchantUser(req)) return false;

  if (req.originalUrl && req.originalUrl.startsWith('/book/api/')) {
    res.status(403).json({ error: 'Merchant accounts cannot use customer booking pages.' });
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

function buildQrNextUrl(token, state = {}) {
  const params = new URLSearchParams();
  if (state.service_id) params.set('serviceId', state.service_id);
  if (state.booking_date) params.set('bookingDate', state.booking_date);
  if (state.booking_time) params.set('bookingTime', state.booking_time);
  if (state.staff_id) params.set('staffId', state.staff_id);

  const query = params.toString();
  return `/book/${token}${query ? '?' + query : ''}`;
}

function getQrFormState(req) {
  return {
    service_id: req.body.service_id || req.query.serviceId || '',
    booking_date: req.body.booking_date || req.query.bookingDate || '',
    booking_time: req.body.booking_time || req.query.bookingTime || '',
    staff_id: req.body.staff_id || req.query.staffId || '',
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

async function sendBookingCreatedEmails(booking) {
  for (const recipient of bookingRecipients(booking)) {
    try {
      const alreadySent = await bookingNotificationModel.hasSentEmailNotification(
        booking.booking_id,
        'booking_created',
        recipient.kind
      );

      if (alreadySent) continue;

      const result = await emailService.sendBookingCreatedEmail(booking, recipient);
      await recordLifecycleEmail(booking, 'booking_created', recipient, result);
    } catch (err) {
      console.error('booking created email failed:', err);
    }
  }
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
    if (booking) await sendBookingCreatedEmails(booking);
  } catch (err) {
    console.error('booking created notification failed:', err);
  }
}

async function sendCancellationNotification(booking) {
  try {
    await notificationModel.notifyBookingCancelled(booking);
  } catch (err) {
    console.error('booking cancellation notification failed:', err);
  }
}

async function sendWhatsAppCancellationNotification(booking) {
  if (!booking || booking.source !== 'whatsapp') return;

  try {
    const alreadySent = await bookingNotificationModel.hasSentWhatsAppNotification(booking.booking_id, 'cancellation');
    if (alreadySent) return;

    const result = await whatsappNotificationService.sendBookingCancellation(booking);
    if (result && result.skipped) {
      console.warn('[whatsapp] cancellation skipped for booking %s: %s', booking.booking_id, result.reason);
    } else if (result && result.error) {
      console.error('[whatsapp] cancellation failed for booking %s: %s', booking.booking_id, result.error);
      await logWhatsAppValidationError(
        booking,
        'WHATSAPP_NOTIFICATION_FAILED',
        'Outgoing WhatsApp cancellation notification failed.'
      );
    }

    await bookingNotificationModel.recordWhatsAppNotification(
      booking,
      'cancellation',
      `WhatsApp booking cancellation for booking #${booking.booking_id}`,
      result && !result.skipped && !result.error ? 'sent' : 'failed'
    );
  } catch (err) {
    console.error('[whatsapp] cancellation notification failed for booking %s:', booking.booking_id, err.message || err);
    await logWhatsAppValidationError(
      booking,
      'WHATSAPP_NOTIFICATION_FAILED',
      'Outgoing WhatsApp cancellation notification failed.'
    );
  }
}

async function sendRescheduleNotification(booking, previousBooking) {
  try {
    await notificationModel.notifyBookingRescheduled(booking, previousBooking);
  } catch (err) {
    console.error('booking reschedule notification failed:', err);
  }
}

async function sendWhatsAppRescheduleNotification(booking, previousBooking) {
  if (!booking || booking.source !== 'whatsapp') return;

  try {
    const result = await whatsappNotificationService.sendBookingRescheduled(booking, previousBooking);
    if (result && result.skipped) {
      console.warn('[whatsapp] reschedule skipped for booking %s: %s', booking.booking_id, result.reason);
    } else if (result && result.error) {
      console.error('[whatsapp] reschedule failed for booking %s: %s', booking.booking_id, result.error);
      await logWhatsAppValidationError(
        booking,
        'WHATSAPP_NOTIFICATION_FAILED',
        'Outgoing WhatsApp reschedule notification failed.'
      );
    }

    await bookingNotificationModel.recordWhatsAppNotification(
      booking,
      'reschedule',
      `WhatsApp booking reschedule for booking #${booking.booking_id}`,
      result && !result.skipped && !result.error ? 'sent' : 'failed'
    );
  } catch (err) {
    console.error('[whatsapp] reschedule notification failed for booking %s:', booking.booking_id, err.message || err);
    await logWhatsAppValidationError(
      booking,
      'WHATSAPP_NOTIFICATION_FAILED',
      'Outgoing WhatsApp reschedule notification failed.'
    );
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
    title: 'Book Appointment',
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
      customerId:  currentCustomerId(req),
      serviceId:   service_id,
      merchantId:  merchant_id,
      bookingDate: booking_date,
      bookingTime: booking_time,
      staffId:     staff_id || null,
      source:      'marketplace',
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
      return res.redirect(`/payment/checkout/${bookingId}?webhookError=${encodeURIComponent('Booking notification failed. Please continue to payment.')}`);
    }

    res.redirect(`/payment/checkout/${bookingId}`);
  } catch (err) {
    console.error(err);
    await logBookingValidationError(req, {
      errorType: err.code === 'CUSTOMER_BOOKING_OVERLAP' ? 'CUSTOMER_BOOKING_OVERLAP' : 'BOOKING_CREATE_FAILED',
      errorMessage: err.code === 'CUSTOMER_BOOKING_OVERLAP'
        ? 'Customer attempted to create a booking that overlaps an existing active booking.'
        : 'Customer booking creation failed before payment.'
    });
    const bookingError = err.code === 'ER_DUP_ENTRY' && /slot_id/i.test(err.message || '')
      ? 'That time slot was just taken or is no longer available. Please choose another time.'
      : (err.message || 'Booking failed. Please try again.');
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
      title: 'Complete Your Booking',
      merchant,
      serviceList,
      selectedService,
      staff,
      selectedStaffId: staff_id || '',
      cancellationPolicy,
      cancellationPolicySummary: cancellationPolicy
        ? cancellationPolicyModel.getPolicySummary(cancellationPolicy)
        : '',
      merchantName: merchant?.merchant_name || '',
      merchantAddress: merchant?.address || '',
      error: bookingError,
    });
  }
}

async function viewCustomerBookings(req, res) {
  try {
    const customerId = req.session.user.customer_id || req.session.user.user_id;
    const bookings = await bookingModel.getCustomerBookings(customerId);
    const changeRequests = await require('../models/bookingDisruptionModel')
      .getPendingRequestsForCustomer(customerId).catch(() => []);
    const waitlists = await waitlistModel.getCustomerWaitlists(customerId).catch((err) => {
      console.error('customer waitlists failed:', err);
      return [];
    });
    res.render('booking/viewBookings', {
      title: 'My Bookings',
      bookings,
      waitlists,
      changeRequests,
      success: req.query.success,
      error: req.query.error,
    });
  } catch (err) {
    console.error(err);
    res.render('booking/viewBookings', {
      title: 'My Bookings',
      bookings: [],
      waitlists: [],
      changeRequests: [],
      error: 'Could not load your bookings. Please try again.',
    });
  }
}

async function joinWaitlistFromPortal(req, res) {
  try {
    const { merchant_id, service_id, booking_date, booking_time } = req.body;
    const result = await waitlistModel.joinWaitlist({
      customerId: currentCustomerId(req),
      merchantId: merchant_id,
      serviceId: service_id,
      bookingDate: booking_date,
      bookingTime: booking_time,
    });

    const message = result.alreadyJoined
      ? 'You are already on the waitlist for this slot.'
      : 'You joined the waitlist successfully.';
    res.redirect('/book/viewBookings?success=' + encodeURIComponent(message));
  } catch (err) {
    console.error(err);
    res.redirect('/book/viewBookings?error=' + encodeURIComponent(err.message || 'Could not join the waitlist.'));
  }
}

async function confirmWaitlistOffer(req, res) {
  try {
    const customerId = currentCustomerId(req);
    const entry = await waitlistModel.getWaitlistByIdForCustomer(req.params.waitlistId, customerId);

    if (!entry || entry.status !== 'offered') {
      return res.redirect('/book/viewBookings?error=' + encodeURIComponent('This waitlist offer is no longer available.'));
    }

    if (Number(entry.offer_is_active || 0) !== 1) {
      await waitlistModel.expireOffersAndPromote();
      return res.redirect('/book/viewBookings?error=' + encodeURIComponent('This waitlist offer has expired.'));
    }

    if (entry.confirmed_booking_id) {
      return res.redirect(`/payment/checkout/${entry.confirmed_booking_id}`);
    }

    const bookingId = await bookingModel.createBooking({
      customerId,
      serviceId: entry.service_id,
      merchantId: entry.merchant_id,
      bookingDate: bookingModel.formatDateValue(entry.booking_date),
      bookingTime: String(entry.booking_time).slice(0, 5),
      source: 'web',
      waitlistId: entry.waitlist_id,
    });

    const booking = await bookingModel.getBookingById(bookingId);
    await paymentModel.createOrUpdatePayment(bookingId, Number(booking.total_amount || 0), 'stripe', {
      holdMinutes: waitlistModel.OFFER_MINUTES,
    });
    await waitlistModel.attachPendingBooking(entry.waitlist_id, bookingId);

    res.redirect(`/payment/checkout/${bookingId}`);
  } catch (err) {
    console.error(err);
    await logBookingValidationError(req, {
      errorType: err.code === 'CUSTOMER_BOOKING_OVERLAP' ? 'CUSTOMER_BOOKING_OVERLAP' : 'BOOKING_CREATE_FAILED',
      errorMessage: err.code === 'CUSTOMER_BOOKING_OVERLAP'
        ? 'Customer attempted to create a booking that overlaps an existing active booking.'
        : 'Waitlist offer booking creation failed.'
    });
    res.redirect('/book/viewBookings?error=' + encodeURIComponent(err.message || 'Could not confirm the waitlist offer.'));
  }
}

async function cancelWaitlistRequest(req, res) {
  try {
    await waitlistModel.cancelCustomerWaitlist(req.params.waitlistId, currentCustomerId(req));
    res.redirect('/book/viewBookings?success=' + encodeURIComponent('Waitlist request cancelled.'));
  } catch (err) {
    console.error(err);
    res.redirect('/book/viewBookings?error=' + encodeURIComponent(err.message || 'Could not cancel the waitlist request.'));
  }
}

async function cancelCustomerBooking(req, res) {
  try {
    const customerId = req.session.user.customer_id || req.session.user.user_id;
    const refundDecision = await bookingModel.cancelCustomerBooking(req.params.bookingId, customerId);
    const refundPercentage = Number(refundDecision?.refundPercentage || 0);
    let refundResult = { refunded: false, skipped: true, reason: 'No refund due under policy.' };

    if (refundPercentage > 0) {
      const walletRefund = await walletModel.refundBooking({
        customerId,
        bookingId: req.params.bookingId,
        refundPercentage,
      });

      if (walletRefund.refunded || walletRefund.reason !== 'not_wallet_payment') {
        refundResult = walletRefund;
      } else {
        refundResult = await refundService.refundBookingPayment(req.params.bookingId, {
          refundPercentage,
          reason: 'requested_by_customer',
        });
      }
    }

    const booking = await bookingModel.getBookingById(req.params.bookingId);
    if (booking) {
      await sendCancellationEmails(booking);
      await sendCancellationNotification(booking);
      await sendWhatsAppCancellationNotification(booking);
    }
    const refundedAmount = Number(refundResult.amount || refundResult.refundAmount || 0);
    const message = refundedAmount > 0
      ? `Booking cancelled. A ${refundPercentage.toFixed(0)}% refund of S$${refundedAmount.toFixed(2)} has been processed.`
      : 'Booking cancelled successfully. No refund is due under the cancellation policy.';
    res.redirect('/book/viewBookings?success=' + encodeURIComponent(message));
  } catch (err) {
    console.error(err);
    await logBookingValidationError(req, {
      bookingId: req.params.bookingId,
      errorType: 'BOOKING_CANCEL_FAILED',
      errorMessage: 'Customer booking cancellation failed.'
    });
    res.redirect(`/book/viewBookings?error=${encodeURIComponent(err.message || 'Could not cancel booking.')}`);
  }
}

async function showRescheduleBooking(req, res) {
  try {
    const customerId = currentCustomerId(req);
    const booking = await bookingModel.getCustomerBookingById(req.params.bookingId, customerId);

    if (!booking) {
      return res.redirect('/book/viewBookings?error=Booking not found.');
    }

    const changeRequest = req.query.changeRequest
      ? await require('../models/bookingDisruptionModel').getPendingRequestForCustomer(req.query.changeRequest, customerId)
      : null;
    const startsAt = new Date(`${bookingModel.formatDateValue(booking.booking_date)}T${String(booking.booking_time).slice(0, 5)}:00`);
    const hoursUntil = (startsAt.getTime() - Date.now()) / (60 * 60 * 1000);
    if (!changeRequest && (!Number.isFinite(hoursUntil) || hoursUntil < cancellationPolicyModel.PLATFORM_POLICY.rescheduleCutoffHours)) {
      return res.redirect('/book/viewBookings?error=' + encodeURIComponent('Bookings can only be rescheduled until 6 hours before the appointment.'));
    }

    res.render('booking/reschedule', {
      title: 'Reschedule Booking',
      booking,
      changeRequest,
      error: null,
    });
  } catch (err) {
    console.error(err);
    res.redirect('/book/viewBookings?error=Could not load booking.');
  }
}

async function rescheduleCustomerBooking(req, res) {
  const { booking_date, booking_time } = req.body;

  try {
    const previousBooking = await bookingModel.getBookingById(req.params.bookingId);
    const changeRequest = req.body.change_request_id
      ? await require('../models/bookingDisruptionModel').getPendingRequestForCustomer(req.body.change_request_id, currentCustomerId(req))
      : null;
    await bookingModel.rescheduleCustomerBooking(
      req.params.bookingId,
      currentCustomerId(req),
      booking_date,
      booking_time,
      { allowPolicyOverride: Boolean(changeRequest) }
    );
    if (changeRequest) {
      await require('../models/bookingDisruptionModel').markRequest(changeRequest.change_request_id, currentCustomerId(req), 'reschedule_requested');
    }
    const booking = await bookingModel.getBookingById(req.params.bookingId);
    if (booking && previousBooking) {
      await sendRescheduleEmails(booking, previousBooking);
      await sendRescheduleNotification(booking, previousBooking);
      await sendWhatsAppRescheduleNotification(booking, previousBooking);
    }
    res.redirect('/book/viewBookings?success=Booking rescheduled successfully.');
  } catch (err) {
    console.error(err);
    await logBookingValidationError(req, {
      bookingId: req.params.bookingId,
      errorType: err.code === 'CUSTOMER_BOOKING_OVERLAP' ? 'CUSTOMER_BOOKING_OVERLAP' : 'BOOKING_RESCHEDULE_FAILED',
      errorMessage: err.code === 'CUSTOMER_BOOKING_OVERLAP'
        ? 'Customer attempted to reschedule into a time that overlaps an existing active booking.'
        : 'Customer booking reschedule failed.'
    });
    const booking = await bookingModel.getCustomerBookingById(req.params.bookingId, currentCustomerId(req)).catch(() => null);

    if (!booking) {
      return res.redirect('/book/viewBookings?error=Could not reschedule booking.');
    }

    res.render('booking/reschedule', {
      title: 'Reschedule Booking',
      booking,
      changeRequest: null,
      error: err.message || 'Could not reschedule booking.',
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
        title: 'Invalid QR Code',
      });
    }

    const services = await merchantModel.getMerchantServices(qr.merchant_id);

    return renderQRBookingPage(req, res, {
      token,
      qr,
      services,
      error: null
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

  const { merchantId, serviceId, staffId } = req.query;

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
      title: 'Complete Your Booking',
      merchant,
      serviceList,
      selectedService,
      staff,
      selectedStaffId: staffId || '',
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

async function rebookBooking(req, res) {
  try {
    const customerId = currentCustomerId(req);
    const booking = await bookingModel.getCustomerBookingById(req.params.bookingId, customerId);

    if (!booking) {
      return res.redirect('/book/viewBookings?error=' + encodeURIComponent('Booking not found.'));
    }

    const query = new URLSearchParams({
      merchantId: String(booking.merchant_id),
      serviceId: String(booking.service_id),
    });
    if (booking.staff_id) {
      query.set('staffId', String(booking.staff_id));
    }

    res.redirect('/book?' + query.toString());
  } catch (err) {
    console.error(err);
    res.redirect('/book/viewBookings?error=' + encodeURIComponent('Unable to rebook this appointment.'));
  }
}

async function confirmBooking(req, res) {
  if (redirectMerchantAwayFromBooking(req, res)) return;

  const { token } = req.params;
  const { service_id, booking_date, booking_time, staff_id, full_name, phone, email, booking_mode, policy_acknowledged } = req.body;
  try {
    const qr = await qrModel.getQRByToken(token);
    if (!qr) return res.redirect(`/book/${token}`);
    const services = await merchantModel.getMerchantServices(qr.merchant_id).catch(() => []);

    if (policy_acknowledged !== '1') {
      return renderQRBookingPage(req, res, {
        token,
        qr,
        services,
        error: 'Please tick the cancellation and refund policy acknowledgement before proceeding to payment.',
        statusCode: 400,
      });
    }

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
      customerId = sessionUser.customer_id || sessionUser.user_id;
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
      return res.redirect(`/payment/checkout/${bookingId}?webhookError=${encodeURIComponent('Booking notification failed. Please continue to payment.')}`);
    }

    res.redirect(`/payment/checkout/${bookingId}`);
  } catch (err) {
    console.error(err);
    await logBookingValidationError(req, {
      errorType: err.code === 'CUSTOMER_BOOKING_OVERLAP' ? 'CUSTOMER_BOOKING_OVERLAP' : 'BOOKING_CREATE_FAILED',
      errorMessage: err.code === 'CUSTOMER_BOOKING_OVERLAP'
        ? 'Customer attempted to create a QR booking that overlaps an existing active booking.'
        : 'QR booking creation failed before payment.'
    });
    const qr      = await qrModel.getQRByToken(token).catch(() => null);
    const services = qr ? await merchantModel.getMerchantServices(qr.merchant_id).catch(() => []) : [];
    if (!qr) {
      return res.status(404).render('booking/invalid', { title: 'Invalid QR Code' });
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
        title: 'Invalid Arrival QR',
        state: 'invalid',
        merchantName: '',
        booking: null,
        message: 'This arrival QR code is invalid or no longer active.',
      });
    }

    if (!req.session.user) {
      return res.redirect(`/auth/login?next=${encodeURIComponent(`/book/arrival/${token}`)}`);
    }

    if (req.session.user.role !== 'customer') {
      return res.status(403).render('booking/arrivalStatus', {
        title: 'Customer Login Required',
        state: 'invalid',
        merchantName: qr.merchant_name,
        booking: null,
        message: 'Please scan this QR with a customer account to confirm arrival.',
      });
    }

    const result = await bookingModel.markCustomerArrivedForMerchant(
      currentCustomerId(req),
      qr.merchant_id
    );

    const messageMap = {
      arrived: 'Arrival confirmed. The merchant can now see you as arrived.',
      already_arrived: 'You have already confirmed arrival for this booking.',
      no_active_booking: 'No confirmed booking for today was found for this merchant.',
    };

    return res.render('booking/arrivalStatus', {
      title: 'Arrival Confirmation',
      state: result.status,
      merchantName: qr.merchant_name,
      booking: result.booking,
      message: messageMap[result.status] || messageMap.no_active_booking,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).render('booking/arrivalStatus', {
      title: 'Arrival Confirmation Failed',
      state: 'invalid',
      merchantName: '',
      booking: null,
      message: 'Arrival confirmation failed. Please ask the merchant for help.',
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
  checkEmailMember,
  confirmArrivalByQR,
  viewCustomerBookings,
  confirmWaitlistOffer,
  cancelWaitlistRequest,
  cancelCustomerBooking,
  showRescheduleBooking,
  rescheduleCustomerBooking,
  rebookBooking,
  confirmArrival,
  getAvailableSlots,
  getAvailableStaff,
  joinWaitlistFromPortal,
  confirmWaitlistOffer,
  cancelWaitlistRequest,
};
