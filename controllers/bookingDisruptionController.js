const disruptionModel = require('../models/bookingDisruptionModel');
const bookingModel = require('../models/bookingModel');
const walletModel = require('../models/walletModel');
const notificationModel = require('../models/notificationModel');
const bookingNotificationModel = require('../models/bookingNotificationModel');
const emailService = require('../services/emailService');
const refundService = require('../services/refundService');
const whatsappNotificationService = require('../services/whatsappNotificationService');
const whatsappModel = require('../models/whatsappModel');

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
  const stripeRefund = await refundService.refundBookingPayment(booking.booking_id, {
    refundPercentage: 100,
    reason: 'requested_by_customer',
  });
  if (stripeRefund.skipped && booking.status !== 'pending_payment') {
    throw new Error(`Booking was cancelled, but no Stripe refund was created: ${stripeRefund.reason}`);
  }
  return stripeRefund;
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

async function sendStaffReplacementProposalEmail(request) {
  if (!request.customer_email) return;
  const baseUrl = (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
  const actionUrl = `${baseUrl}/book/viewBookings#booking-${request.booking_id}`;

  try {
    const result = await emailService.sendStaffReplacementProposalEmail(request, actionUrl);
    await bookingNotificationModel.recordEmailNotification(
      request,
      'staff_replacement_proposal',
      `staff replacement proposal email to customer (${request.customer_email}) for booking #${request.booking_id}`,
      result.sent ? 'sent' : 'failed'
    );
  } catch (err) {
    console.error('staff replacement proposal email failed:', err);
  }
}

async function recordWhatsAppAttempt(booking, notificationType, description, result) {
  const sent = Boolean(result && !result.skipped && !result.error);
  await bookingNotificationModel.recordWhatsAppNotification(
    booking,
    notificationType,
    description,
    sent ? 'sent' : 'failed'
  );
  return sent;
}

async function sendMerchantCancellationWhatsApp(booking, reason, refundAmount = 0) {
  if (!booking || booking.source !== 'whatsapp') return;

  try {
    const alreadySent = await bookingNotificationModel.hasSentWhatsAppNotification(
      booking.booking_id,
      'cancellation'
    );
    if (alreadySent) return;

    const result = await whatsappNotificationService.sendBookingCancellation({
      ...booking,
      cancellation_reason: reason,
      refund_amount: refundAmount,
      refund_percentage: 100,
      full_refund: true,
    });
    await recordWhatsAppAttempt(
      booking,
      'cancellation',
      `Merchant cancellation WhatsApp for booking #${booking.booking_id}`,
      result
    );
    if (result && (result.skipped || result.error)) {
      console.warn('[whatsapp] merchant cancellation notification not sent for booking %s: %s',
        booking.booking_id, result.reason || result.error);
    }
  } catch (err) {
    console.error('[whatsapp] merchant cancellation notification failed for booking %s:',
      booking.booking_id, err.message || err);
    await bookingNotificationModel.recordWhatsAppNotification(
      booking,
      'cancellation',
      `Merchant cancellation WhatsApp failed for booking #${booking.booking_id}`,
      'failed'
    ).catch(() => {});
  }
}

async function sendStaffReplacementProposalWhatsApp(request) {
  if (!request || request.source !== 'whatsapp') return;

  try {
    const result = await whatsappNotificationService.sendStaffReplacementProposal(
      request
    );
    await recordWhatsAppAttempt(
      request,
      'staff_replacement_proposal',
      `Staff replacement proposal WhatsApp for booking #${request.booking_id}`,
      result
    );
    if (result && (result.skipped || result.error)) {
      console.warn('[whatsapp] staff replacement proposal not sent for booking %s: %s',
        request.booking_id, result.reason || result.error);
    }
  } catch (err) {
    console.error('[whatsapp] staff replacement proposal failed for booking %s:',
      request.booking_id, err.message || err);
    await bookingNotificationModel.recordWhatsAppNotification(
      request,
      'staff_replacement_proposal',
      `Staff replacement proposal WhatsApp failed for booking #${request.booking_id}`,
      'failed'
    ).catch(() => {});
  }
}

async function armWhatsAppReplacementChoice(request) {
  if (!request || request.source !== 'whatsapp' || !request.customer_phone) return;

  await whatsappModel.updateActiveSessionStateByPhone(request.customer_phone, {
    state: 'replacement_awaiting_choice',
    customer: {
      customer_id: request.customer_id,
      user_id: request.customer_user_id || request.customer_id,
      full_name: request.customer_name,
    },
    replacementRequestId: request.change_request_id || request.booking_id,
    bookingId: request.booking_id,
    merchantId: request.merchant_id,
  });
}

async function sendStaffReplacementAcceptedWhatsApp(request) {
  if (!request || request.source !== 'whatsapp') return;

  try {
    const result = await whatsappNotificationService.sendStaffReplacementAccepted(request);
    await recordWhatsAppAttempt(
      request,
      'staff_replacement_accepted',
      `Staff replacement acceptance WhatsApp for booking #${request.booking_id}`,
      result
    );
    if (result && (result.skipped || result.error)) {
      console.warn('[whatsapp] staff replacement acceptance not sent for booking %s: %s',
        request.booking_id, result.reason || result.error);
    }
  } catch (err) {
    console.error('[whatsapp] staff replacement acceptance failed for booking %s:',
      request.booking_id, err.message || err);
    await bookingNotificationModel.recordWhatsAppNotification(
      request,
      'staff_replacement_accepted',
      `Staff replacement acceptance WhatsApp failed for booking #${request.booking_id}`,
      'failed'
    ).catch(() => {});
  }
}

async function notifyReplacementAccepted(request) {
  const when = `${String(request.booking_date).slice(0, 10)} at ${String(request.booking_time).slice(0, 5)}`;

  if (request.customer_user_id || request.customer_id) {
    await notificationModel.createNotification({
      userId: request.customer_user_id || request.customer_id,
      bookingId: request.booking_id,
      title: 'Replacement staff confirmed',
      message: `${request.proposed_staff_name} is confirmed for your ${request.service_name} appointment at ${request.merchant_name} on ${when}. Your appointment time is unchanged.`,
      notificationType: 'staff_replacement_accepted',
      actionUrl: '/book/viewBookings#booking-' + request.booking_id,
      actionLabel: 'View booking',
    });
  }

  if (request.merchant_user_id) {
    await notificationModel.createNotification({
      userId: request.merchant_user_id,
      bookingId: request.booking_id,
      title: 'Staff replacement accepted',
      message: `${request.customer_name || 'The customer'} accepted the replacement staff, ${request.proposed_staff_name}, for booking #${request.booking_id} (${request.service_name}) on ${when}.`,
      notificationType: 'staff_replacement_accepted',
      actionUrl: '/merchant/bookings#booking-' + request.booking_id,
      actionLabel: 'View booking',
    });
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
    await sendMerchantCancellationWhatsApp(booking, reason, amount);
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
    await sendStaffReplacementProposalEmail(request);
    await armWhatsAppReplacementChoice(request);
    await sendStaffReplacementProposalWhatsApp(request);
    res.redirect('/merchant/bookings?success=' + encodeURIComponent('Replacement proposal sent to the customer.'));
  } catch (err) {
    console.error('[replacement proposal]', err);
    res.redirect('/merchant/bookings?error=' + encodeURIComponent(err.message || 'Could not propose replacement staff.'));
  }
}

async function acceptReplacementForCustomer(requestId, selectedCustomerId, { sendWhatsApp = true } = {}) {
  const request = await disruptionModel.acceptReplacement(requestId, selectedCustomerId);
  await notifyReplacementAccepted(request).catch(err => {
    console.error('[replacement acceptance] in-app notification failed:', err.message || err);
  });
  if (sendWhatsApp) {
    await sendStaffReplacementAcceptedWhatsApp(request);
  }
  return request;
}

async function acceptReplacement(req, res) {
  try {
    await acceptReplacementForCustomer(req.params.requestId, customerId(req));
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

async function cancelReplacementForCustomer(requestId, selectedCustomerId, { sendWhatsApp = true } = {}) {
  const request = await disruptionModel.markRequest(requestId, selectedCustomerId, 'cancelled');
  const cancellationReason = 'Customer declined replacement staff after staff unavailability.';
  const booking = await disruptionModel.cancelBookingByMerchant({
    bookingId: request.booking_id,
    merchantId: request.merchant_id,
    reason: cancellationReason,
    blockSlot: true,
  });
  const refund = await refundInFull(booking);
  const amount = Number(refund.amount || refund.refundAmount || 0);
  await notifyCustomer(booking,
    `Your ${booking.service_name} appointment was cancelled after you declined the replacement staff. A 100% refund${amount ? ` of S$${amount.toFixed(2)}` : ''} has been initiated.`
  );
  await sendCustomerCancellationEmail(booking, cancellationReason, amount);
  if (sendWhatsApp) {
    await sendMerchantCancellationWhatsApp(booking, cancellationReason, amount);
  }
  if (request.merchant_user_id) {
    await notificationModel.createNotification({
      userId: request.merchant_user_id,
      bookingId: booking.booking_id,
      title: 'Replacement declined and refunded',
      message: `${request.customer_name || 'The customer'} declined the replacement for ${booking.service_name}. The booking was cancelled and a 100% refund${amount ? ` of S$${amount.toFixed(2)}` : ''} was processed.`,
      notificationType: 'staff_replacement_cancelled',
      actionUrl: '/merchant/bookings#booking-' + booking.booking_id,
      actionLabel: 'View booking',
    }).catch(err => {
      console.error('[replacement cancellation] merchant notification failed:', err.message || err);
    });
  }
  return { request, booking, refund, amount };
}

async function cancelReplacement(req, res) {
  try {
    await cancelReplacementForCustomer(req.params.requestId, customerId(req));
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
        await sendMerchantCancellationWhatsApp(
          booking,
          `${reason} Emergency closure period: ${formatDateTime(req.body.starts_at)} to ${formatDateTime(req.body.ends_at)}.`,
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
  requestReschedule, cancelReplacement, emergencyClosure,
  acceptReplacementForCustomer, cancelReplacementForCustomer };
