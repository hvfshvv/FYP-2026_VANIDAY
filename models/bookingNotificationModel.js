/*
 * bookingNotificationModel.js
 * Manages email/WhatsApp notification tracking, 24-hour reminder queries,
 * pending-payment expiry, and the booking schema migration guard
 * (ensureBookingPromoSchema) shared with bookingModel and slotModel.
 */

const db = require('../config/db');
const voucherModel = require('./voucherModel');
const paymentModel = require('./paymentModel');
const waitlistModel = require('./waitlistModel');
const notificationModel = require('./notificationModel');

// ── SCHEMA MIGRATION GUARD ─────────────────────────────────────────────────

let bookingPromoSchemaReady = false;
let outboundNotificationSchemaReady = false;

// Older databases restrict notification_type to a small ENUM. WhatsApp
// disruption events use additional types, so keep this audit field extensible.
async function ensureOutboundNotificationSchema() {
  if (outboundNotificationSchemaReady) return;

  const [[column]] = await db.query(
    `SELECT DATA_TYPE AS dataType
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'notification'
       AND COLUMN_NAME = 'notification_type'`
  );

  if (column && String(column.dataType).toLowerCase() === 'enum') {
    await db.query(
      `ALTER TABLE notification
       MODIFY notification_type VARCHAR(64) NOT NULL`
    );
  }

  outboundNotificationSchemaReady = true;
}

// Adds promo/voucher columns and updates the status ENUM if they don't exist yet.
async function ensureBookingPromoSchema() {
  if (bookingPromoSchemaReady) return;

  const hasCol = async (col) => {
    const [rows] = await db.query(
      `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking' AND COLUMN_NAME = ?`,
      [col]
    );
    return Number(rows[0]?.cnt) > 0;
  };

  const alterations = [
    ['applied_promo_id',        'ALTER TABLE booking ADD COLUMN applied_promo_id INT NULL'],
    ['discount_amount',         'ALTER TABLE booking ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00'],
    ['applied_cv_id',           'ALTER TABLE booking ADD COLUMN applied_cv_id INT NULL'],
    ['voucher_discount_amount', 'ALTER TABLE booking ADD COLUMN voucher_discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00'],
  ];

  for (const [col, sql] of alterations) {
    if (!(await hasCol(col))) {
      try { await db.query(sql); }
      catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    }
  }

  // Extend the status ENUM to include payment_failed and rescheduled if missing.
  const [[statusCol]] = await db.query(
    `SELECT COLUMN_TYPE AS columnType
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking' AND COLUMN_NAME = 'status'`
  );
  if (
    statusCol?.columnType &&
    (!String(statusCol.columnType).includes('payment_failed') ||
      !String(statusCol.columnType).includes('rescheduled'))
  ) {
    await db.query(
      `ALTER TABLE booking
       MODIFY status ENUM('pending_payment','confirmed','rescheduled','arrived','completed','cancelled','payment_failed','no_show')
       DEFAULT 'pending_payment'`
    );
  }

  await voucherModel.ensureCustomerVoucherSchema();
  await paymentModel.ensurePaymentHoldSchema();
  bookingPromoSchemaReady = true;
}

// ── NOTIFICATION DEDUPLICATION ─────────────────────────────────────────────

// Returns true if an email notification of this type was already sent for this booking.
async function hasSentEmailNotification(bookingId, notificationType, recipientKind = null) {
  const params = [bookingId, notificationType];
  const recipientFilter = recipientKind ? 'AND message LIKE ?' : '';

  if (recipientKind) {
    params.push(`% email to ${recipientKind} (%`);
  }

  const [rows] = await db.query(
    `SELECT notification_id
     FROM notification
     WHERE booking_id = ?
       AND notification_type = ?
       AND channel = 'email'
       AND status = 'sent'
       ${recipientFilter}
     LIMIT 1`,
    params
  );
  return Boolean(rows[0]);
}

// Returns true if a WhatsApp notification of this type was already sent for this booking.
async function hasSentWhatsAppNotification(bookingId, notificationType) {
  const [rows] = await db.query(
    `SELECT notification_id
     FROM notification
     WHERE booking_id = ?
       AND notification_type = ?
       AND channel = 'whatsapp'
       AND status = 'sent'
     LIMIT 1`,
    [bookingId, notificationType]
  );
  return Boolean(rows[0]);
}

// ── NOTIFICATION RECORDING ─────────────────────────────────────────────────

