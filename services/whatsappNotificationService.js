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
  buildBookingConfirmationMessage,
  sendSupportReply,
  toWhatsAppAddress
};
