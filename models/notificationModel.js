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

const PRODUCT_NOTIFICATION_FILTER = `
  n.notification_type NOT IN ('assistant_question', 'assistant_answer')
`;

const ACTIVE_PAYMENT_HOLD_FILTER = `
  NOT (
    n.notification_type = 'booking_created'
    AND (
      b.booking_id IS NULL
      OR b.status <> 'pending_payment'
      OR COALESCE(p.payment_hold_expires_at, DATE_ADD(b.created_at, INTERVAL 5 MINUTE)) < NOW()
    )
  )
`;

const REVIEW_PROMPT_FILTER = `
  NOT (
    n.notification_type = 'review_available'
    AND EXISTS (
      SELECT 1
      FROM reviews r
      WHERE r.booking_id = n.booking_id
        AND r.customer_id = n.user_id
        AND r.review_target = 'merchant'
    )
  )
`;

const ACTIVE_WAITLIST_NOTIFICATION_FILTER = `
  NOT (
    n.notification_type = 'waitlist_offer'
    AND w.waitlist_id IS NOT NULL
    AND (
      w.status <> 'offered'
      OR w.offer_expires_at < NOW()
    )
  )
  AND NOT (
    n.notification_type = 'waitlist_joined'
    AND w.waitlist_id IS NOT NULL
    AND (
      w.status <> 'waiting'
      OR TIMESTAMP(w.booking_date, w.booking_time) < NOW()
    )
  )
`;

const NOTIFICATION_ACTION_SELECT = `
  CASE
    WHEN n.notification_type = 'booking_created'
      AND b.status = 'pending_payment'
      AND COALESCE(p.payment_hold_expires_at, DATE_ADD(b.created_at, INTERVAL 5 MINUTE)) >= NOW()
      THEN CONCAT('/payment/checkout/', n.booking_id)
    WHEN n.notification_type = 'payment_attempt_failed'
      AND b.status = 'pending_payment'
      AND COALESCE(p.payment_hold_expires_at, DATE_ADD(b.created_at, INTERVAL 5 MINUTE)) >= NOW()
      THEN CONCAT('/payment/checkout/', n.booking_id)
    WHEN n.notification_type = 'review_available' AND n.booking_id IS NOT NULL
      THEN CONCAT('/book/', n.booking_id, '/review')
    WHEN n.notification_type = 'review_reward'
      THEN '/loyalty'
    WHEN n.notification_type = 'waitlist_offer'
      AND w.status = 'offered'
      AND w.offer_expires_at >= NOW()
      THEN CONCAT('/book/waitlist/', n.waitlist_id, '/confirm')
    WHEN n.notification_type = 'waitlist_joined'
      AND w.status = 'waiting'
      THEN '/book/viewBookings'
    WHEN n.notification_type IN ('payment_failed', 'payment_window_expired') AND n.booking_id IS NOT NULL
      THEN CONCAT('/book/', n.booking_id, '/rebook')
    WHEN n.booking_id IS NOT NULL
      THEN '/book/viewBookings'
    ELSE NULL
  END AS action_url,
  CASE
    WHEN n.notification_type = 'booking_created'
      AND b.status = 'pending_payment'
      AND COALESCE(p.payment_hold_expires_at, DATE_ADD(b.created_at, INTERVAL 5 MINUTE)) >= NOW()
      THEN 'Continue payment'
    WHEN n.notification_type = 'payment_attempt_failed'
      AND b.status = 'pending_payment'
      AND COALESCE(p.payment_hold_expires_at, DATE_ADD(b.created_at, INTERVAL 5 MINUTE)) >= NOW()
      THEN 'Try payment again'
    WHEN n.notification_type = 'review_available' AND n.booking_id IS NOT NULL
      THEN 'Rate experience'
    WHEN n.notification_type = 'review_reward'
      THEN 'View rewards'
    WHEN n.notification_type = 'waitlist_offer'
      AND w.status = 'offered'
      AND w.offer_expires_at >= NOW()
      THEN 'Confirm slot'
    WHEN n.notification_type = 'waitlist_joined'
      AND w.status = 'waiting'
      THEN 'View waitlist'
    WHEN n.notification_type IN ('payment_failed', 'payment_window_expired') AND n.booking_id IS NOT NULL
      THEN 'Book again'
    WHEN n.booking_id IS NOT NULL
      THEN 'View booking'
    ELSE NULL
  END AS action_label,
  CASE
    WHEN n.notification_type IN ('booking_created', 'payment_attempt_failed')
      AND b.status = 'pending_payment'
      AND COALESCE(p.payment_hold_expires_at, DATE_ADD(b.created_at, INTERVAL 5 MINUTE)) >= NOW()
      THEN 'bi-credit-card'
    WHEN n.notification_type = 'review_available' AND n.booking_id IS NOT NULL
      THEN 'bi-star'
    WHEN n.notification_type = 'review_reward'
      THEN 'bi-gift'
    WHEN n.notification_type = 'waitlist_offer'
      AND w.status = 'offered'
      AND w.offer_expires_at >= NOW()
      THEN 'bi-check2-circle'
    WHEN n.notification_type = 'waitlist_joined'
      AND w.status = 'waiting'
      THEN 'bi-list-ol'
    WHEN n.notification_type IN ('payment_failed', 'payment_window_expired') AND n.booking_id IS NOT NULL
      THEN 'bi-arrow-clockwise'
    WHEN n.booking_id IS NOT NULL
      THEN 'bi-calendar-check'
    ELSE NULL
  END AS action_icon,
  CASE
    WHEN n.notification_type = 'waitlist_offer'
      AND w.status = 'offered'
      AND w.offer_expires_at >= NOW()
      THEN 'POST'
    ELSE 'GET'
  END AS action_method
`;