// Persists an outbound email attempt to the notification log for audit/dedup.
async function recordEmailNotification(booking, notificationType, message, status) {
  await ensureOutboundNotificationSchema();
  await db.query(
    `INSERT INTO notification
       (booking_id, user_id, merchant_id, notification_type, channel, message, status, scheduled_at, sent_at)
     VALUES (?, ?, ?, ?, 'email', ?, ?, NOW(), CASE WHEN ? = 'sent' THEN NOW() ELSE NULL END)`,
    [
      booking.booking_id,
      booking.customer_id || null,
      booking.merchant_id,
      notificationType,
      message,
      status,
      status,
    ]
  );
}

// Persists an outbound WhatsApp attempt to the notification log for audit/dedup.
async function recordWhatsAppNotification(booking, notificationType, message, status) {
  await ensureOutboundNotificationSchema();
  await db.query(
    `INSERT INTO notification
       (booking_id, user_id, merchant_id, notification_type, channel, message, status, scheduled_at, sent_at)
     VALUES (?, ?, ?, ?, 'whatsapp', ?, ?, NOW(), CASE WHEN ? = 'sent' THEN NOW() ELSE NULL END)`,
    [
      booking.booking_id,
      booking.customer_id || null,
      booking.merchant_id,
      notificationType,
      message,
      status,
      status,
    ]
  );
}

// ── REMINDER QUERIES ───────────────────────────────────────────────────────

// Finds confirmed bookings 23-25 hours away that have not yet received a reminder email.
async function getBookingsNeedingEmailReminders() {
  const [rows] = await db.query(
    `SELECT b.*,
            ts.slot_date AS booking_date,
            ts.start_time AS booking_time,
            s.service_name,
            m.merchant_name,
            m.address AS merchant_address,
            COALESCE(c.full_name, b.guest_name) AS customer_name,
            COALESCE(c.email, b.guest_email) AS customer_email,
            COALESCE(c.phone, b.guest_phone) AS customer_phone
     FROM booking b
     JOIN time_slot ts ON b.slot_id = ts.slot_id
     JOIN service s ON b.service_id = s.service_id
     JOIN merchant m ON b.merchant_id = m.merchant_id
     LEFT JOIN users c ON b.customer_id = c.user_id
     -- LEFT JOIN excludes bookings that already received a sent reminder
     LEFT JOIN notification n ON n.booking_id = b.booking_id
       AND n.notification_type = 'reminder_24h'
       AND n.channel = 'email'
       AND n.status = 'sent'
     WHERE b.status IN ('confirmed', 'rescheduled')
       AND COALESCE(c.email, b.guest_email) IS NOT NULL
       AND TIMESTAMP(ts.slot_date, ts.start_time) BETWEEN DATE_ADD(NOW(), INTERVAL 23 HOUR)
                                                     AND DATE_ADD(NOW(), INTERVAL 25 HOUR)
       AND n.notification_id IS NULL
     ORDER BY ts.slot_date ASC, ts.start_time ASC
     LIMIT 100`
  );
  return rows;
}

// Finds WhatsApp-origin bookings 23-25 hours away that have not received a sent WhatsApp reminder.
async function getBookingsNeedingWhatsAppReminders() {
  const [rows] = await db.query(
    `SELECT b.*,
            ts.slot_date AS booking_date,
            ts.start_time AS booking_time,
            s.service_name,
            m.merchant_name,
            m.address AS merchant_address,
            COALESCE(st.full_name, 'Any Available Staff') AS staff_name,
            COALESCE(c.full_name, b.guest_name) AS customer_name,
            COALESCE(c.email, b.guest_email) AS customer_email,
            COALESCE(c.phone, b.guest_phone) AS customer_phone
     FROM booking b
     JOIN time_slot ts ON b.slot_id = ts.slot_id
     JOIN service s ON b.service_id = s.service_id
     JOIN merchant m ON b.merchant_id = m.merchant_id
     LEFT JOIN staff st ON st.staff_id = b.staff_id
     LEFT JOIN users c ON b.customer_id = c.user_id
     LEFT JOIN notification n ON n.booking_id = b.booking_id
       AND n.notification_type = 'reminder_24h'
       AND n.channel = 'whatsapp'
       AND n.status = 'sent'
     WHERE b.status IN ('confirmed', 'rescheduled')
       AND b.source = 'whatsapp'
       AND COALESCE(c.phone, b.guest_phone) IS NOT NULL
       AND TIMESTAMP(ts.slot_date, ts.start_time) BETWEEN DATE_ADD(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR), INTERVAL 23 HOUR)
                                                     AND DATE_ADD(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR), INTERVAL 25 HOUR)
       AND n.notification_id IS NULL
     ORDER BY ts.slot_date ASC, ts.start_time ASC
     LIMIT 100`
  );
  return rows;
}

