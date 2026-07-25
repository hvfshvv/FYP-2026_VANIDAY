const twilio = require('twilio');

let cachedClient = null;

function getClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return null;
  }

  cachedClient = twilio(accountSid, authToken);
  return cachedClient;
}

function toWhatsAppAddress(phone) {
  const raw = String(phone || '').trim();

  if (!raw) {
    return null;
  }

  if (raw.startsWith('whatsapp:')) {
    return raw;
  }

  const digits = raw.replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  if (raw.startsWith('+')) {
    return 'whatsapp:+' + digits;
  }

  if (digits.length === 8) {
    return 'whatsapp:+65' + digits;
  }

  return 'whatsapp:+' + digits;
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  return String(value).slice(0, 10);
}

function formatTime(value) {
  return String(value || '-').slice(0, 5);
}

function buildBookingConfirmationMessage(booking) {
  return (
    'Your Uniday booking is confirmed!\n\n' +
    'Booking ID: ' + booking.booking_id + '\n' +
    'Merchant: ' + booking.merchant_name + '\n' +
    'Service: ' + booking.service_name + '\n' +
    'Date: ' + formatDate(booking.booking_date) + '\n' +
    'Time: ' + formatTime(booking.booking_time) + '\n' +
    'Staff: ' + (booking.staff_name || 'Any Available Staff') + '\n' +
    'Amount: $' + Number(booking.payable_amount || booking.total_amount || 0).toFixed(2)
  );
}

function buildBookingReminderMessage(booking) {
  return (
    'Reminder: you have an upcoming Uniday booking.\n\n' +
    'Booking ID: ' + booking.booking_id + '\n' +
    'Merchant: ' + booking.merchant_name + '\n' +
    'Service: ' + booking.service_name + '\n' +
    'Date: ' + formatDate(booking.booking_date) + '\n' +
    'Time: ' + formatTime(booking.booking_time) + '\n' +
    'Staff: ' + (booking.staff_name || 'Any Available Staff')
  );
}

function buildBookingCancellationMessage(booking) {
  const reason = String(booking.cancellation_reason || '').trim();
  const refundAmount = Number(booking.refund_amount || booking.refundAmount || 0);
  const fullRefund = booking.full_refund === true || Number(booking.refund_percentage) === 100;

  return (
    'Your Uniday booking has been cancelled.\n\n' +
    'Booking ID: ' + booking.booking_id + '\n' +
    'Merchant: ' + booking.merchant_name + '\n' +
    'Service: ' + booking.service_name + '\n' +
    'Date: ' + formatDate(booking.booking_date) + '\n' +
    'Time: ' + formatTime(booking.booking_time) +
    (reason ? '\nReason: ' + reason : '') +
    (fullRefund
      ? '\n\nA 100% refund' + (refundAmount > 0 ? ' of S$' + refundAmount.toFixed(2) : '') + ' has been initiated.'
      : (refundAmount > 0 ? '\n\nA refund of S$' + refundAmount.toFixed(2) + ' has been initiated.' : '')) +
    '\nWe sincerely apologise for the inconvenience.'
  );
}

function buildStaffReplacementProposalMessage(booking) {
  const proposedStaffName = booking.proposed_staff?.full_name ||
    booking.proposed_staff_name ||
    'the proposed replacement staff member';
  const reason = String(booking.staff_change_reason || booking.reason || '').trim();

  return (
    'Action required: staff replacement proposed.\n\n' +
    'Booking ID: ' + booking.booking_id + '\n' +
    'Merchant: ' + booking.merchant_name + '\n' +
    'Service: ' + booking.service_name + '\n' +
    'Date: ' + formatDate(booking.booking_date) + '\n' +
    'Time: ' + formatTime(booking.booking_time) + '\n' +
    'Proposed staff: ' + proposedStaffName +
    (reason ? '\nReason: ' + reason : '') +
    '\n\nPlease choose an option:\n' +
    '1. Accept replacement staff\n' +
    '2. Reschedule\n' +
    '3. Cancel with 100% refund\n\n' +
    'Reply with 1, 2, or 3.'
  );
}

function buildStaffReplacementAcceptedMessage(booking) {
  return (
    'Replacement staff confirmed.\n\n' +
    'Booking ID: ' + booking.booking_id + '\n' +
    'Merchant: ' + booking.merchant_name + '\n' +
    'Service: ' + booking.service_name + '\n' +
    'Date: ' + formatDate(booking.booking_date) + '\n' +
    'Time: ' + formatTime(booking.booking_time) + '\n' +
    'Staff: ' + (booking.proposed_staff_name || booking.staff_name || 'Replacement staff') +
    '\n\nYour appointment date and time remain unchanged.'
  );
}

