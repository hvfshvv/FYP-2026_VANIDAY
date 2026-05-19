const axios = require('axios');
const qrModel       = require('../models/qrModel');
const merchantModel = require('../models/merchantModel');
const authModel     = require('../models/authModel');
const bookingModel  = require('../models/bookingModel');
const staffModel = require('../models/staffModel');

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
    res.status(403).json({ error: 'Merchant accounts cannot use customer booking pages.' });
    return true;
  }

  res.redirect('/merchant/dashboard');
  return true;
}

function isCurrentOrFutureSlot(bookingDate, bookingTime) {
  if (!bookingDate || !bookingTime) return false;
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

  const query = params.toString();
  return `/book/${token}${query ? '?' + query : ''}`;
}

function getQrFormState(req) {
  return {
    service_id: req.body.service_id || req.query.serviceId || '',
    booking_date: req.body.booking_date || req.query.bookingDate || '',
    booking_time: req.body.booking_time || req.query.bookingTime || '',
    full_name: req.body.full_name || '',
    phone: req.body.phone || '',
    email: req.body.email || '',
    booking_mode: req.body.booking_mode || 'guest',
  };
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

async function showPortalBookingPage(req, res) {
  if (redirectMerchantAwayFromBooking(req, res)) return;

  const { merchantId, serviceId } = req.query;
  try {
    const merchant     = merchantId ? await merchantModel.getMerchantById(merchantId) : null;
    const serviceList  = merchantId ? await merchantModel.getMerchantServices(merchantId) : [];
    const selectedService = serviceList.find(s => String(s.service_id) === String(serviceId)) || serviceList[0] || {};
    const staff =
  selectedService?.service_id
    ? await staffModel.getStaffByService(
        selectedService.service_id,
        merchantId
      )
    : [];
    res.render('booking/book', {
      title:           'Complete Your Booking',
      merchant,
      serviceList,
      selectedService,
      staff,
      merchantName:    merchant?.merchant_name || '',
      merchantAddress: merchant?.address || '',
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading booking page');
  }
}

async function confirmPortalBooking(req, res) {
  if (redirectMerchantAwayFromBooking(req, res)) return;

  const { merchant_id, service_id, booking_date, booking_time } = req.body;
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
      source:      'portal',
    });

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
    const merchant = merchant_id ? await merchantModel.getMerchantById(merchant_id).catch(() => null) : null;
    const serviceList = merchant_id ? await merchantModel.getMerchantServices(merchant_id).catch(() => []) : [];
    const selectedService =
      serviceList.find(s => String(s.service_id) === String(service_id)) ||
      serviceList[0] ||
      {};
    const staff = selectedService?.service_id
      ? await staffModel.getStaffByService(selectedService.service_id, merchant_id).catch(() => [])
      : [];

    res.status(400).render('booking/book', {
      title: 'Complete Your Booking',
      merchant,
      serviceList,
      selectedService,
      staff,
      merchantName: merchant?.merchant_name || '',
      merchantAddress: merchant?.address || '',
      error: err.message || 'Booking failed. Please try again.',
    });
  }
}

async function viewCustomerBookings(req, res) {
  try {
    const bookings = await bookingModel.getCustomerBookings(req.session.user.customer_id);
    res.render('booking/viewBookings', {
      title: 'My Bookings',
      bookings,
      success: req.query.success,
      error: req.query.error,
    });
  } catch (err) {
    console.error(err);
    res.render('booking/viewBookings', {
      title: 'My Bookings',
      bookings: [],
      error: 'Could not load your bookings. Please try again.',
    });
  }
}

async function cancelCustomerBooking(req, res) {
  try {
    await bookingModel.cancelCustomerBooking(req.params.bookingId, req.session.user.customer_id);
    res.redirect('/book/viewBookings?success=Booking cancelled successfully.');
  } catch (err) {
    console.error(err);
    res.redirect(`/book/viewBookings?error=${encodeURIComponent(err.message || 'Could not cancel booking.')}`);
  }
}

async function showRescheduleBooking(req, res) {
  try {
    const booking = await bookingModel.getCustomerBookingById(req.params.bookingId, req.session.user.customer_id);

    if (!booking) {
      return res.redirect('/book/viewBookings?error=Booking not found.');
    }

    res.render('booking/reschedule', {
      title: 'Reschedule Booking',
      booking,
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
    await bookingModel.rescheduleCustomerBooking(
      req.params.bookingId,
      req.session.user.customer_id,
      booking_date,
      booking_time
    );
    res.redirect('/book/viewBookings?success=Booking rescheduled successfully.');
  } catch (err) {
    console.error(err);
    const booking = await bookingModel.getCustomerBookingById(req.params.bookingId, req.session.user.customer_id).catch(() => null);

    if (!booking) {
      return res.redirect('/book/viewBookings?error=Could not reschedule booking.');
    }

    res.render('booking/reschedule', {
      title: 'Reschedule Booking',
      booking,
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

    res.render('booking/book', {
      title: 'Complete Your Booking',
      merchant,
      serviceList,
      selectedService,
      staff,
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
  const { service_id, booking_date, booking_time, full_name, phone, email, booking_mode } = req.body;
  try {
    const qr = await qrModel.getQRByToken(token);
    if (!qr) return res.redirect(`/book/${token}`);
    const services = await merchantModel.getMerchantServices(qr.merchant_id).catch(() => []);

    if (!isCurrentOrFutureSlot(booking_date, booking_time)) {
      return renderQRBookingPage(req, res, {
        token,
        qr,
        services,
        error: 'Please choose a booking date and time that is not in the past.',
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
      source:      'qr',
      guestName,
      guestEmail,
      guestPhone,
    });

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

    if (req.session.user.role !== 'customer' || !req.session.user.customer_id) {
      return res.status(403).render('booking/arrivalStatus', {
        title: 'Customer Login Required',
        state: 'invalid',
        merchantName: qr.merchant_name,
        booking: null,
        message: 'Please scan this QR with a customer account to confirm arrival.',
      });
    }

    const result = await bookingModel.markCustomerArrivedForMerchant(
      req.session.user.customer_id,
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

    const {
      merchantId,
      serviceId,
      staffId,
      bookingDate
    } = req.query;

    const slots = await bookingModel.getAvailableSlots({
      merchantId,
      serviceId,
      staffId,
      bookingDate
    });

    res.json(slots);

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
  cancelCustomerBooking,
  showRescheduleBooking,
  rescheduleCustomerBooking,
  confirmArrival,
  getAvailableSlots
};
