const db = require('../config/db');
const notificationModel = require('./notificationModel');
const waitlistNotificationService = require('../services/waitlistNotificationService');

let schemaReady = false;

const ACTIVE_STATUSES = ['waiting', 'offered'];
const OFFER_MINUTES = 30;

function formatDateValue(value) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return String(value || '').slice(0, 10);
}

function formatTimeValue(value) {
  return String(value || '').slice(0, 5);
}

function assertFutureWaitlistSlot(bookingDate, bookingTime) {
  const slot = new Date(`${formatDateValue(bookingDate)}T${formatTimeValue(bookingTime)}:00`);
  if (Number.isNaN(slot.getTime()) || slot < new Date()) {
    throw new Error('Please choose a current or future waitlist slot.');
  }
}

async function ensureWaitlistSchema() {
  if (schemaReady) return;

  await notificationModel.ensureNotificationSchema();

  await db.query(`
    CREATE TABLE IF NOT EXISTS waitlist (
      waitlist_id INT AUTO_INCREMENT PRIMARY KEY,
      customer_id INT NOT NULL,
      merchant_id INT NOT NULL,
      service_id INT NOT NULL,
      booking_date DATE NOT NULL,
      booking_time TIME NOT NULL,
      status ENUM('waiting','offered','expired','confirmed','cancelled','removed') NOT NULL DEFAULT 'waiting',
      joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      offered_at DATETIME NULL,
      offer_expires_at DATETIME NULL,
      confirmed_booking_id INT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_waitlist_slot_status (merchant_id, service_id, booking_date, booking_time, status, joined_at),
      INDEX idx_waitlist_customer_status (customer_id, status, joined_at),
      INDEX idx_waitlist_offer_expiry (status, offer_expires_at),
      CONSTRAINT fk_waitlist_customer
        FOREIGN KEY (customer_id) REFERENCES users(user_id)
        ON DELETE CASCADE,
      CONSTRAINT fk_waitlist_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchant(merchant_id)
        ON DELETE CASCADE,
      CONSTRAINT fk_waitlist_service
        FOREIGN KEY (service_id) REFERENCES service(service_id)
        ON DELETE CASCADE,
      CONSTRAINT fk_waitlist_confirmed_booking
        FOREIGN KEY (confirmed_booking_id) REFERENCES booking(booking_id)
        ON DELETE SET NULL
    )
  `);

  schemaReady = true;
}

async function getCustomerUserId(customerId, connection = db) {
  const [[customer]] = await connection.query(
    "SELECT user_id FROM users WHERE user_id = ? AND role = 'customer' LIMIT 1",
    [customerId]
  );
  return customer?.user_id || null;
}

async function getSlotLabel(waitlistId, connection = db) {
  const [[row]] = await connection.query(
    `SELECT w.*, m.merchant_name, s.service_name,
            u.full_name AS customer_name,
            u.email AS customer_email,
            u.phone AS customer_phone
     FROM waitlist w
     JOIN merchant m ON m.merchant_id = w.merchant_id
     JOIN service s ON s.service_id = w.service_id
     JOIN users u ON u.user_id = w.customer_id AND u.role = 'customer'
     WHERE w.waitlist_id = ?
     LIMIT 1`,
    [waitlistId]
  );

  if (!row) return null;

  const date = new Date(row.booking_date).toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return {
    ...row,
    dateLabel: date,
    timeLabel: formatTimeValue(row.booking_time),
    offer_minutes: OFFER_MINUTES,
  };
}

async function notifyCustomer(waitlistId, title, message, type, options = {}) {
  const entry = await getSlotLabel(waitlistId);
  if (!entry) return;

  const userId = await getCustomerUserId(entry.customer_id);
  if (!userId) return;

  await notificationModel.createNotification({
    userId,
    bookingId: options.bookingId || null,
    waitlistId,
    title,
    message,
    notificationType: type,
  });
}

async function markWaitlistNotificationsClosed(waitlistId, customerId, excludeType = null) {
  const userId = await getCustomerUserId(customerId);
  if (!userId) return;
  await notificationModel.markWaitlistMessagesRead(userId, waitlistId, excludeType);
}