function buildBookingRescheduledMessage(booking, previousBooking = null) {
  const previousDate = previousBooking ? formatDate(previousBooking.booking_date) : null;
  const previousTime = previousBooking ? formatTime(previousBooking.booking_time) : null;

  return (
    'Your Uniday booking has been rescheduled.\n\n' +
    'Booking ID: ' + booking.booking_id + '\n' +
    'Merchant: ' + booking.merchant_name + '\n' +
    'Service: ' + booking.service_name + '\n' +
    (previousDate && previousTime ? 'Previous: ' + previousDate + ' ' + previousTime + '\n' : '') +
    'New date: ' + formatDate(booking.booking_date) + '\n' +
    'New time: ' + formatTime(booking.booking_time) + '\n' +
    'Staff: ' + (booking.staff_name || 'Any Available Staff')
  );
}

function buildWaitlistOfferMessage(entry, confirmUrl = null) {
  return (
    'Good news! A Uniday waitlist slot is now available.\n\n' +
    'Merchant: ' + entry.merchant_name + '\n' +
    'Service: ' + entry.service_name + '\n' +
    'Date: ' + formatDate(entry.booking_date) + '\n' +
    'Time: ' + formatTime(entry.booking_time) + '\n\n' +
    'You have ' + Number(entry.offer_minutes || 30) + ' minutes to make payment before the slot is released.' +
    (confirmUrl ? '\n\nPay now: ' + confirmUrl : '')
  );
}

async function sendBookingConfirmation(booking) {
  if (!booking || booking.source !== 'whatsapp') {
    return { skipped: true, reason: 'not_whatsapp_booking' };
  }

  const client = getClient();
  const from = process.env.TWILIO_WHATSAPP_NUMBER;
  const to = toWhatsAppAddress(booking.customer_phone);

  if (!client || !from || !to) {
    return { skipped: true, reason: 'missing_twilio_config_or_phone' };
  }

  const message = await client.messages.create({
    from,
    to,
    body: buildBookingConfirmationMessage(booking)
  });

  return { skipped: false, sid: message.sid };
}

async function sendBookingReminder(booking) {
  if (!booking || booking.source !== 'whatsapp') {
    return { skipped: true, reason: 'not_whatsapp_booking' };
  }

  const client = getClient();
  const from = process.env.TWILIO_WHATSAPP_NUMBER;
  const to = toWhatsAppAddress(booking.customer_phone);
  const contentSid = process.env.TWILIO_WHATSAPP_REMINDER_CONTENT_SID;

  if (!client || !from || !to || !contentSid) {
    return { skipped: true, reason: 'missing_twilio_config_or_phone_or_template' };
  }

  try {
    const message = await client.messages.create({
      from,
      to,
      contentSid,
      contentVariables: JSON.stringify({
        '1': formatDate(booking.booking_date),
        '2': formatTime(booking.booking_time)
      })
    });

    return { skipped: false, sid: message.sid };
  } catch (err) {
    return { skipped: false, error: err.message || 'whatsapp_send_failed' };
  }
}

async function sendBookingCancellation(booking) {
  if (!booking || booking.source !== 'whatsapp') {
    return { skipped: true, reason: 'not_whatsapp_booking' };
  }

  const client = getClient();
  const from = process.env.TWILIO_WHATSAPP_NUMBER;
  const to = toWhatsAppAddress(booking.customer_phone);
  const contentSid = process.env.TWILIO_WHATSAPP_CANCELLATION_CONTENT_SID;

  if (!client || !from || !to) {
    return { skipped: true, reason: 'missing_twilio_config_or_phone' };
  }

  try {
    const payload = {
      from,
      to,
      body: buildBookingCancellationMessage(booking)
    };
    if (contentSid) {
      delete payload.body;
      payload.contentSid = contentSid;
      payload.contentVariables = JSON.stringify({
        '1': String(booking.booking_id),
        '2': booking.merchant_name,
        '3': booking.service_name,
        '4': formatDate(booking.booking_date),
        '5': formatTime(booking.booking_time),
        '6': String(booking.cancellation_reason || 'Merchant cancellation'),
        '7': Number(booking.refund_amount || booking.refundAmount || 0).toFixed(2)
      });
    }
    const message = await client.messages.create(payload);

    return { skipped: false, sid: message.sid };
  } catch (err) {
    return { skipped: false, error: err.message || 'whatsapp_send_failed' };
  }
}

