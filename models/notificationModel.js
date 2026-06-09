const db = require('../config/db');

let schemaReady = false;

const ACTIVE_UNREAD_FILTER = `
  NOT (
    n.notification_type = 'booking_created'
    AND b.status IS NOT NULL
    AND b.status <> 'pending_payment'
  )
  AND NOT (
    n.notification_type IN ('booking_confirmed', 'booking_rescheduled')
    AND b.status = 'cancelled'
  )
`;

async function ensureNotificationSchema() {
  if (schemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      booking_id INT NULL,
      title VARCHAR(150) NOT NULL,
      message TEXT NOT NULL,
      notification_type VARCHAR(50) NOT NULL DEFAULT 'general',
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_notifications_user_read (user_id, is_read, created_at),
      INDEX idx_notifications_booking (booking_id),
      CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE,
      CONSTRAINT fk_notifications_booking
        FOREIGN KEY (booking_id) REFERENCES booking(booking_id)
        ON DELETE SET NULL
    )
  `);

  schemaReady = true;
}

async function createNotification({
  userId,
  bookingId = null,
  title,
  message,
  notificationType = 'general',
  isRead = false,
}) {
  if (!userId || !title || !message) return null;
  await ensureNotificationSchema();

  const [result] = await db.query(
    `INSERT INTO notifications
       (user_id, booking_id, title, message, notification_type, is_read)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, bookingId, title, message, notificationType, isRead]
  );

  return result.insertId;
}

async function createAssistantMessage(options) {
  return createNotification({
    ...options,
    notificationType: options.notificationType || 'assistant',
  });
}

async function hasNotificationForUserBooking(userId, bookingId, notificationType) {
  if (!userId || !bookingId || !notificationType) return false;
  await ensureNotificationSchema();

  const [[row]] = await db.query(
    `SELECT id
     FROM notifications
     WHERE user_id = ?
       AND booking_id = ?
       AND notification_type = ?
     LIMIT 1`,
    [userId, bookingId, notificationType]
  );

  return Boolean(row);
}

async function createAssistantMessageOnce(options) {
  const exists = await hasNotificationForUserBooking(
    options.userId,
    options.bookingId,
    options.notificationType
  );

  if (exists) return null;
  return createAssistantMessage(options);
}

async function createAssistantExchange(userId, question, answer) {
  await createNotification({
    userId,
    title: 'You',
    message: question,
    notificationType: 'assistant_question',
    isRead: true,
  });

  return createAssistantMessage({
    userId,
    title: 'Uniday Assistant',
    message: answer,
    notificationType: 'assistant_answer',
  });
}

async function getNotificationsForUser(userId, limit = 50) {
  await ensureNotificationSchema();

  const safeLimit = Number.isFinite(Number(limit))
    ? Math.min(Math.max(Number(limit), 1), 100)
    : 50;

  const [rows] = await db.query(
    `SELECT n.*, b.status AS booking_status
     FROM notifications n
     LEFT JOIN booking b ON b.booking_id = n.booking_id
     WHERE n.user_id = ?
     ORDER BY n.created_at DESC
     LIMIT ?`,
    [userId, safeLimit]
  );

  return rows;
}

async function getUnreadForUser(userId, limit = 5) {
  if (!userId) return [];
  await ensureNotificationSchema();

  const safeLimit = Number.isFinite(Number(limit))
    ? Math.min(Math.max(Number(limit), 1), 20)
    : 5;

  const [rows] = await db.query(
    `SELECT n.*, b.status AS booking_status
     FROM notifications n
     LEFT JOIN booking b ON b.booking_id = n.booking_id
     WHERE n.user_id = ?
       AND n.is_read = FALSE
       AND ${ACTIVE_UNREAD_FILTER}
     ORDER BY n.created_at DESC
     LIMIT ?`,
    [userId, safeLimit]
  );

  return rows;
}

async function countUnreadForUser(userId) {
  if (!userId) return 0;
  await ensureNotificationSchema();

  const [[row]] = await db.query(
    `SELECT COUNT(*) AS total
     FROM notifications n
     LEFT JOIN booking b ON b.booking_id = n.booking_id
     WHERE n.user_id = ?
       AND n.is_read = FALSE
       AND ${ACTIVE_UNREAD_FILTER}`,
    [userId]
  );

  return Number(row?.total || 0);
}

async function markNotificationRead(notificationId, userId) {
  await ensureNotificationSchema();

  await db.query(
    `UPDATE notifications
     SET is_read = TRUE
     WHERE id = ? AND user_id = ?`,
    [notificationId, userId]
  );
}

async function markAllRead(userId) {
  await ensureNotificationSchema();

  await db.query(
    `UPDATE notifications
     SET is_read = TRUE
     WHERE user_id = ? AND is_read = FALSE`,
    [userId]
  );
}

async function markBookingMessagesRead(userId, bookingId, excludeType = null) {
  if (!userId || !bookingId) return;
  await ensureNotificationSchema();

  const params = [userId, bookingId];
  let excludeClause = '';

  if (excludeType) {
    excludeClause = 'AND notification_type <> ?';
    params.push(excludeType);
  }

  await db.query(
    `UPDATE notifications
     SET is_read = TRUE
     WHERE user_id = ?
       AND booking_id = ?
       AND is_read = FALSE
       ${excludeClause}`,
    params
  );
}

async function getMerchantOwnerUserId(merchantId) {
  const [[merchant]] = await db.query(
    'SELECT user_id FROM merchant WHERE merchant_id = ? LIMIT 1',
    [merchantId]
  );

  return merchant?.user_id || null;
}

