const { createNoopEmailProvider } = require('./noopEmailProvider');
const { createSmtpEmailProvider } = require('./smtpEmailProvider');

let missingConfigWarningShown = false;

function envValue(name) {
  return String(process.env[name] || '').trim();
}

function hasSmtpConfig() {
  return Boolean(envValue('SMTP_HOST') && envValue('SMTP_USER') && envValue('SMTP_PASS'));
}

function getSmtpPassword() {
  const password = envValue('SMTP_PASS');
  const host = envValue('SMTP_HOST').toLowerCase();

  if (host.includes('gmail.com')) {
    return password.replace(/\s+/g, '');
  }

  return password;
}

function getFromAddress() {
  return envValue('SMTP_FROM') || envValue('SMTP_USER') || 'no-reply@uniday.local';
}

function normalizeRecipient(value) {
  return String(value || '').trim().toLowerCase();
}

function shouldLogSmtpDebug() {
  return envValue('SMTP_DEBUG').toLowerCase() === 'true';
}

function getEmailProviderName() {
  const configured = envValue('EMAIL_PROVIDER').toLowerCase();
  if (configured) return configured;
  return hasSmtpConfig() ? 'smtp' : 'noop';
}

function getSmtpConfig() {
  return {
    host: envValue('SMTP_HOST'),
    port: Number(envValue('SMTP_PORT')) || 587,
    secure: envValue('SMTP_SECURE').toLowerCase() === 'true',
    user: envValue('SMTP_USER'),
    pass: getSmtpPassword(),
    debug: shouldLogSmtpDebug(),
  };
}

function createEmailProvider() {
  const provider = getEmailProviderName();

  if (provider === 'smtp') {
    if (hasSmtpConfig()) {
      return createSmtpEmailProvider({
        config: getSmtpConfig(),
        logger: console,
      });
    }

    if (!missingConfigWarningShown) {
      console.warn('[email] EMAIL_PROVIDER=smtp but SMTP_HOST, SMTP_USER, or SMTP_PASS is missing. Falling back to noop email provider.');
      missingConfigWarningShown = true;
    }
  } else if (provider && provider !== 'noop') {
    if (!missingConfigWarningShown) {
      console.warn(`[email] EMAIL_PROVIDER=${provider} is not supported yet. Falling back to noop email provider.`);
      missingConfigWarningShown = true;
    }
  }

  return createNoopEmailProvider({ logger: console });
}

