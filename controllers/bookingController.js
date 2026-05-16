const qrModel       = require('../models/qrModel');
const merchantModel = require('../models/merchantModel');
const authModel     = require('../models/authModel');
const bookingModel  = require('../models/bookingModel');
const staffModel = require('../models/staffModel');
const bcrypt        = require('bcryptjs');


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
  confirmArrival,
  getAvailableSlots
};