// ── PENDING PAYMENT EXPIRY ─────────────────────────────────────────────────

// Transitions stale pending_payment bookings to payment_failed and frees their time slots.
async function expirePendingPaymentBookings(ttlMinutes = 5) {
  await ensureBookingPromoSchema();

  const safeTtl = Number.isFinite(Number(ttlMinutes)) && Number(ttlMinutes) > 0
    ? Number(ttlMinutes)
    : 5;

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Promote pending bookings that now have a paid payment record to confirmed.
    await connection.query(
      `UPDATE booking b
       JOIN payment p ON p.booking_id = b.booking_id
        AND p.payment_status = 'paid'
       SET b.status = 'confirmed'
       WHERE b.status = 'pending_payment'`
    );

    // Find bookings that exceeded the TTL without a payment — lock for safe update.
    const [expired] = await connection.query(
      `SELECT b.booking_id, b.customer_id, b.slot_id, b.merchant_id, b.service_id,
              ts.slot_date AS booking_date, ts.start_time AS booking_time,
              s.service_name, m.merchant_name
       FROM booking b
       JOIN time_slot ts ON ts.slot_id = b.slot_id
       JOIN service s ON s.service_id = b.service_id
       JOIN merchant m ON m.merchant_id = b.merchant_id
       LEFT JOIN payment paid ON paid.booking_id = b.booking_id
        AND paid.payment_status = 'paid'
       LEFT JOIN payment p ON p.booking_id = b.booking_id
       WHERE b.status = 'pending_payment'
         AND COALESCE(p.payment_hold_expires_at, DATE_ADD(b.created_at, INTERVAL ? MINUTE)) < NOW()
         AND paid.payment_id IS NULL
       FOR UPDATE`,
      [safeTtl]
    );

    if (!expired.length) {
      await connection.commit();
      return 0;
    }

    const bookingIds = expired.map(row => row.booking_id);
    const slotIds = expired.map(row => row.slot_id).filter(Boolean);

    await connection.query(
      `UPDATE booking
       SET status = 'payment_failed',
           applied_cv_id = NULL,
           voucher_discount_amount = 0
       WHERE booking_id IN (?)`,
      [bookingIds]
    );

    if (slotIds.length) {
      // Return all freed slot rows back to available so other customers can book them.
      await connection.query(
        `UPDATE time_slot SET is_available = TRUE WHERE slot_id IN (?)`,
        [slotIds]
      );
    }

    await connection.commit();

    for (const slot of expired) {
      await notificationModel.notifyPaymentWindowExpired(slot).catch(err => {
        console.error('[notification] Failed to create payment-expired notification:', err.message);
      });
      await waitlistModel.offerNextForSlot(slot).catch(err => {
        console.error('[waitlist] Failed to offer a released payment slot:', err.message);
      });
    }
    return expired.length;
  } catch (err) {
    // Preserve the original network/query error if the connection died before
    // MySQL could accept the rollback command.
    try {
      await connection.rollback();
    } catch (rollbackErr) {
      if (!['ECONNRESET', 'PROTOCOL_CONNECTION_LOST'].includes(err.code)) {
        console.error('[booking] Rollback failed:', rollbackErr.message);
      }
    }
    throw err;
  } finally {
    connection.release();
  }
}

// Returns how many active pending-payment bookings a customer currently has.
async function countActivePendingPaymentBookings(customerId, ttlMinutes = 5) {
  await ensureBookingPromoSchema();
  await expirePendingPaymentBookings(ttlMinutes);

  const safeTtl = Number.isFinite(Number(ttlMinutes)) && Number(ttlMinutes) > 0
    ? Number(ttlMinutes)
    : 5;

  const [[row]] = await db.query(
    `SELECT COUNT(*) AS count
     FROM booking b
     LEFT JOIN payment p ON p.booking_id = b.booking_id
     WHERE b.customer_id = ?
       AND b.status = 'pending_payment'
       AND COALESCE(p.payment_hold_expires_at, DATE_ADD(b.created_at, INTERVAL ? MINUTE)) >= NOW()`,
    [customerId, safeTtl]
  );

  return Number(row?.count || 0);
}

module.exports = {
  ensureBookingPromoSchema,
  ensureOutboundNotificationSchema,
  hasSentEmailNotification,
  hasSentWhatsAppNotification,
  recordEmailNotification,
  recordWhatsAppNotification,
  getBookingsNeedingEmailReminders,
  getBookingsNeedingWhatsAppReminders,
  expirePendingPaymentBookings,
  countActivePendingPaymentBookings,
};