async function sendStaffReplacementProposal(booking) {
  if (!booking || booking.source !== 'whatsapp') {
    return { skipped: true, reason: 'not_whatsapp_booking' };
  }

  const client = getClient();
  const from = process.env.TWILIO_WHATSAPP_NUMBER;
  const to = toWhatsAppAddress(booking.customer_phone);
  const contentSid = process.env.TWILIO_WHATSAPP_STAFF_REPLACEMENT_CONTENT_SID;

  if (!client || !from || !to) {
    return { skipped: true, reason: 'missing_twilio_config_or_phone' };
  }

  try {
    const payload = {
      from,
      to,
      body: buildStaffReplacementProposalMessage(booking)
    };
    if (contentSid) {
      delete payload.body;
      payload.contentSid = contentSid;
      payload.contentVariables = JSON.stringify({
        '1': String(booking.booking_id),
        '2': booking.merchant_name,
        '3': booking.service_name,
        '4': formatDate(booking.booking_date),
        '5': formatTime(booking.booking_time),
        '6': booking.proposed_staff?.full_name || booking.proposed_staff_name || 'Replacement staff',
        '7': String(booking.staff_change_reason || booking.reason || 'Assigned staff is unavailable'),
        '8': 'Reply 1 to accept, 2 to reschedule, or 3 to cancel with a 100% refund.'
      });
    }
    const message = await client.messages.create(payload);

    return { skipped: false, sid: message.sid };
  } catch (err) {
    return { skipped: false, error: err.message || 'whatsapp_send_failed' };
  }
}

async function sendStaffReplacementAccepted(booking) {
  if (!booking || booking.source !== 'whatsapp') {
    return { skipped: true, reason: 'not_whatsapp_booking' };
  }

  const client = getClient();
  const from = process.env.TWILIO_WHATSAPP_NUMBER;
  const to = toWhatsAppAddress(booking.customer_phone);
  const contentSid = process.env.TWILIO_WHATSAPP_STAFF_REPLACEMENT_ACCEPTED_CONTENT_SID;

  if (!client || !from || !to) {
    return { skipped: true, reason: 'missing_twilio_config_or_phone' };
  }

  try {
    const payload = {
      from,
      to,
      body: buildStaffReplacementAcceptedMessage(booking)
    };
    if (contentSid) {
      delete payload.body;
      payload.contentSid = contentSid;
      payload.contentVariables = JSON.stringify({
        '1': String(booking.booking_id),
        '2': booking.merchant_name,
        '3': booking.service_name,
        '4': formatDate(booking.booking_date),
        '5': formatTime(booking.booking_time),
        '6': booking.proposed_staff_name || booking.staff_name || 'Replacement staff'
      });
    }
    const message = await client.messages.create(payload);
    return { skipped: false, sid: message.sid };
  } catch (err) {
    return { skipped: false, error: err.message || 'whatsapp_send_failed' };
  }
}

async function sendBookingRescheduled(booking, previousBooking = null) {
  if (!booking || booking.source !== 'whatsapp') {
    return { skipped: true, reason: 'not_whatsapp_booking' };
  }

  const client = getClient();
  const from = process.env.TWILIO_WHATSAPP_NUMBER;
  const to = toWhatsAppAddress(booking.customer_phone);

  if (!client || !from || !to) {
    return { skipped: true, reason: 'missing_twilio_config_or_phone' };
  }

  try {
    const message = await client.messages.create({
      from,
      to,
      body: buildBookingRescheduledMessage(booking, previousBooking)
    });

    return { skipped: false, sid: message.sid };
  } catch (err) {
    return { skipped: false, error: err.message || 'whatsapp_send_failed' };
  }
}

async function sendWaitlistOffer(entry, confirmUrl = null) {
  const client = getClient();
  const from = process.env.TWILIO_WHATSAPP_NUMBER;
  const to = toWhatsAppAddress(entry && entry.customer_phone);

  if (!client || !from || !to) {
    return { skipped: true, reason: 'missing_twilio_config_or_phone' };
  }

  try {
    const message = await client.messages.create({
      from,
      to,
      body: buildWaitlistOfferMessage(entry, confirmUrl)
    });

    return { skipped: false, sid: message.sid };
  } catch (err) {
    return { skipped: false, error: err.message || 'whatsapp_send_failed' };
  }
}

async function sendSupportReply(phone, body) {
  const client = getClient();
  const from = process.env.TWILIO_WHATSAPP_NUMBER;
  const to = toWhatsAppAddress(phone);
  const safeBody = String(body || '').trim();

  if (!safeBody) {
    throw new Error('Reply message is required.');
  }

  if (!client || !from || !to) {
    throw new Error('WhatsApp sender or customer phone is not configured.');
  }

  const message = await client.messages.create({
    from,
    to,
    body: safeBody
  });

  return { sid: message.sid };
}

module.exports = {
  sendBookingConfirmation,
  sendBookingReminder,
  sendBookingCancellation,
  sendStaffReplacementProposal,
  sendStaffReplacementAccepted,
  sendBookingRescheduled,
  buildBookingConfirmationMessage,
  buildBookingReminderMessage,
  buildBookingCancellationMessage,
  buildStaffReplacementProposalMessage,
  buildStaffReplacementAcceptedMessage,
  buildBookingRescheduledMessage,
  buildWaitlistOfferMessage,
  sendWaitlistOffer,
  sendSupportReply,
  toWhatsAppAddress
};
