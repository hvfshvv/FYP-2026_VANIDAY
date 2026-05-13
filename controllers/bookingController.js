const qrModel       = require('../models/qrModel');
const merchantModel = require('../models/merchantModel');
const authModel     = require('../models/authModel');
const bookingModel  = require('../models/bookingModel');
const bcrypt        = require('bcryptjs');

async function showPortalBookingPage(req, res) {
  const { merchantId, serviceId } = req.query;
  try {
    const merchant = merchantId ? await merchantModel.getMerchantById(merchantId) : null;
    const services = merchantId ? await merchantModel.getMerchantServices(merchantId) : [];
    res.render('booking/book', { title: 'Complete Your Booking', merchant, services, selectedServiceId: serviceId || null });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading booking page');
  }
}
async function showBookingPage(req, res) {
  const { token } = req.params;
  try {
    const qr = await qrModel.getQRByToken(token);
    if (!qr) return res.render('booking/invalid', { title: 'Invalid QR Code' });

    const services = await merchantModel.getMerchantServices(qr.merchant_id);
    if (!services.length) {
      return res.render('booking/invalid', { title: 'No Services Available' });
    }
    res.render('booking/page', { title: `Book at ${qr.merchant_name}`, qr, services, error: null });
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong. Please try again.');
  }
}

async function confirmBooking(req, res) {
  const { token } = req.params;
  const { service_id, booking_date, booking_time, full_name, phone, email } = req.body;
  try {
    const qr = await qrModel.getQRByToken(token);
    if (!qr) return res.redirect(`/book/${token}`);

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
    res.redirect(`/booking/confirmation/${bookingId}`);
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
}

module.exports = { showPortalBookingPage, showBookingPage, confirmBooking, confirmArrival };