async function joinWaitlist({ customerId, merchantId, serviceId, bookingDate, bookingTime }) {
  await ensureWaitlistSchema();

  const safeDate = formatDateValue(bookingDate);
  const safeTime = formatTimeValue(bookingTime);
  assertFutureWaitlistSlot(safeDate, safeTime);

  const [[service]] = await db.query(
    `SELECT service_id, duration_mins
     FROM service
     WHERE service_id = ? AND merchant_id = ? AND is_active = 1
     LIMIT 1`,
    [serviceId, merchantId]
  );
  if (!service) throw new Error('Selected service is not available for this merchant.');

  await require('./bookingDisruptionModel').ensureSchema();
  const [[closure]] = await db.query(
    `SELECT slot_id FROM time_slot
     WHERE merchant_id=? AND service_id=? AND slot_date=? AND block_type='emergency_closure'
       AND start_time < ADDTIME(?, SEC_TO_TIME(? * 60)) AND end_time > ? LIMIT 1`,
    [merchantId, serviceId, safeDate, safeTime, Number(service.duration_mins || 0), safeTime]
  );
  if (closure) throw new Error('The merchant is closed during this period. Please choose another date or time.');

  const availableStaff = await require('./slotModel').getAvailableStaffForSlot({
    merchantId,
    serviceId,
    bookingDate: safeDate,
    bookingTime: safeTime,
  });
  if (availableStaff.length) {
    throw new Error('A qualified staff member is available. Please book this slot instead of joining the waitlist.');
  }

  const [[existing]] = await db.query(
    `SELECT waitlist_id, status
     FROM waitlist
     WHERE customer_id = ?
       AND merchant_id = ?
       AND service_id = ?
       AND booking_date = ?
       AND booking_time = ?
       AND status IN ('waiting', 'offered')
     LIMIT 1`,
    [customerId, merchantId, serviceId, safeDate, safeTime]
  );

  if (existing) return { waitlistId: existing.waitlist_id, alreadyJoined: true };

  const [result] = await db.query(
    `INSERT INTO waitlist
       (customer_id, merchant_id, service_id, booking_date, booking_time)
     VALUES (?, ?, ?, ?, ?)`,
    [customerId, merchantId, serviceId, safeDate, `${safeTime}:00`]
  );

  await notifyCustomer(
    result.insertId,
    'Waitlist joined',
    'You joined the waitlist. I will message you if this slot opens up.',
    'waitlist_joined'
  );

  return { waitlistId: result.insertId, alreadyJoined: false };
}

async function hasActiveOfferForSlot({ merchantId, serviceId, bookingDate, bookingTime, waitlistId = null }) {
  await ensureWaitlistSchema();

  const params = [
    merchantId,
    serviceId,
    formatDateValue(bookingDate),
    `${formatTimeValue(bookingTime)}:00`,
  ];

  let exclude = '';
  if (waitlistId) {
    exclude = 'AND waitlist_id <> ?';
    params.push(waitlistId);
  }

  const [[row]] = await db.query(
    `SELECT waitlist_id
     FROM waitlist
     WHERE merchant_id = ?
       AND service_id = ?
       AND booking_date = ?
       AND booking_time = ?
       AND status = 'offered'
       AND offer_expires_at >= NOW()
       ${exclude}
     LIMIT 1`,
    params
  );

  return Boolean(row);
}

async function assertNoBlockingOffer({ merchantId, serviceId, bookingDate, bookingTime, waitlistId = null }) {
  if (await hasActiveOfferForSlot({ merchantId, serviceId, bookingDate, bookingTime, waitlistId })) {
    throw new Error('This slot is currently reserved for the next waitlisted customer.');
  }
}

async function slotHasOpenCapacity({ merchantId, serviceId, bookingDate, bookingTime }) {
  const staff = await require('./slotModel').getAvailableStaffForSlot({
    merchantId,
    serviceId,
    bookingDate: formatDateValue(bookingDate),
    bookingTime: formatTimeValue(bookingTime),
  });
  return staff.length > 0;
}

