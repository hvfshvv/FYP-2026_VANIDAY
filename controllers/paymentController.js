const bookingModel = require('../models/bookingModel');
const paymentModel = require('../models/paymentModel');

const PAYMENT_METHODS = ['stripe', 'paynow', 'wallet', 'cash'];

async function showCheckout(req, res) {
  const { bookingId } = req.params;
  try {
    const booking = await bookingModel.getBookingById(bookingId);
    if (!booking) return res.redirect('/');
    const payment = await paymentModel.getPaymentByBooking(bookingId);
    res.render('payment/checkout', {
      title:              'Checkout',
      booking,
      payment,
      error: null,
    });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
}

async function processPayment(req, res) {
  const { bookingId } = req.params;
  const { payment_method } = req.body;
  try {
    const booking = await bookingModel.getBookingById(bookingId);
    if (!booking) return res.redirect('/');

    if (!PAYMENT_METHODS.includes(payment_method)) {
      const payment = await paymentModel.getPaymentByBooking(bookingId);
      return res.status(400).render('payment/checkout', {
        title: 'Checkout',
        booking,
        payment,
        error: 'Please choose a valid payment method.',
      });
    }

    const amount = Number(booking.payable_amount || booking.total_amount || booking.price);
    const transactionRef = `UNIDAY-${bookingId}-${Date.now()}`;

    await paymentModel.createOrUpdatePayment(bookingId, amount, payment_method);
    await paymentModel.updatePaymentStatus(bookingId, 'paid', transactionRef);
    await bookingModel.updateBookingStatus(bookingId, 'confirmed');

    res.redirect(`/payment/success?booking_id=${bookingId}`);
  } catch (err) {
    console.error(err);
    res.redirect(`/payment/checkout/${bookingId}`);
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
    console.error(err);
    res.redirect('/');
  }
}

module.exports = { showCheckout, processPayment, paymentSuccess };
