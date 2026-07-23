const bookingNotificationModel = require('../models/bookingNotificationModel');
const emailService = require('./emailService');
const whatsappNotificationService = require('./whatsappNotificationService');
const adminValidationModel = require('../models/adminValidationModel');

let running = false;

async function sendDueBookingEmailReminders() {
  if (running) return { skipped: true, sent: 0, failed: 0 };
  running = true;

  let sent = 0;
  let failed = 0;

  try {
    const bookings = await bookingNotificationModel.getBookingsNeedingEmailReminders();

    for (const booking of bookings) {
      try {
        const result = await emailService.sendBookingReminderEmail(booking);
        await bookingNotificationModel.recordEmailNotification(
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
        await bookingNotificationModel.recordEmailNotification(
          booking,
          'reminder_24h',
          `24-hour reminder email failed for booking #${booking.booking_id}`,
          'failed'
        ).catch(recordErr => {
          console.error('booking reminder notification log failed:', recordErr);
        });
      }
    }

    await sendDueBookingWhatsAppReminders().catch(err => {
      console.error('booking WhatsApp reminder run failed:', err);
    });

    return { skipped: false, sent, failed };
  } finally {
    running = false;
  }
}

async function sendDueBookingWhatsAppReminders() {
  let sent = 0;
  let failed = 0;

  const bookings = await bookingNotificationModel.getBookingsNeedingWhatsAppReminders();

  for (const booking of bookings) {
    try {
      const result = await whatsappNotificationService.sendBookingReminder(booking);
      await bookingNotificationModel.recordWhatsAppNotification(
        booking,
        'reminder_24h',
        `24-hour reminder WhatsApp for booking #${booking.booking_id}`,
        result && !result.skipped && !result.error ? 'sent' : 'failed'
      );

      if (result && !result.skipped && !result.error) {
        sent += 1;
      } else {
        failed += 1;
        if (result && result.error) {
          await adminValidationModel.logTechnicalValidationError({
            userId: booking.customer_id,
            bookingId: booking.booking_id,
            module: 'whatsapp',
            errorType: 'WHATSAPP_REMINDER_FAILED',
            errorMessage: 'WhatsApp booking reminder send failed.'
          });
        }
      }
    } catch (err) {
      failed += 1;
      console.error('booking WhatsApp reminder failed:', err);
      await adminValidationModel.logTechnicalValidationError({
        userId: booking.customer_id,
        bookingId: booking.booking_id,
        module: 'whatsapp',
        errorType: 'WHATSAPP_REMINDER_FAILED',
        errorMessage: 'WhatsApp booking reminder send failed.'
      });
      await bookingNotificationModel.recordWhatsAppNotification(
        booking,
        'reminder_24h',
        `24-hour reminder WhatsApp failed for booking #${booking.booking_id}`,
        'failed'
      ).catch(recordErr => {
        console.error('booking WhatsApp reminder notification log failed:', recordErr);
      });
    }
  }

  return { sent, failed };
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
  sendDueBookingWhatsAppReminders,
  startReminderScheduler,
};