async function ensureNotificationSchema() {
  if (schemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      booking_id INT NULL,
      waitlist_id INT NULL,
      title VARCHAR(150) NOT NULL,
      message TEXT NOT NULL,
      notification_type VARCHAR(50) NOT NULL DEFAULT 'general',
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_notifications_user_read (user_id, is_read, created_at),
      INDEX idx_notifications_booking (booking_id),
      INDEX idx_notifications_waitlist (waitlist_id),
      CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE,
      CONSTRAINT fk_notifications_booking
        FOREIGN KEY (booking_id) REFERENCES booking(booking_id)
        ON DELETE SET NULL
    )
  `);

  await addNotificationColumnIfMissing('waitlist_id', 'waitlist_id INT NULL AFTER booking_id');
  await addNotificationIndexIfMissing('idx_notifications_waitlist', 'CREATE INDEX idx_notifications_waitlist ON notifications (waitlist_id)');

  schemaReady = true;
}

async function notificationColumnExists(columnName) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'notifications'
       AND COLUMN_NAME = ?`,
    [columnName]
  );

  return Number(rows[0]?.count || 0) > 0;
}

async function addNotificationColumnIfMissing(columnName, ddl) {
  if (await notificationColumnExists(columnName)) return;

  try {
    await db.query(`ALTER TABLE notifications ADD COLUMN ${ddl}`);
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') return;
    throw err;
  }
}

async function notificationIndexExists(indexName) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'notifications'
       AND INDEX_NAME = ?`,
    [indexName]
  );

  return Number(rows[0]?.count || 0) > 0;
}

async function addNotificationIndexIfMissing(indexName, ddl) {
  if (await notificationIndexExists(indexName)) return;

  try {
    await db.query(ddl);
  } catch (err) {
    if (err.code === 'ER_DUP_KEYNAME') return;
    throw err;
  }
}

async function createNotification({
  userId,
  bookingId = null,
  waitlistId = null,
  title,
  message,
  notificationType = 'general',
  isRead = false,
}) {
  if (!userId || !title || !message) return null;
  await ensureNotificationSchema();

  const [result] = await db.query(
    `INSERT INTO notifications
       (user_id, booking_id, waitlist_id, title, message, notification_type, is_read)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, bookingId, waitlistId, title, message, notificationType, isRead]
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

