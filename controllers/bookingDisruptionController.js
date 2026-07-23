const disruptionModel = require('../models/bookingDisruptionModel');
const bookingModel = require('../models/bookingModel');
const walletModel = require('../models/walletModel');
const notificationModel = require('../models/notificationModel');
const bookingNotificationModel = require('../models/bookingNotificationModel');
const emailService = require('../services/emailService');
const refundService = require('../services/refundService');

function customerId(req) {
  return req.session.user.customer_id || req.session.user.user_id;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' });
}

async function refundInFull(booking) {
  const walletRefund = await walletModel.refundBooking({
    customerId: booking.customer_id,
    bookingId: booking.booking_id,
    refundPercentage: 100,
  });
  if (walletRefund.refunded || walletRefund.reason !== 'not_wallet_payment') return walletRefund;
  return refundService.refundBookingPayment(booking.booking_id, {
    refundPercentage: 100,
    reason: 'requested_by_customer',
  });
}

async function notifyCustomer(booking, message, title = 'Booking cancelled') {
  if (!booking.customer_id) return;
  await notificationModel.createNotification({
    userId: booking.customer_user_id || booking.customer_id,
    bookingId: booking.booking_id,
    title,
    message,
    notificationType: title === 'Staff replacement proposed' ? 'booking_change_proposed' : 'booking_cancelled',
    actionUrl: '/book/viewBookings#booking-' + booking.booking_id,
    actionLabel: 'View booking',
  });
}

async function sendCustomerCancellationEmail(booking, reason, refundAmount = 0) {
  if (!booking.customer_email) return;

  const recipient = {
    kind: 'customer',
    email: booking.customer_email,
    name: booking.customer_name,
  };

  try {
    const alreadySent = await bookingNotificationModel.hasSentEmailNotification(
      booking.booking_id,
      'cancellation',
      'customer'
    );

    if (alreadySent) return;

    const result = await emailService.sendBookingCancellationEmail({
      ...booking,
      cancelled_by: 'merchant',
      cancellation_reason: reason,
      refund_amount: refundAmount,
    }, recipient);

    await bookingNotificationModel.recordEmailNotification(
      booking,
      'cancellation',
      `cancellation email to customer (${recipient.email}) for booking #${booking.booking_id}`,
      result.sent ? 'sent' : 'failed'
    );
  } catch (err) {
    console.error('merchant cancellation email failed:', err);
  }
}

async function cancelOther(req, res) {
  const merchantId = req.session.user.merchant_id;
  const reason = String(req.body.reason || '').trim();
  if (reason.length < 5) {
    return res.redirect('/merchant/bookings?error=' + encodeURIComponent('Please provide a clear cancellation reason.'));
  }
  try {
    const booking = await disruptionModel.cancelBookingByMerchant({
      bookingId: req.params.bookingId, merchantId, reason, blockSlot: true,
    });
    const refund = await refundInFull(booking);
    const amount = Number(refund.amount || refund.refundAmount || 0);
    await notifyCustomer(booking,
      `We are sorry, but your ${booking.service_name} appointment at ${booking.merchant_name} on ${String(booking.booking_date).slice(0, 10)} at ${String(booking.booking_time).slice(0, 5)} was cancelled by the merchant. Reason: ${reason}. A 100% refund${amount ? ` of S$${amount.toFixed(2)}` : ''} has been initiated. We sincerely apologise for the inconvenience.`
    );
    await sendCustomerCancellationEmail(booking, reason, amount);
    res.redirect('/merchant/bookings?success=' + encodeURIComponent('Booking cancelled, slot blocked, and 100% refund initiated.'));
  } catch (err) {
    console.error('[merchant cancellation]', err);
    res.redirect('/merchant/bookings?error=' + encodeURIComponent(err.message || 'Could not cancel booking.'));
  }
}

async function proposeReplacement(req, res) {
  const merchantId = req.session.user.merchant_id;
  const reason = String(req.body.reason || 'Assigned staff member is unexpectedly unavailable.').trim();
  try {
    const request = await disruptionModel.createStaffReplacementRequest({
      bookingId: req.params.bookingId,
      merchantId,
      proposedStaffId: req.body.proposed_staff_id,
      reason,
    });
    await notifyCustomer(request,
      `${request.staff_name || 'Your selected staff member'} is unexpectedly unavailable for your ${request.service_name} appointment. ${request.proposed_staff.full_name} is available at the same time. Please accept the replacement, choose another date/time, or cancel for a 100% refund.`,
      'Staff replacement proposed'
    );
    res.redirect('/merchant/bookings?success=' + encodeURIComponent('Replacement proposal sent to the customer.'));
  } catch (err) {
    console.error('[replacement proposal]', err);
    res.redirect('/merchant/bookings?error=' + encodeURIComponent(err.message || 'Could not propose replacement staff.'));
  }
}