async function offerNextForSlot(slot) {
  await ensureWaitlistSchema();

  const merchantId = slot.merchantId ?? slot.merchant_id;
  const serviceId = slot.serviceId ?? slot.service_id;
  const bookingDate = slot.bookingDate ?? slot.booking_date ?? slot.slot_date;
  const bookingTime = slot.bookingTime ?? slot.booking_time ?? slot.start_time;
  const safeDate = formatDateValue(bookingDate);
  const safeTime = formatTimeValue(bookingTime);

  if (!merchantId || !serviceId || !safeDate || !safeTime) {
    return null;
  }

  if (await hasActiveOfferForSlot({ merchantId, serviceId, bookingDate: safeDate, bookingTime: safeTime })) {
    return null;
  }

  if (!(await slotHasOpenCapacity({ merchantId, serviceId, bookingDate: safeDate, bookingTime: safeTime }))) {
    return null;
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [[next]] = await connection.query(
      `SELECT waitlist_id, customer_id
       FROM waitlist
       WHERE merchant_id = ?
         AND service_id = ?
         AND booking_date = ?
         AND booking_time = ?
         AND status = 'waiting'
       ORDER BY joined_at ASC, waitlist_id ASC
       LIMIT 1
       FOR UPDATE`,
      [merchantId, serviceId, safeDate, `${safeTime}:00`]
    );

    if (!next) {
      await connection.commit();
      return null;
    }

    await connection.query(
      `UPDATE waitlist
       SET status = 'offered',
           offered_at = NOW(),
           offer_expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)
       WHERE waitlist_id = ?`,
      [OFFER_MINUTES, next.waitlist_id]
    );

    await connection.commit();

    let bookingId;
    try {
      const bookingModel = require('./bookingModel');
      const paymentModel = require('./paymentModel');
      bookingId = await bookingModel.createBooking({
        customerId: next.customer_id,
        serviceId,
        merchantId,
        bookingDate: safeDate,
        bookingTime: safeTime,
        source: 'web',
        waitlistId: next.waitlist_id,
      });
      const booking = await bookingModel.getBookingById(bookingId);
      await paymentModel.createOrUpdatePayment(bookingId, Number(booking.total_amount || 0), 'stripe', {
        holdMinutes: OFFER_MINUTES,
      });
      await attachPendingBooking(next.waitlist_id, bookingId);
    } catch (bookingErr) {
      await db.query(
        `UPDATE waitlist
         SET status = 'waiting',
             offered_at = NULL,
             offer_expires_at = NULL,
             confirmed_booking_id = NULL
         WHERE waitlist_id = ?`,
        [next.waitlist_id]
      );
      throw bookingErr;
    }

    const entry = await getSlotLabel(next.waitlist_id);
    await notifyCustomer(
      next.waitlist_id,
      'Slot available',
      `Good news: a ${entry.service_name} slot at ${entry.merchant_name} opened for ${entry.dateLabel} at ${entry.timeLabel}. You have ${OFFER_MINUTES} minutes to make payment.`,
      'waitlist_offer',
      { bookingId }
    );
    await waitlistNotificationService.sendWaitlistOffer(entry).catch(err => {
      console.error('[waitlist] Failed to send external waitlist offer notification:', err.message);
    });

    return next.waitlist_id;
  } catch (err) {
    try {
      await connection.rollback();
    } catch (rollbackErr) {
      if (!['ECONNRESET', 'PROTOCOL_CONNECTION_LOST'].includes(err.code)) {
        console.error('[waitlist] Rollback failed:', rollbackErr.message);
      }
    }
    throw err;
  } finally {
    connection.release();
  }
}