function canDeliverEmail() {
  return createEmailProvider().canDeliver;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(value) {
  return String(value || '').slice(0, 5);
}

function bookingLines(booking) {
  return [
    `Booking #${booking.booking_id}`,
    `Service: ${booking.service_name}`,
    `Merchant: ${booking.merchant_name}`,
    `Date: ${formatDate(booking.booking_date)}`,
    `Time: ${formatTime(booking.booking_time)}`,
    booking.merchant_address ? `Address: ${booking.merchant_address}` : null,
  ].filter(Boolean);
}

function bookingHtmlRows(booking) {
  const rows = [
    ['Booking', `#${booking.booking_id}`],
    ['Service', booking.service_name],
    ['Merchant', booking.merchant_name],
    ['Date', formatDate(booking.booking_date)],
    ['Time', formatTime(booking.booking_time)],
    booking.merchant_address ? ['Address', booking.merchant_address] : null,
  ].filter(Boolean);

  return rows.map(([label, value]) => `
    <tr>
      <td style="padding:8px 12px;color:#71717A;border-bottom:1px solid #F3E8EC;">${escapeHtml(label)}</td>
      <td style="padding:8px 12px;font-weight:700;border-bottom:1px solid #F3E8EC;">${escapeHtml(value)}</td>
    </tr>
  `).join('');
}

async function sendMailOrLog({ to, subject, text, html, logLabel }) {
  const recipient = normalizeRecipient(to);
  if (!recipient) return { sent: false, reason: 'NO_RECIPIENT' };

  const provider = createEmailProvider();
  const result = await provider.send({
    from: getFromAddress(),
    to: recipient,
    subject,
    text,
    html,
    logLabel,
  });

  return result;
}

async function sendPasswordResetEmail(user, resetUrl) {
  const name = user.full_name || 'there';
  const safeResetUrl = escapeHtml(resetUrl);
  const text = [
    `Hi ${name},`,
    '',
    'We received a request to reset your Uniday password.',
    `Set a new password here: ${resetUrl}`,
    '',
    'This link expires in 1 hour. If you did not request this, you can ignore this email.',
    '',
    'Uniday',
  ].join('\n');

  return sendMailOrLog({
    to: user.email,
    subject: 'Reset your Uniday password',
    text,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#18181B;">
        <h2 style="color:#E11D48;margin:0 0 12px;">Reset your Uniday password</h2>
        <p>Hi ${escapeHtml(name)},</p>
        <p>We received a request to reset your Uniday password.</p>
        <p>If you requested this change, set a new password here:</p>
        <p>
          <a href="${safeResetUrl}" style="display:inline-block;background:#E11D48;color:#fff;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:700;">
            Set a New Password
          </a>
        </p>
        <p style="color:#71717A;font-size:14px;">This link expires in 1 hour. If you did not request this, you can ignore this email.</p>
      </div>
    `,
    logLabel: 'Password reset link',
  });
}

async function sendLogin2faEmail(user, loginUrl) {
  const name = user.full_name || 'there';
  const safeLoginUrl = escapeHtml(loginUrl);
  const text = [
    `Hi ${name},`,
    '',
    'Your Uniday password was accepted. Use this secure link to finish signing in:',
    loginUrl,
    '',
    'This link expires in 10 minutes. If you did not try to sign in, you can ignore this email.',
    '',
    'Uniday',
  ].join('\n');

  return sendMailOrLog({
    to: user.email,
    subject: 'Finish signing in to Uniday',
    text,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#18181B;">
        <h2 style="color:#E11D48;margin:0 0 12px;">Finish signing in to Uniday</h2>
        <p>Hi ${escapeHtml(name)},</p>
        <p>Your password was accepted. Use this secure link to finish signing in:</p>
        <p>
          <a href="${safeLoginUrl}" style="display:inline-block;background:#E11D48;color:#fff;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:700;">
            Finish Sign In
          </a>
        </p>
        <p style="color:#71717A;font-size:14px;">This link expires in 10 minutes. If you did not try to sign in, you can ignore this email.</p>
      </div>
    `,
    logLabel: 'Login verification link',
  });
}

async function sendEmailVerificationEmail(user, verificationUrl) {
  const name = user.full_name || 'there';
  const text = [
    `Hi ${name},`,
    '',
    'Welcome to Uniday. Please verify your email address to activate your account.',
    `Verify your email: ${verificationUrl}`,
    '',
    'This link expires in 24 hours.',
    '',
    'Uniday',
  ].join('\n');

  return sendMailOrLog({
    to: user.email,
    subject: 'Verify your Uniday email',
    text,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#18181B;">
        <h2 style="color:#E11D48;margin:0 0 12px;">Verify your Uniday email</h2>
        <p>Hi ${escapeHtml(name)},</p>
        <p>Welcome to Uniday. Please verify your email address to activate your account.</p>
        <p>
          <a href="${escapeHtml(verificationUrl)}" style="display:inline-block;background:#E11D48;color:#fff;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:700;">
            Verify email
          </a>
        </p>
        <p style="color:#71717A;font-size:14px;">This link expires in 24 hours.</p>
      </div>
    `,
    logLabel: 'Email verification link',
  });
}

async function sendWelcomeEmail(user, verificationUrl) {
  const name = user.full_name || 'there';
  const text = [
    `Hi ${name},`,
    '',
    'Welcome to Uniday. Your account has been created successfully.',
    '',
    'Use this secure link to verify your email and complete account protection:',
    verificationUrl,
    '',
    'This link expires in 24 hours.',
    '',
    'Uniday',
  ].join('\n');

  return sendMailOrLog({
    to: user.email,
    subject: 'Welcome to Uniday',
    text,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#18181B;">
        <h2 style="color:#E11D48;margin:0 0 12px;">Welcome to Uniday</h2>
        <p>Hi ${escapeHtml(name)}, your account has been created successfully.</p>
        <p>Use this secure link to verify your email and complete account protection.</p>
        <p>
          <a href="${escapeHtml(verificationUrl)}" style="display:inline-block;background:#E11D48;color:#fff;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:700;">
            Verify email
          </a>
        </p>
        <p style="color:#71717A;font-size:14px;">This link expires in 24 hours.</p>
      </div>
    `,
    logLabel: 'Welcome email',
  });
}

async function sendBookingConfirmationEmail(booking, receiptUrl = null, recipient = null) {
  const safeRecipient = recipient || {
    kind: 'customer',
    email: booking.customer_email,
    name: booking.customer_name,
  };
  const recipientName = safeRecipient.name || 'there';
  const isMerchant = safeRecipient.kind === 'merchant';
  const details = bookingLines(booking);
  const text = [
    `Hi ${recipientName},`,
    '',
    isMerchant
      ? 'A Uniday booking has been confirmed after payment.'
      : 'Your Uniday booking is confirmed.',
    '',
    ...details,
    isMerchant && booking.customer_name ? `Customer: ${booking.customer_name}` : null,
    isMerchant && booking.customer_phone ? `Customer phone: ${booking.customer_phone}` : null,
    !isMerchant && receiptUrl ? `Receipt: ${receiptUrl}` : null,
    '',
    isMerchant
      ? 'You can view this booking from your merchant dashboard.'
      : 'Please scan the merchant arrival QR when you reach the store.',
    '',
    'Uniday',
  ].filter(Boolean).join('\n');

  return sendMailOrLog({
    to: safeRecipient.email,
    subject: isMerchant
      ? `New confirmed booking: ${booking.service_name}`
      : `Booking confirmed: ${booking.service_name}`,
    text,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#18181B;">
        <h2 style="color:#E11D48;margin:0 0 12px;">Booking confirmed</h2>
        <p>Hi ${escapeHtml(recipientName)}, ${isMerchant ? 'a Uniday booking has been confirmed after payment.' : 'your Uniday booking is confirmed.'}</p>
        <table style="border-collapse:collapse;width:100%;max-width:520px;background:#fff;border:1px solid #F3E8EC;border-radius:12px;overflow:hidden;">
          ${bookingHtmlRows(booking)}
          ${isMerchant && booking.customer_name ? `
            <tr>
              <td style="padding:8px 12px;color:#71717A;border-bottom:1px solid #F3E8EC;">Customer</td>
              <td style="padding:8px 12px;font-weight:700;border-bottom:1px solid #F3E8EC;">${escapeHtml(booking.customer_name)}</td>
            </tr>
          ` : ''}
          ${isMerchant && booking.customer_phone ? `
            <tr>
              <td style="padding:8px 12px;color:#71717A;border-bottom:1px solid #F3E8EC;">Customer phone</td>
              <td style="padding:8px 12px;font-weight:700;border-bottom:1px solid #F3E8EC;">${escapeHtml(booking.customer_phone)}</td>
            </tr>
          ` : ''}
        </table>
        ${!isMerchant && receiptUrl ? `<p><a href="${escapeHtml(receiptUrl)}" style="display:inline-block;background:#E11D48;color:#fff;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:700;">View receipt</a></p>` : ''}
        <p style="color:#71717A;font-size:14px;">${isMerchant ? 'You can view this booking from your merchant dashboard.' : 'Please scan the merchant arrival QR when you reach the store.'}</p>
      </div>
    `,
    logLabel: 'Booking confirmation',
  });
}

async function sendBookingCreatedEmail(booking, recipient) {
  const name = recipient.name || 'there';
  const isMerchant = recipient.kind === 'merchant';
  const details = bookingLines(booking);
  const text = [
    `Hi ${name},`,
    '',
    isMerchant
      ? 'A new Uniday booking is pending payment.'
      : 'Your Uniday booking has been reserved and is waiting for payment.',
    '',
    ...details,
    isMerchant && booking.customer_name ? `Customer: ${booking.customer_name}` : null,
    isMerchant && booking.customer_phone ? `Customer phone: ${booking.customer_phone}` : null,
    '',
    isMerchant
      ? 'You will receive another notification when payment is completed.'
      : 'Please complete payment from My Bookings before the hold expires.',
    '',
    'Uniday',
  ].filter(Boolean).join('\n');

  return sendMailOrLog({
    to: recipient.email,
    subject: isMerchant
      ? `New booking pending payment: ${booking.service_name}`
      : `Complete payment: ${booking.service_name}`,
    text,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#18181B;">
        <h2 style="color:#E11D48;margin:0 0 12px;">Booking reserved</h2>
        <p>Hi ${escapeHtml(name)}, ${isMerchant ? 'a new Uniday booking is pending payment.' : 'your Uniday booking has been reserved and is waiting for payment.'}</p>
        <table style="border-collapse:collapse;width:100%;max-width:520px;background:#fff;border:1px solid #F3E8EC;border-radius:12px;overflow:hidden;">
          ${bookingHtmlRows(booking)}
          ${isMerchant && booking.customer_name ? `
            <tr>
              <td style="padding:8px 12px;color:#71717A;border-bottom:1px solid #F3E8EC;">Customer</td>
              <td style="padding:8px 12px;font-weight:700;border-bottom:1px solid #F3E8EC;">${escapeHtml(booking.customer_name)}</td>
            </tr>
          ` : ''}
          ${isMerchant && booking.customer_phone ? `
            <tr>
              <td style="padding:8px 12px;color:#71717A;border-bottom:1px solid #F3E8EC;">Customer phone</td>
              <td style="padding:8px 12px;font-weight:700;border-bottom:1px solid #F3E8EC;">${escapeHtml(booking.customer_phone)}</td>
            </tr>
          ` : ''}
        </table>
        <p style="color:#71717A;font-size:14px;">${isMerchant ? 'You will receive another notification when payment is completed.' : 'Please complete payment from My Bookings before the hold expires.'}</p>
      </div>
    `,
    logLabel: 'Booking created',
  });
}

async function sendBookingReminderEmail(booking) {
  const customerName = booking.customer_name || 'there';
  const details = bookingLines(booking);
  const text = [
    `Hi ${customerName},`,
    '',
    'Reminder: your Uniday booking is coming up tomorrow.',
    '',
    ...details,
    '',
    'Uniday',
  ].join('\n');

  return sendMailOrLog({
    to: booking.customer_email,
    subject: `Reminder: ${booking.service_name} tomorrow`,
    text,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#18181B;">
        <h2 style="color:#E11D48;margin:0 0 12px;">Booking reminder</h2>
        <p>Hi ${escapeHtml(customerName)}, your Uniday booking is coming up tomorrow.</p>
        <table style="border-collapse:collapse;width:100%;max-width:520px;background:#fff;border:1px solid #F3E8EC;border-radius:12px;overflow:hidden;">
          ${bookingHtmlRows(booking)}
        </table>
      </div>
    `,
    logLabel: 'Booking reminder',
  });
}

async function sendBookingCancellationEmail(booking, recipient) {
  const name = recipient.name || 'there';
  const reason = String(booking.cancellation_reason || '').trim();
  const refundAmount = Number(booking.refund_amount || booking.refundAmount || 0);
  const details = bookingLines(booking);
  const text = [
    `Hi ${name},`,
    '',
    'This Uniday booking has been cancelled.',
    reason ? `Reason: ${reason}` : null,
    refundAmount > 0 ? `A refund of S$${refundAmount.toFixed(2)} has been initiated.` : null,
    '',
    ...details,
    '',
    'Uniday',
  ].join('\n');

  return sendMailOrLog({
    to: recipient.email,
    subject: `Booking cancelled: ${booking.service_name}`,
    text,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#18181B;">
        <h2 style="color:#E11D48;margin:0 0 12px;">Booking cancelled</h2>
        <p>Hi ${escapeHtml(name)}, this Uniday booking has been cancelled.</p>
        ${reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ''}
        ${refundAmount > 0 ? `<p>A refund of <strong>S$${refundAmount.toFixed(2)}</strong> has been initiated.</p>` : ''}
        <table style="border-collapse:collapse;width:100%;max-width:520px;background:#fff;border:1px solid #F3E8EC;border-radius:12px;overflow:hidden;">
          ${bookingHtmlRows(booking)}
        </table>
      </div>
    `,
    logLabel: 'Booking cancellation',
  });
}

async function sendBookingRescheduledEmail(booking, previousBooking, recipient) {
  const name = recipient.name || 'there';
  const oldDate = formatDate(previousBooking.booking_date);
  const oldTime = formatTime(previousBooking.booking_time);
  const details = bookingLines(booking);
  const text = [
    `Hi ${name},`,
    '',
    'This Uniday booking has been rescheduled.',
    `Previous time: ${oldDate} at ${oldTime}`,
    '',
    ...details,
    '',
    'Uniday',
  ].join('\n');

  return sendMailOrLog({
    to: recipient.email,
    subject: `Booking rescheduled: ${booking.service_name}`,
    text,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#18181B;">
        <h2 style="color:#E11D48;margin:0 0 12px;">Booking rescheduled</h2>
        <p>Hi ${escapeHtml(name)}, this Uniday booking has been rescheduled.</p>
        <p style="color:#71717A;font-size:14px;">Previous time: ${escapeHtml(oldDate)} at ${escapeHtml(oldTime)}</p>
        <table style="border-collapse:collapse;width:100%;max-width:520px;background:#fff;border:1px solid #F3E8EC;border-radius:12px;overflow:hidden;">
          ${bookingHtmlRows(booking)}
        </table>
      </div>
    `,
    logLabel: 'Booking reschedule',
  });
}

async function sendWaitlistOfferEmail(entry, confirmUrl = null) {
  const customerName = entry.customer_name || 'there';
  const date = formatDate(entry.booking_date);
  const time = formatTime(entry.booking_time);
  const minutes = Number(entry.offer_minutes || 15);
  const text = [
    `Hi ${customerName},`,
    '',
    `Good news: a ${entry.service_name} slot at ${entry.merchant_name} is now available.`,
    `Date: ${date}`,
    `Time: ${time}`,
    '',
    `You have ${minutes} minutes to confirm this slot from My Bookings.`,
    confirmUrl ? `Open My Bookings: ${confirmUrl}` : null,
    '',
    'Uniday',
  ].filter(Boolean).join('\n');

  return sendMailOrLog({
    to: entry.customer_email,
    subject: `Slot available: ${entry.service_name}`,
    text,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#18181B;">
        <h2 style="color:#E11D48;margin:0 0 12px;">Your waitlist slot is available</h2>
        <p>Hi ${escapeHtml(customerName)}, a <strong>${escapeHtml(entry.service_name)}</strong> slot at <strong>${escapeHtml(entry.merchant_name)}</strong> is now available.</p>
        <table style="border-collapse:collapse;width:100%;max-width:520px;background:#fff;border:1px solid #F3E8EC;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:8px 12px;color:#71717A;border-bottom:1px solid #F3E8EC;">Date</td>
            <td style="padding:8px 12px;font-weight:700;border-bottom:1px solid #F3E8EC;">${escapeHtml(date)}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;color:#71717A;border-bottom:1px solid #F3E8EC;">Time</td>
            <td style="padding:8px 12px;font-weight:700;border-bottom:1px solid #F3E8EC;">${escapeHtml(time)}</td>
          </tr>
        </table>
        <p style="color:#71717A;font-size:14px;">You have ${minutes} minutes to confirm this slot from My Bookings.</p>
        ${confirmUrl ? `<p><a href="${escapeHtml(confirmUrl)}" style="display:inline-block;background:#E11D48;color:#fff;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:700;">Open My Bookings</a></p>` : ''}
      </div>
    `,
    logLabel: 'Waitlist slot offer',
  });
}

async function sendWebSupportReplyEmail(request) {
  const reference = `SUP-${request.log_id}`;
  const name = request.customer_name || 'there';
  const category = request.error_type || 'support';
  const reply = request.reply || '';
  const text = [
    `Hi ${name},`,
    '',
    'Uniday has reviewed your support request.',
    `Support reference: ${reference}`,
    `Original issue category: ${category}`,
    '',
    'Administrator response:',
    reply,
    '',
    'Uniday Support'
  ].join('\n');

  return sendMailOrLog({
    to: request.recipient_email,
    subject: `Uniday Support Reply - ${reference}`,
    text,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#18181B;">
        <h2 style="color:#E11D48;margin:0 0 12px;">Uniday Support Reply</h2>
        <p>Hi ${escapeHtml(name)},</p>
        <p>Uniday has reviewed your support request.</p>
        <p><strong>Support reference:</strong> ${escapeHtml(reference)}</p>
        <p><strong>Original issue category:</strong> ${escapeHtml(category)}</p>
        <div style="margin:16px 0;padding:14px 16px;background:#FFF1F2;border:1px solid #FFE4E6;border-radius:12px;">
          <p style="font-weight:700;margin:0 0 8px;">Administrator response</p>
          <p style="white-space:pre-line;margin:0;">${escapeHtml(reply)}</p>
        </div>
        <p style="color:#71717A;font-size:14px;">Uniday Support</p>
      </div>
    `,
    logLabel: 'Web support reply'
  });
}

module.exports = {
  hasSmtpConfig,
  canDeliverEmail,
  createEmailProvider,
  sendPasswordResetEmail,
  sendLogin2faEmail,
  sendEmailVerificationEmail,
  sendWelcomeEmail,
  sendBookingCreatedEmail,
  sendBookingConfirmationEmail,
  sendBookingReminderEmail,
  sendBookingCancellationEmail,
  sendBookingRescheduledEmail,
  sendWaitlistOfferEmail,
  sendWebSupportReplyEmail,
};