async function normalizeStalePaymentNotifications(userId = null) {
  await ensureNotificationSchema();

  const params = [];
  let userFilter = '';
  if (userId) {
    userFilter = 'AND n.user_id = ?';
    params.push(userId);
  }

  await db.query(
    `UPDATE notifications n
     JOIN booking b ON b.booking_id = n.booking_id
     JOIN service s ON s.service_id = b.service_id
     JOIN merchant m ON m.merchant_id = b.merchant_id
     LEFT JOIN notifications existing
       ON existing.user_id = n.user_id
      AND existing.booking_id = n.booking_id
      AND existing.notification_type = 'payment_window_expired'
     SET n.notification_type = 'payment_window_expired',
         n.title = 'Payment window expired',
         n.message = CONCAT(
           'Payment was not completed for your ',
           s.service_name,
           ' booking at ',
           m.merchant_name,
           '. The 5-minute payment window has expired.'
         ),
         n.is_read = FALSE,
         n.created_at = NOW()
     WHERE n.notification_type = 'booking_created'
       ${userFilter}
       AND b.status = 'payment_failed'
       AND existing.id IS NULL`,
    params
  );
}

async function getNotificationsForUser(userId, limit = 50) {
  await ensureNotificationSchema();
  await normalizeStalePaymentNotifications(userId);

  const safeLimit = Number.isFinite(Number(limit))
    ? Math.min(Math.max(Number(limit), 1), 100)
    : 50;

  const [rows] = await db.query(
    `SELECT n.*, b.status AS booking_status,
            CASE
              WHEN b.status = 'pending_payment'
               AND COALESCE(p.payment_hold_expires_at, DATE_ADD(b.created_at, INTERVAL 5 MINUTE)) >= NOW()
              THEN 1 ELSE 0
            END AS pending_payment_active,
            ${NOTIFICATION_ACTION_SELECT}
     FROM notifications n
     LEFT JOIN booking b ON b.booking_id = n.booking_id
     LEFT JOIN payment p ON p.booking_id = n.booking_id
     LEFT JOIN waitlist w ON w.waitlist_id = n.waitlist_id
     WHERE n.user_id = ?
       AND ${PRODUCT_NOTIFICATION_FILTER}
       AND ${ACTIVE_PAYMENT_HOLD_FILTER}
       AND ${REVIEW_PROMPT_FILTER}
       AND ${ACTIVE_WAITLIST_NOTIFICATION_FILTER}
     ORDER BY n.created_at DESC
     LIMIT ?`,
    [userId, safeLimit]
  );

  return rows;
}

async function getUnreadForUser(userId, limit = 5) {
  if (!userId) return [];
  await ensureNotificationSchema();
  await normalizeStalePaymentNotifications(userId);

  const safeLimit = Number.isFinite(Number(limit))
    ? Math.min(Math.max(Number(limit), 1), 20)
    : 5;

  const [rows] = await db.query(
    `SELECT n.*, b.status AS booking_status,
            ${NOTIFICATION_ACTION_SELECT}
     FROM notifications n
     LEFT JOIN booking b ON b.booking_id = n.booking_id
     LEFT JOIN payment p ON p.booking_id = n.booking_id
     LEFT JOIN waitlist w ON w.waitlist_id = n.waitlist_id
     WHERE n.user_id = ?
       AND n.is_read = FALSE
       AND ${ACTIVE_UNREAD_FILTER}
       AND ${PRODUCT_NOTIFICATION_FILTER}
       AND ${ACTIVE_PAYMENT_HOLD_FILTER}
       AND ${REVIEW_PROMPT_FILTER}
       AND ${ACTIVE_WAITLIST_NOTIFICATION_FILTER}
     ORDER BY n.created_at DESC
     LIMIT ?`,
    [userId, safeLimit]
  );

  return rows;
}

