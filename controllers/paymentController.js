const stripe       = require('stripe')(process.env.STRIPE_SECRET_KEY);
const bookingModel = require('../models/bookingModel');
const paymentModel = require('../models/paymentModel');

async function showCheckout(req, res) {
  const { bookingId } = req.params;
  try {
    const booking = await bookingModel.getBookingById(bookingId);
    if (!booking) return res.redirect('/');
    res.render('payment/checkout', {
      title:              'Checkout',
      booking,
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
}

async function processStripe(req, res) {
  const { bookingId } = req.params;
  try {
    const booking = await bookingModel.getBookingById(bookingId);
    if (!booking) return res.redirect('/');
    const amount = Number(booking.payable_amount || booking.total_amount || booking.price);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency:     'sgd',
          product_data: { name: booking.service_name, description: `at ${booking.merchant_name}` },
          unit_amount:  Math.round(amount * 100),
        },
        quantity: 1,
      }],
      mode:        'payment',
      success_url: `${process.env.APP_URL}/payment/success?booking_id=${bookingId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.APP_URL}/payment/checkout/${bookingId}`,
      metadata:    { booking_id: bookingId },
    });

    res.redirect(303, session.url);
  } catch (err) {
    console.error(err);
    res.redirect(`/payment/checkout/${bookingId}`);
  }
}

async function paymentSuccess(req, res) {
  const { booking_id, session_id } = req.query;
  try {
    const existing = await paymentModel.getPaymentByBooking(booking_id);
    if (!existing || existing.payment_status !== 'paid') {
      const session = await stripe.checkout.sessions.retrieve(session_id);
      if (session.payment_status === 'paid') {
        if (!existing) {
          await paymentModel.createPayment(booking_id, session.amount_total / 100, 'stripe');
        }
        await paymentModel.updatePaymentStatus(booking_id, 'paid', session.payment_intent);
        await bookingModel.updateBookingStatus(booking_id, 'confirmed');
      }
    }
    const booking = await bookingModel.getBookingById(booking_id);
    res.render('payment/success', { title: 'Payment Successful', booking });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
}

module.exports = { showCheckout, processStripe, paymentSuccess };