async function expireOffersAndPromote() {
  await ensureWaitlistSchema();

  const [expired] = await db.query(
    `SELECT waitlist_id, customer_id, merchant_id, service_id, booking_date, booking_time
     FROM waitlist
     WHERE status = 'offered'
       AND offer_expires_at < NOW()`
  );

  if (!expired.length) return 0;

  const ids = expired.map(row => row.waitlist_id);
  await db.query(
    `UPDATE waitlist
     SET status = 'expired'
     WHERE waitlist_id IN (?)`,
    [ids]
  );

  await Promise.all(expired.map(row => notifyCustomer(
    row.waitlist_id,
    'Waitlist offer expired',
    'Your waitlist offer expired, so I moved the slot to the next customer in queue.',
    'waitlist_offer_expired'
  )));

  await Promise.all(expired.map(row => markWaitlistNotificationsClosed(row.waitlist_id, row.customer_id, 'waitlist_offer_expired')));

  const seen = new Set();
  for (const row of expired) {
    const key = [
      row.merchant_id,
      row.service_id,
      formatDateValue(row.booking_date),
      formatTimeValue(row.booking_time),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    await offerNextForSlot(row);
  }

  return expired.length;
}

async function expirePastWaitingWaitlists() {
  await ensureWaitlistSchema();

  const [expired] = await db.query(
    `SELECT waitlist_id, customer_id
     FROM waitlist
     WHERE status = 'waiting'
       AND TIMESTAMP(booking_date, booking_time) < NOW()`
  );

  if (!expired.length) return 0;

  const ids = expired.map(row => row.waitlist_id);
  await db.query(
    `UPDATE waitlist
     SET status = 'expired'
     WHERE waitlist_id IN (?)`,
    [ids]
  );

  await Promise.all(expired.map(row => notifyCustomer(
    row.waitlist_id,
    'Waitlist expired',
    'The slot you joined the waitlist for has passed, so I removed it from your active waitlist.',
    'waitlist_expired'
  )));

  await Promise.all(expired.map(row => markWaitlistNotificationsClosed(row.waitlist_id, row.customer_id, 'waitlist_expired')));

  return expired.length;
}

async function getWaitlistByIdForCustomer(waitlistId, customerId) {
  await ensureWaitlistSchema();

  const [[row]] = await db.query(
    `SELECT w.*, m.merchant_name, s.service_name,
            CASE
              WHEN w.status = 'offered' AND w.offer_expires_at >= NOW()
              THEN 1 ELSE 0
            END AS offer_is_active,
            GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), w.offer_expires_at)) AS offer_remaining_seconds
     FROM waitlist w
     JOIN merchant m ON m.merchant_id = w.merchant_id
     JOIN service s ON s.service_id = w.service_id
     WHERE w.waitlist_id = ?
       AND w.customer_id = ?
     LIMIT 1`,
    [waitlistId, customerId]
  );

  return row || null;
}

async function markConfirmed(waitlistId, bookingId) {
  await ensureWaitlistSchema();
  const entry = await getSlotLabel(waitlistId);
  await db.query(
    `UPDATE waitlist
     SET status = 'confirmed',
         confirmed_booking_id = ?
     WHERE waitlist_id = ?`,
    [bookingId, waitlistId]
  );
  if (entry) {
    await markWaitlistNotificationsClosed(waitlistId, entry.customer_id);
  }
}

async function attachPendingBooking(waitlistId, bookingId) {
  await ensureWaitlistSchema();
  await db.query(
    `UPDATE waitlist
     SET confirmed_booking_id = ?
     WHERE waitlist_id = ?`,
    [bookingId, waitlistId]
  );
}

async function markConfirmedByBookingId(bookingId) {
  await ensureWaitlistSchema();
  const [[entry]] = await db.query(
    `SELECT waitlist_id, customer_id
     FROM waitlist
     WHERE confirmed_booking_id = ?
     LIMIT 1`,
    [bookingId]
  );

  if (!entry) return false;

  await db.query(
    `UPDATE waitlist
     SET status = 'confirmed'
     WHERE waitlist_id = ?`,
    [entry.waitlist_id]
  );
  await markWaitlistNotificationsClosed(entry.waitlist_id, entry.customer_id);
  return true;
}

async function cancelCustomerWaitlist(waitlistId, customerId) {
  await ensureWaitlistSchema();

  const entry = await getWaitlistByIdForCustomer(waitlistId, customerId);
  if (!entry || !ACTIVE_STATUSES.includes(entry.status)) {
    throw new Error('This waitlist request cannot be cancelled.');
  }

  await db.query(
    `UPDATE waitlist
     SET status = 'cancelled'
     WHERE waitlist_id = ? AND customer_id = ?`,
    [waitlistId, customerId]
  );

  await notifyCustomer(
    waitlistId,
    'Waitlist request cancelled',
    'Your waitlist request has been cancelled.',
    'waitlist_cancelled'
  );
  await markWaitlistNotificationsClosed(waitlistId, customerId, 'waitlist_cancelled');

  if (entry.status === 'offered') {
    await offerNextForSlot(entry);
  }
}

async function removeMerchantWaitlist(waitlistId, merchantId) {
  await ensureWaitlistSchema();

  const [[entry]] = await db.query(
    `SELECT *
     FROM waitlist
     WHERE waitlist_id = ?
       AND merchant_id = ?
       AND status IN ('waiting', 'offered')
     LIMIT 1`,
    [waitlistId, merchantId]
  );

  if (!entry) throw new Error('Waitlist request not found.');

  await db.query(
    `UPDATE waitlist
     SET status = 'removed'
     WHERE waitlist_id = ? AND merchant_id = ?`,
    [waitlistId, merchantId]
  );

  await notifyCustomer(
    waitlistId,
    'Waitlist request removed',
    'The merchant removed your waitlist request. You can choose another slot anytime.',
    'waitlist_removed'
  );
  await markWaitlistNotificationsClosed(waitlistId, entry.customer_id, 'waitlist_removed');

  if (entry.status === 'offered') {
    await offerNextForSlot(entry);
  }
}

async function getCustomerWaitlists(customerId) {
  await ensureWaitlistSchema();
  await expireOffersAndPromote();
  await expirePastWaitingWaitlists();

  const [rows] = await db.query(
    `SELECT w.*, m.merchant_name, m.address AS merchant_address, s.service_name,
            CASE
              WHEN w.status = 'offered' AND w.offer_expires_at >= NOW()
              THEN 1 ELSE 0
            END AS offer_is_active,
            GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), w.offer_expires_at)) AS offer_remaining_seconds,
            (
              SELECT COUNT(*)
              FROM waitlist ahead
              WHERE ahead.merchant_id = w.merchant_id
                AND ahead.service_id = w.service_id
                AND ahead.booking_date = w.booking_date
                AND ahead.booking_time = w.booking_time
                AND ahead.status = 'waiting'
                AND (
                  ahead.joined_at < w.joined_at
                  OR (ahead.joined_at = w.joined_at AND ahead.waitlist_id < w.waitlist_id)
                )
            ) + 1 AS queue_position
     FROM waitlist w
     JOIN merchant m ON m.merchant_id = w.merchant_id
     JOIN service s ON s.service_id = w.service_id
     WHERE w.customer_id = ?
       AND w.status IN ('waiting', 'offered')
       AND TIMESTAMP(w.booking_date, w.booking_time) >= NOW()
     ORDER BY FIELD(w.status, 'offered', 'waiting', 'confirmed', 'expired', 'cancelled', 'removed'),
              w.joined_at DESC`,
    [customerId]
  );

  return rows;
}

async function getMerchantWaitlists(merchantId) {
  await ensureWaitlistSchema();
  await expireOffersAndPromote();
  await expirePastWaitingWaitlists();

  const [rows] = await db.query(
    `SELECT w.*, c.full_name AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
            s.service_name,
            (
              SELECT COUNT(*)
              FROM waitlist same_slot
              WHERE same_slot.merchant_id = w.merchant_id
                AND same_slot.service_id = w.service_id
                AND same_slot.booking_date = w.booking_date
                AND same_slot.booking_time = w.booking_time
                AND same_slot.status IN ('waiting', 'offered')
            ) AS waiting_count
     FROM waitlist w
     JOIN users c ON c.user_id = w.customer_id AND c.role = 'customer'
     JOIN service s ON s.service_id = w.service_id
     WHERE w.merchant_id = ?
     ORDER BY w.booking_date ASC, w.booking_time ASC,
              FIELD(w.status, 'offered', 'waiting', 'confirmed', 'expired', 'cancelled', 'removed'),
              w.joined_at ASC`,
    [merchantId]
  );

  return rows;
}

async function getMerchantActiveWaitlistCount(merchantId) {
  await ensureWaitlistSchema();
  await expireOffersAndPromote();
  await expirePastWaitingWaitlists();

  const [[row]] = await db.query(
    `SELECT COUNT(*) AS active_count
     FROM waitlist
     WHERE merchant_id = ?
       AND status IN ('waiting', 'offered')`,
    [merchantId]
  );

  return Number(row?.active_count || 0);
}

async function getSlotWaitlistCounts({ merchantId, serviceId, bookingDate }) {
  await ensureWaitlistSchema();

  const [rows] = await db.query(
    `SELECT booking_time,
            COUNT(*) AS waitlist_count,
            SUM(CASE WHEN status = 'offered' AND offer_expires_at >= NOW() THEN 1 ELSE 0 END) AS active_offer_count
     FROM waitlist
     WHERE merchant_id = ?
       AND service_id = ?
       AND booking_date = ?
       AND status IN ('waiting', 'offered')
     GROUP BY booking_time`,
    [merchantId, serviceId, formatDateValue(bookingDate)]
  );

  const counts = new Map();
  rows.forEach(row => {
    counts.set(formatTimeValue(row.booking_time), {
      waitlist_count: Number(row.waitlist_count || 0),
      active_offer_count: Number(row.active_offer_count || 0),
    });
  });

  return counts;
}

module.exports = {
  OFFER_MINUTES,
  ensureWaitlistSchema,
  joinWaitlist,
  offerNextForSlot,
  expireOffersAndPromote,
  expirePastWaitingWaitlists,
  assertNoBlockingOffer,
  hasActiveOfferForSlot,
  getWaitlistByIdForCustomer,
  markConfirmed,
  attachPendingBooking,
  markConfirmedByBookingId,
  cancelCustomerWaitlist,
  removeMerchantWaitlist,
  getCustomerWaitlists,
  getMerchantWaitlists,
  getMerchantActiveWaitlistCount,
  getSlotWaitlistCounts,
};
