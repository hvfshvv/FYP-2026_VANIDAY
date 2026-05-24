const bookingModel = require('../models/bookingModel');
const emailService = require('./emailService');

let running = false;

async function sendDueBookingEmailReminders() {
  if (running) return { skipped: true, sent: 0, failed: 0 };
  running = true;

  let sent = 0;
  let failed = 0;

  try {
    const bookings = await bookingModel.getBookingsNeedingEmailReminders();

    for (const booking of bookings) {
      try {
        const result = await emailService.sendBookingReminderEmail(booking);
        await bookingModel.recordEmailNotification(
          booking,
          'reminder_24h',
          `24-hour reminder email for booking #${booking.booking_id}`,
          result.sent ? 'sent' : 'failed'
        );

        if (result.sent) sent += 1;
        else failed += 1;
      } catch (err) {
        failed += 1;
        console.error('booking reminder email failed:', err);
        await bookingModel.recordEmailNotification(
          booking,
          'reminder_24h',
          `24-hour reminder email failed for booking #${booking.booking_id}`,
          'failed'
        ).catch(recordErr => {
          console.error('booking reminder notification log failed:', recordErr);
        });
      }
    }

    return { skipped: false, sent, failed };
  } finally {
    running = false;
  }
}

function startReminderScheduler() {
  if (process.env.EMAIL_REMINDERS_ENABLED === 'false') return null;

  const intervalMinutes = Number(process.env.EMAIL_REMINDER_INTERVAL_MINUTES) || 60;
  const intervalMs = Math.max(intervalMinutes, 5) * 60 * 1000;

  sendDueBookingEmailReminders().catch(err => {
    console.error('initial booking reminder run failed:', err);
  });

  return setInterval(() => {
    sendDueBookingEmailReminders().catch(err => {
      console.error('booking reminder run failed:', err);
    });
  }, intervalMs);
}

module.exports = {
  sendDueBookingEmailReminders,
  startReminderScheduler,
};