async function countUnreadForUser(userId) {
  if (!userId) return 0;
  await ensureNotificationSchema();
  await normalizeStalePaymentNotifications(userId);

  const [[row]] = await db.query(
    `SELECT COUNT(*) AS total
     FROM notifications n
     LEFT JOIN booking b ON b.booking_id = n.booking_id
     LEFT JOIN payment p ON p.booking_id = n.booking_id
     LEFT JOIN waitlist w ON w.waitlist_id = n.waitlist_id
     WHERE n.user_id = ?
       AND n.is_read = FALSE
       AND ${ACTIVE_UNREAD_FILTER}
       AND ${PRODUCT_NOTIFICATION_FILTER}
       AND ${ACTIVE_PAYMENT_HOLD_FILTER}
       AND ${REVIEW_PROMPT_FILTER}
       AND ${ACTIVE_WAITLIST_NOTIFICATION_FILTER}`,
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

async function markNotificationsRead(notificationIds, userId) {
  if (!userId || !Array.isArray(notificationIds) || !notificationIds.length) return;
  await ensureNotificationSchema();

  await db.query(
    `UPDATE notifications
     SET is_read = TRUE
     WHERE user_id = ?
       AND id IN (?)`,
    [userId, notificationIds]
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

async function markWaitlistMessagesRead(userId, waitlistId, excludeType = null) {
  if (!userId || !waitlistId) return;
  await ensureNotificationSchema();

  const params = [userId, waitlistId];
  let excludeClause = '';

  if (excludeType) {
    excludeClause = 'AND notification_type <> ?';
    params.push(excludeType);
  }

  await db.query(
    `UPDATE notifications
     SET is_read = TRUE
     WHERE user_id = ?
       AND waitlist_id = ?
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
  return createNotification({
    userId: user.user_id,
    title: 'Welcome to Uniday',
    message: `Hi ${user.full_name || 'there'}, your account is ready. Booking, payment, reward, and waitlist updates will appear here.`,
    notificationType: 'signup',
  });
}

async function notifyBookingCreated(booking) {
  if (!booking) return;

  const tasks = [];
  const when = formatBookingTime(booking);

  if (booking.customer_id) {
    tasks.push(createNotification({
      userId: booking.customer_id,
      bookingId: booking.booking_id,
      title: 'Complete your payment',
      message: `Your ${booking.service_name} booking at ${booking.merchant_name} is reserved for ${when}. Please complete payment before the hold expires.`,
      notificationType: 'booking_created',
    }));
  }

  const merchantUserId = await getMerchantOwnerUserId(booking.merchant_id);
  if (merchantUserId) {
    tasks.push(createNotification({
      userId: merchantUserId,
      bookingId: booking.booking_id,
      title: 'New booking pending payment',
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
      title: 'Booking successful',
      message: `Your ${booking.service_name} booking at ${booking.merchant_name} is confirmed for ${when}. Thank you.`,
      notificationType: 'booking_confirmed',
    }));
  }

  const merchantUserId = await getMerchantOwnerUserId(booking.merchant_id);
  if (merchantUserId) {
    await markBookingMessagesRead(merchantUserId, booking.booking_id, 'booking_confirmed');
    tasks.push(createAssistantMessageOnce({
      userId: merchantUserId,
      bookingId: booking.booking_id,
      title: 'Booking confirmed',
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
    tasks.push(createNotification({
      userId: booking.customer_id,
      bookingId: booking.booking_id,
      title: 'Booking cancelled',
      message: `Your ${booking.service_name} booking at ${booking.merchant_name} has been cancelled.`,
      notificationType: 'booking_cancelled',
    }));
  }

  const merchantUserId = await getMerchantOwnerUserId(booking.merchant_id);
  if (merchantUserId) {
    await markBookingMessagesRead(merchantUserId, booking.booking_id, 'booking_cancelled');
    tasks.push(createNotification({
      userId: merchantUserId,
      bookingId: booking.booking_id,
      title: 'Booking cancelled',
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
    tasks.push(createNotification({
      userId: booking.customer_id,
      bookingId: booking.booking_id,
      title: 'Booking rescheduled',
      message: `Your ${booking.service_name} booking was moved from ${previousWhen} to ${when}.`,
      notificationType: 'booking_rescheduled',
    }));
  }

  const merchantUserId = await getMerchantOwnerUserId(booking.merchant_id);
  if (merchantUserId) {
    await markBookingMessagesRead(merchantUserId, booking.booking_id, 'booking_rescheduled');
    tasks.push(createNotification({
      userId: merchantUserId,
      bookingId: booking.booking_id,
      title: 'Booking rescheduled',
      message: `${booking.customer_name || 'A customer'} moved a ${booking.service_name} booking from ${previousWhen} to ${when}.`,
      notificationType: 'booking_rescheduled',
    }));
  }

  await Promise.all(tasks);
}

async function notifyPaymentAttemptFailed(booking) {
  if (!booking || !booking.customer_id) return null;

  await markBookingMessagesRead(booking.customer_id, booking.booking_id, 'payment_attempt_failed');
  return createAssistantMessageOnce({
    userId: booking.customer_id,
    bookingId: booking.booking_id,
    title: 'Payment attempt failed',
    message: `A payment attempt failed for your ${booking.service_name} booking at ${booking.merchant_name}. Please try again before the payment hold expires.`,
    notificationType: 'payment_attempt_failed',
  });
}

async function notifyPaymentWindowExpired(booking) {
  if (!booking || !booking.customer_id) return null;

  const message = `Payment was not completed for your ${booking.service_name} booking at ${booking.merchant_name}. The slot has been released.`;

  await ensureNotificationSchema();
  const [updated] = await db.query(
    `UPDATE notifications n
     LEFT JOIN notifications existing
       ON existing.user_id = n.user_id
      AND existing.booking_id = n.booking_id
      AND existing.notification_type = 'payment_window_expired'
     SET n.notification_type = 'payment_window_expired',
         n.title = 'Payment window expired',
         n.message = ?,
         n.is_read = FALSE,
         n.created_at = NOW()
     WHERE n.user_id = ?
       AND n.booking_id = ?
       AND n.notification_type = 'booking_created'
       AND existing.id IS NULL`,
    [message, booking.customer_id, booking.booking_id]
  );

  await markBookingMessagesRead(booking.customer_id, booking.booking_id, 'payment_window_expired');
  if (updated.affectedRows) return updated.affectedRows;

  return createAssistantMessageOnce({
    userId: booking.customer_id,
    bookingId: booking.booking_id,
    title: 'Payment window expired',
    message,
    notificationType: 'payment_window_expired',
  });
}

async function notifyPaymentFailed(booking) {
  if (booking && (booking.status === 'payment_failed' || booking.status === 'cancelled')) {
    return notifyPaymentWindowExpired(booking);
  }
  return notifyPaymentAttemptFailed(booking);
}

async function notifyReviewAvailable(booking) {
  if (!booking || !booking.customer_id) return null;

  return createAssistantMessageOnce({
    userId: booking.customer_id,
    bookingId: booking.booking_id,
    title: 'Rate your experience',
    message: `How was your ${booking.service_name} visit at ${booking.merchant_name}? Leave a review and earn loyalty points.`,
    notificationType: 'review_available',
  });
}

async function notifyReviewReward({ customerId, bookingId, points }) {
  if (!customerId || !bookingId || !points) return null;

  await markBookingMessagesRead(customerId, bookingId, 'review_reward');
  await db.query(
    `UPDATE notifications
     SET is_read = TRUE
     WHERE user_id = ?
       AND booking_id = ?
       AND notification_type = 'review_available'`,
    [customerId, bookingId]
  );
  return createAssistantMessageOnce({
    userId: customerId,
    bookingId,
    title: 'Loyalty points earned',
    message: `You earned ${points} loyalty points for sharing your review. Thank you.`,
    notificationType: 'review_reward',
  });
}

module.exports = {
  ensureNotificationSchema,
  createNotification,
  createAssistantMessage,
  createAssistantMessageOnce,
  createAssistantExchange,
  normalizeStalePaymentNotifications,
  getNotificationsForUser,
  getUnreadForUser,
  countUnreadForUser,
  markNotificationRead,
  markNotificationsRead,
  markAllRead,
  markBookingMessagesRead,
  markWaitlistMessagesRead,
  notifySignup,
  notifyBookingCreated,
  notifyBookingConfirmed,
  notifyBookingCancelled,
  notifyBookingRescheduled,
  notifyPaymentFailed,
  notifyPaymentAttemptFailed,
  notifyPaymentWindowExpired,
  notifyReviewAvailable,
  notifyReviewReward,
};
