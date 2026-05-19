const axios = require('axios');
const qrModel       = require('../models/qrModel');
const merchantModel = require('../models/merchantModel');
const authModel     = require('../models/authModel');
const bookingModel  = require('../models/bookingModel');
const staffModel = require('../models/staffModel');
const bcrypt        = require('bcryptjs');

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

function isCurrentOrFutureSlot(bookingDate, bookingTime) {
  if (!bookingDate || !bookingTime) return false;
  const slot = new Date(`${bookingDate}T${String(bookingTime).slice(0, 5)}:00`);
  return !Number.isNaN(slot.getTime()) && slot >= new Date();
}

async function showPortalBookingPage(req, res) {
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
    res.redirect('/');
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

async function showPortalBookingPage(req, res) {
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
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading booking page');
  }
}

async function confirmBooking(req, res) {
  const { token } = req.params;
  const { service_id, booking_date, booking_time, full_name, phone, email } = req.body;
  try {
    const qr = await qrModel.getQRByToken(token);
    if (!qr) return res.redirect(`/book/${token}`);
    if (!isCurrentOrFutureSlot(booking_date, booking_time)) {
      const services = await merchantModel.getMerchantServices(qr.merchant_id).catch(() => []);
      return res.render('booking/page', {
        title: 'Book Appointment',
        qr,
        services,
        error: 'Please choose a booking date and time that is not in the past.',
      });
    }

    // find or create a guest user record
    let user = await authModel.findUserByEmail(email);
    if (!user) {
      const hash = await bcrypt.hash(Math.random().toString(36), 8);
      const uid  = await authModel.createUser(full_name, email, hash, phone, 'customer');
      user = { user_id: uid };
    }

    const bookingId = await bookingModel.createBooking({
      customerId:  user.user_id,
      serviceId:   service_id,
      merchantId:  qr.merchant_id,
      bookingDate: booking_date,
      bookingTime: booking_time,
      source:      'qr',
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
    res.render('booking/page', { title: 'Book Appointment', qr, services, error: 'Booking failed. Please try again.' });
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
  showPortalBookingPage,
  confirmPortalBooking,
  viewCustomerBookings,
  cancelCustomerBooking,
  showRescheduleBooking,
  rescheduleCustomerBooking,
  confirmArrival,
  getAvailableSlots
};