function formatBookingTime(booking) {
  const date = booking.booking_date
    ? new Date(booking.booking_date).toLocaleDateString('en-SG', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'the selected date';
  const time = String(booking.booking_time || '').slice(0, 5);
  return `${date}${time ? ' at ' + time : ''}`;
}

async function notifySignup(user) {
  return createAssistantMessage({
    userId: user.user_id,
    title: 'Uniday Assistant',
    message: `Hi ${user.full_name || 'there'}, welcome to Uniday. Your account is ready, and I will keep your booking updates here.`,
    notificationType: 'signup',
  });
}

async function notifyBookingCreated(booking) {
  if (!booking) return;

  const tasks = [];
  const when = formatBookingTime(booking);

  if (booking.customer_id) {
    tasks.push(createAssistantMessage({
      userId: booking.customer_id,
      bookingId: booking.booking_id,
      title: 'Uniday Assistant',
      message: `I created your ${booking.service_name} booking at ${booking.merchant_name} for ${when}. You can continue to payment from your bookings page.`,
      notificationType: 'booking_created',
    }));
  }

  const merchantUserId = await getMerchantOwnerUserId(booking.merchant_id);
  if (merchantUserId) {
    tasks.push(createAssistantMessage({
      userId: merchantUserId,
      bookingId: booking.booking_id,
      title: 'Uniday Assistant',
      message: `${booking.customer_name || 'A customer'} just created a ${booking.service_name} booking for ${when}.`,
      notificationType: 'booking_created',
    }));
  }

  await Promise.all(tasks);
}

async function notifyBookingConfirmed(booking) {
  if (!booking) return;

  const tasks = [];
  const when = formatBookingTime(booking);

  if (booking.customer_id) {
    await markBookingMessagesRead(booking.customer_id, booking.booking_id, 'booking_confirmed');
    tasks.push(createAssistantMessageOnce({
      userId: booking.customer_id,
      bookingId: booking.booking_id,
      title: 'Uniday Assistant',
      message: `Payment received. Your ${booking.service_name} booking at ${booking.merchant_name} is confirmed for ${when}. See you there.`,
      notificationType: 'booking_confirmed',
    }));
  }

  const merchantUserId = await getMerchantOwnerUserId(booking.merchant_id);
  if (merchantUserId) {
    await markBookingMessagesRead(merchantUserId, booking.booking_id, 'booking_confirmed');
    tasks.push(createAssistantMessageOnce({
      userId: merchantUserId,
      bookingId: booking.booking_id,
      title: 'Uniday Assistant',
      message: `Payment received for ${booking.customer_name || 'a customer'}'s ${booking.service_name} booking on ${when}.`,
      notificationType: 'booking_confirmed',
    }));
  }

  await Promise.all(tasks);
}

async function notifyBookingCancelled(booking) {
  if (!booking) return;

  const tasks = [];

  if (booking.customer_id) {
    await markBookingMessagesRead(booking.customer_id, booking.booking_id, 'booking_cancelled');
    tasks.push(createAssistantMessage({
      userId: booking.customer_id,
      bookingId: booking.booking_id,
      title: 'Uniday Assistant',
      message: `I have cancelled your ${booking.service_name} booking at ${booking.merchant_name}.`,
      notificationType: 'booking_cancelled',
    }));
  }

  const merchantUserId = await getMerchantOwnerUserId(booking.merchant_id);
  if (merchantUserId) {
    await markBookingMessagesRead(merchantUserId, booking.booking_id, 'booking_cancelled');
    tasks.push(createAssistantMessage({
      userId: merchantUserId,
      bookingId: booking.booking_id,
      title: 'Uniday Assistant',
      message: `${booking.customer_name || 'A customer'} cancelled a ${booking.service_name} booking.`,
      notificationType: 'booking_cancelled',
    }));
  }

  await Promise.all(tasks);
}

async function notifyBookingRescheduled(booking, previousBooking) {
  if (!booking) return;

  const tasks = [];
  const when = formatBookingTime(booking);
  const previousWhen = previousBooking ? formatBookingTime(previousBooking) : 'the previous time';

  if (booking.customer_id) {
    await markBookingMessagesRead(booking.customer_id, booking.booking_id, 'booking_rescheduled');
    tasks.push(createAssistantMessage({
      userId: booking.customer_id,
      bookingId: booking.booking_id,
      title: 'Uniday Assistant',
      message: `I rescheduled your ${booking.service_name} booking from ${previousWhen} to ${when}.`,
      notificationType: 'booking_rescheduled',
    }));
  }

  const merchantUserId = await getMerchantOwnerUserId(booking.merchant_id);
  if (merchantUserId) {
    await markBookingMessagesRead(merchantUserId, booking.booking_id, 'booking_rescheduled');
    tasks.push(createAssistantMessage({
      userId: merchantUserId,
      bookingId: booking.booking_id,
      title: 'Uniday Assistant',
      message: `${booking.customer_name || 'A customer'} moved a ${booking.service_name} booking from ${previousWhen} to ${when}.`,
      notificationType: 'booking_rescheduled',
    }));
  }

  await Promise.all(tasks);
}

module.exports = {
  ensureNotificationSchema,
  createNotification,
  createAssistantMessage,
  createAssistantMessageOnce,
  createAssistantExchange,
  getNotificationsForUser,
  getUnreadForUser,
  countUnreadForUser,
  markNotificationRead,
  markAllRead,
  markBookingMessagesRead,
  notifySignup,
  notifyBookingCreated,
  notifyBookingConfirmed,
  notifyBookingCancelled,
  notifyBookingRescheduled,
};