async function acceptReplacement(req, res) {
  try {
    await disruptionModel.acceptReplacement(req.params.requestId, customerId(req));
    res.redirect('/book/viewBookings?success=' + encodeURIComponent('Replacement staff accepted. Your appointment time is unchanged.'));
  } catch (err) {
    res.redirect('/book/viewBookings?error=' + encodeURIComponent(err.message || 'Could not accept replacement.'));
  }
}

async function requestReschedule(req, res) {
  try {
    const request = await disruptionModel.getPendingRequestForCustomer(req.params.requestId, customerId(req));
    if (!request) throw new Error('This replacement proposal is no longer available.');
    res.redirect(`/book/${request.booking_id}/reschedule?changeRequest=${request.change_request_id}`);
  } catch (err) {
    res.redirect('/book/viewBookings?error=' + encodeURIComponent(err.message || 'Could not request rescheduling.'));
  }
}

async function cancelReplacement(req, res) {
  try {
    const request = await disruptionModel.markRequest(req.params.requestId, customerId(req), 'cancelled');
    const booking = await disruptionModel.cancelBookingByMerchant({
      bookingId: request.booking_id,
      merchantId: request.merchant_id,
      reason: 'Customer declined replacement staff after staff unavailability.',
      blockSlot: true,
    });
    const refund = await refundInFull(booking);
    const amount = Number(refund.amount || refund.refundAmount || 0);
    await notifyCustomer(booking,
      `Your ${booking.service_name} appointment was cancelled after you declined the replacement staff. A 100% refund${amount ? ` of S$${amount.toFixed(2)}` : ''} has been initiated.`
    );
    res.redirect('/book/viewBookings?success=' + encodeURIComponent('Booking cancelled and a 100% refund was initiated.'));
  } catch (err) {
    console.error('[replacement cancellation]', err);
    res.redirect('/book/viewBookings?error=' + encodeURIComponent(err.message || 'Could not cancel booking.'));
  }
}

async function emergencyClosure(req, res) {
  const merchantId = req.session.user.merchant_id;
  const reason = String(req.body.reason || '').trim();
  if (reason.length < 5) {
    return res.redirect('/merchant/bookings?error=' + encodeURIComponent('Please explain the emergency closure.'));
  }
  try {
    const closure = await disruptionModel.createEmergencyClosure({
      merchantId, startsAt: req.body.starts_at, endsAt: req.body.ends_at, reason,
    });
    let cancelled = 0;
    const refundErrors = [];
    for (const item of closure.bookings) {
      try {
        const booking = await disruptionModel.cancelBookingByMerchant({
          bookingId: item.booking_id, merchantId, reason, blockSlot: false,
        });
        const refund = await refundInFull(booking);
        const amount = Number(refund.amount || refund.refundAmount || 0);
        await notifyCustomer(booking,
          `Due to an unexpected closure, your ${booking.service_name} appointment at ${booking.merchant_name} on ${String(booking.booking_date).slice(0, 10)} at ${String(booking.booking_time).slice(0, 5)} has been cancelled. The merchant will be closed from ${formatDateTime(req.body.starts_at)} to ${formatDateTime(req.body.ends_at)}. A 100% refund${amount ? ` of S$${amount.toFixed(2)}` : ''} has been initiated. We sincerely apologise for the inconvenience.`
        );
        await sendCustomerCancellationEmail(
          booking,
          `${reason} Closure period: ${formatDateTime(req.body.starts_at)} to ${formatDateTime(req.body.ends_at)}.`,
          amount
        );
        cancelled += 1;
      } catch (err) {
        refundErrors.push(`#${item.booking_id}: ${err.message}`);
      }
    }
    const message = `Emergency closure saved. ${cancelled} affected booking(s) cancelled with full refunds initiated.`;
    const suffix = refundErrors.length ? '&error=' + encodeURIComponent('Some bookings need review: ' + refundErrors.join('; ')) : '';
    res.redirect('/merchant/bookings?success=' + encodeURIComponent(message) + suffix);
  } catch (err) {
    console.error('[emergency closure]', err);
    res.redirect('/merchant/bookings?error=' + encodeURIComponent(err.message || 'Could not create emergency closure.'));
  }
}

module.exports = { cancelOther, proposeReplacement, acceptReplacement,
  requestReschedule, cancelReplacement, emergencyClosure };
