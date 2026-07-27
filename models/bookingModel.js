/*
 * bookingModel.js
 * Core booking lifecycle: creating, updating, cancelling, and rescheduling
 * bookings, plus merchant and customer read queries. Slot/staff logic lives
 * in slotModel; notification tracking lives in bookingNotificationModel.
 */

const db = require('../config/db');
const voucherModel = require('./voucherModel');
const cancellationPolicyModel = require('./cancellationPolicyModel');
const waitlistModel = require('./waitlistModel');
const {
  resolveAvailableStaffForBooking,
  assertNoCustomerBookingConflict,
  assertCurrentOrFutureSlot,
} = require('./slotModel');
const {
  ensureBookingPromoSchema,
  expirePendingPaymentBookings,
} = require('./bookingNotificationModel');

// ── BOOKING CREATION ───────────────────────────────────────────────────────

// Locks the slot and creates a pending_payment booking inside a DB transaction.
async function createBooking({
  customerId = null,
  serviceId,
  merchantId,
  bookingDate,
  bookingTime,
  staffId = null,
  source,
  guestName = null,
  guestEmail = null,
  guestPhone = null,
  waitlistId = null,
}) {
  await expirePendingPaymentBookings();

  assertCurrentOrFutureSlot(bookingDate, bookingTime);
  await waitlistModel.assertNoBlockingOffer({
    merchantId,
    serviceId,
    bookingDate,
    bookingTime,
    waitlistId,
  });

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    if (customerId) {
      // Lock customer row while checking booking conflicts.
      await lockCustomerForBooking(connection, customerId);
    }

    // Confirm the selected service belongs to the selected merchant before pricing.
    const [[svc]] = await connection.query(
      'SELECT price, duration_mins FROM service WHERE service_id = ? AND merchant_id = ? AND is_active = 1',
      [serviceId, merchantId]
    );
    if (!svc) {
      throw new Error('Selected service is not available for this merchant');
    }

    if (customerId) {
      // Check if customer already has an overlapping active booking.
      await assertNoCustomerBookingConflict(connection, {
        customerId,
        bookingDate,
        bookingTime,
        durationMins: svc.duration_mins,
      });
    }

    const assignedStaff = await resolveAvailableStaffForBooking(connection, {
      merchantId,
      serviceId,
      bookingDate,
      bookingTime,
      durationMins: svc.duration_mins,
      staffId,
    });
    const safeStaffId = assignedStaff.staff_id;

    // Find an existing available slot or create one.
    const [existing] = await connection.query(
      `SELECT slot_id FROM time_slot
       WHERE merchant_id=? AND service_id=? AND slot_date=? AND start_time=? AND is_available=TRUE
       AND staff_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM booking b WHERE b.slot_id = time_slot.slot_id
       )
       LIMIT 1
       FOR UPDATE`,
      [merchantId, serviceId, bookingDate, bookingTime, safeStaffId]
    );

    let slotId;
    if (existing.length) {
      // Reserve an existing available slot.
      slotId = existing[0].slot_id;
      await connection.query('UPDATE time_slot SET is_available=FALSE WHERE slot_id=?', [slotId]);
    } else {
      const [conflicting] = await connection.query(
        `SELECT slot_id
         FROM time_slot ts
         WHERE ts.staff_id = ?
           AND ts.slot_date = ?
           AND ts.start_time < ADDTIME(?, SEC_TO_TIME(? * 60))
           AND ts.end_time > ?
           AND ts.is_available = FALSE
         LIMIT 1
         FOR UPDATE`,
        [safeStaffId, bookingDate, bookingTime, svc.duration_mins, bookingTime]
      );

      if (conflicting.length) {
        throw new Error('That time slot is already booked');
      }

      // Create a new booked slot when no reusable slot exists.
      const [slotResult] = await connection.query(
        `INSERT INTO time_slot (merchant_id, service_id, staff_id, slot_date, start_time, end_time, is_available)
         VALUES (?,?,?,?,?,ADDTIME(?,SEC_TO_TIME(?*60)),FALSE)`,
        [merchantId, serviceId, safeStaffId, bookingDate, bookingTime, bookingTime, svc.duration_mins]
      );
      slotId = slotResult.insertId;
    }

    const mappedSource = source === 'qr_scan' ? 'qr' : source === 'portal' ? 'web' : source;
    const allowedSources = ['web', 'qr', 'marketplace', 'whatsapp'];
    const safeSource = allowedSources.includes(mappedSource) ? mappedSource : 'web';
    const mappedBookingType = safeSource === 'qr' ? 'walk_in' : 'advance';

    // Save booking as pending_payment until Stripe confirms payment.
    const [result] = await connection.query(
      `INSERT INTO booking
         (customer_id, guest_name, guest_email, guest_phone, merchant_id, service_id, staff_id, slot_id, booking_type, source, status, total_amount)
       VALUES (?,?,?,?,?,?,?,?,?,?,'pending_payment',?)`,
      [
        customerId,
        guestName,
        guestEmail,
        guestPhone,
        merchantId,
        serviceId,
        safeStaffId,
        slotId,
        mappedBookingType,
        safeSource,
        svc.price,
      ]
    );

    await connection.commit();
    return result.insertId;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// Acquires a row lock on the customer account to serialise concurrent booking attempts.
async function lockCustomerForBooking(connection, customerId) {
  const [[customer]] = await connection.query(
    `SELECT user_id AS customer_id
     FROM users
     WHERE user_id = ?
       AND role = 'customer'
     FOR UPDATE`,
    [customerId]
  );

  if (!customer) {
    throw new Error('Customer account not found');
  }
}

// ── BOOKING READS ──────────────────────────────────────────────────────────

// Fetches a full booking record with service, merchant, customer, and promo details.
async function getBookingById(bookingId) {
  await ensureBookingPromoSchema();
  const [rows] = await db.query(
    `SELECT b.*,
            ts.slot_date  AS booking_date,
            ts.start_time AS booking_time,
            s.service_name, s.price, s.duration_mins,
            COALESCE(st.full_name, 'Any Available Staff') AS staff_name,
            COALESCE(NULLIF(b.total_amount, 0), s.price)
              - COALESCE(b.discount_amount, 0)
              - COALESCE(b.voucher_discount_amount, 0) AS payable_amount,
            COALESCE(b.discount_amount, 0) AS discount_amount,
            COALESCE(b.voucher_discount_amount, 0) AS voucher_discount_amount,
            b.applied_promo_id,
            b.applied_cv_id,
            pr.title        AS promo_title,
            pr.discount_pct AS promo_discount_pct,
            COALESCE(vch_applied.campaign_name, vch_applied.voucher_code) AS voucher_name,
            COALESCE(p_hold.payment_hold_expires_at, DATE_ADD(b.created_at, INTERVAL 5 MINUTE)) AS payment_hold_expires_at,
            m.merchant_name,
            m.email AS merchant_email,
            m.address AS merchant_address,
            COALESCE(c.full_name, b.guest_name) AS customer_name,
            COALESCE(c.email, b.guest_email) AS customer_email,
            COALESCE(c.phone, b.guest_phone) AS customer_phone,
            GREATEST(
              0,
              TIMESTAMPDIFF(
                SECOND,
                NOW(),
                COALESCE(p_hold.payment_hold_expires_at, DATE_ADD(b.created_at, INTERVAL 5 MINUTE))
              )
            ) AS pending_remaining_seconds
     FROM booking b
     JOIN time_slot ts ON b.slot_id     = ts.slot_id
     JOIN service   s  ON b.service_id  = s.service_id
     JOIN merchant  m  ON b.merchant_id = m.merchant_id
     LEFT JOIN staff st ON st.staff_id = b.staff_id
     LEFT JOIN users c ON b.customer_id = c.user_id
      LEFT JOIN promotion pr ON pr.promo_id = b.applied_promo_id
      LEFT JOIN customer_voucher cv_applied ON cv_applied.cv_id = b.applied_cv_id
      LEFT JOIN voucher vch_applied ON vch_applied.voucher_id = cv_applied.voucher_id
      LEFT JOIN payment p_hold ON p_hold.booking_id = b.booking_id
      WHERE b.booking_id = ?`,
    [bookingId]
  );
  return rows[0] || null;
}

// Fetches a booking record scoped to the owning customer (used on My Bookings page).
async function getCustomerBookingById(bookingId, customerId) {
  const [rows] = await db.query(
    `SELECT b.*,
            ts.slot_date  AS booking_date,
            ts.start_time AS booking_time,
            s.service_name, s.price, s.duration_mins,
            COALESCE(st.full_name, 'Any Available Staff') AS staff_name,
            COALESCE(NULLIF(b.total_amount, 0), s.price) AS payable_amount,
            m.merchant_name,
            m.address AS merchant_address,
            m.email AS merchant_email,
            p.payment_status
     FROM booking b
     JOIN time_slot ts ON b.slot_id     = ts.slot_id
     JOIN service   s  ON b.service_id  = s.service_id
     JOIN merchant  m  ON b.merchant_id = m.merchant_id
     LEFT JOIN staff st ON st.staff_id = b.staff_id
     LEFT JOIN payment p ON p.booking_id = b.booking_id
     WHERE b.booking_id = ? AND b.customer_id = ?`,
    [bookingId, customerId]
  );
  return rows[0] || null;
}

// Returns one WhatsApp page of bookings scoped to the linked customer account.
async function getCustomerBookingsForWhatsApp(customerId, viewType, { limit = 5, offset = 0 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 10));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const activeStatuses = ['pending_payment', 'confirmed', 'rescheduled', 'arrived'];
  const terminalStatuses = ['completed', 'cancelled', 'payment_failed', 'no_show'];
  const upcomingWhere = `
    b.customer_id = ?
    AND b.status IN (?)
    AND TIMESTAMP(ts.slot_date, ts.start_time) >= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)
  `;
  const historyWhere = `
    b.customer_id = ?
    AND (
      b.status IN (?)
      OR TIMESTAMP(ts.slot_date, ts.start_time) < DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)
    )
  `;
  const isHistory = viewType === 'history';
  const [rows] = await db.query(
    `SELECT b.booking_id,
            b.customer_id,
            b.status,
            b.total_amount,
            ts.slot_date  AS booking_date,
            ts.start_time AS booking_time,
            s.service_name,
            m.merchant_name
     FROM booking b
     JOIN time_slot ts ON b.slot_id     = ts.slot_id
     JOIN service   s  ON b.service_id  = s.service_id
     JOIN merchant  m  ON b.merchant_id = m.merchant_id
     WHERE ${isHistory ? historyWhere : upcomingWhere}
     ORDER BY ts.slot_date ${isHistory ? 'DESC' : 'ASC'}, ts.start_time ${isHistory ? 'DESC' : 'ASC'}, b.booking_id ${isHistory ? 'DESC' : 'ASC'}
     LIMIT ? OFFSET ?`,
    [
      customerId,
      isHistory ? terminalStatuses : activeStatuses,
      safeLimit,
      safeOffset
    ]
  );

  return rows;
}

// ── BOOKING STATUS UPDATES ─────────────────────────────────────────────────

// Changes the booking status (used after payment confirmation or admin action).
async function updateBookingStatus(bookingId, status) {
  const booking = await getBookingById(bookingId);
  const [result] = await db.query('UPDATE booking SET status = ? WHERE booking_id = ?', [status, bookingId]);
  if (result.affectedRows && status === 'completed') {
    await notifyReviewPromptIfCompleted(bookingId);
  }
  return booking;
}

async function notifyReviewPromptIfCompleted(bookingId) {
  const notificationModel = require('./notificationModel');
  const booking = await getBookingById(bookingId).catch(() => null);
  if (!booking || booking.status !== 'completed') return;

  await notificationModel.notifyReviewAvailable(booking).catch(err => {
    console.error('[notification] review prompt failed:', err.message);
  });
}

// Updates booking status from the merchant dashboard with valid state-transition rules.
async function updateMerchantBookingStatus(bookingId, merchantId, status) {
  const fields = ['status = ?'];
  const params = [status];
  const transitionRules = {
    arrived: {
      currentStatuses: ['confirmed', 'rescheduled'],
      // Merchants can check customers in from 15 minutes before the appointment.
      timeRule: 'AND DATE_SUB(TIMESTAMP(ts.slot_date, ts.start_time), INTERVAL 15 MINUTE) <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)',
    },
    completed: {
      currentStatuses: ['arrived'],
      // Completion is allowed only after the booked time slot has ended.
      timeRule: 'AND TIMESTAMP(ts.slot_date, ts.end_time) <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)',
    },
    no_show: {
      currentStatuses: ['confirmed', 'rescheduled'],
      // Only mark no-show after the appointment time has passed.
      timeRule: 'AND TIMESTAMP(ts.slot_date, ts.start_time) <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)',
    },
  };
  const rule = transitionRules[status];

  if (!rule) return 0;

  if (status === 'arrived') {
    // Record manual merchant check-in from the dashboard.
    fields.push('checked_in_at = NOW()', "arrival_method = 'manual'");
  }

  params.push(bookingId, merchantId);

  const [result] = await db.query(
    `UPDATE booking
     JOIN time_slot ts ON ts.slot_id = booking.slot_id
     SET ${fields.join(', ')}
     WHERE booking.booking_id = ?
       AND booking.merchant_id = ?
       AND booking.status IN (?)
       ${rule.timeRule}`,
    [...params, rule.currentStatuses]
  );

  if (result.affectedRows && status === 'completed') {
    await notifyReviewPromptIfCompleted(bookingId);
  }

  return result.affectedRows;
}

// ── QR CHECK-IN ───────────────────────────────────────────────────────────

// Marks a customer as arrived after scanning the merchant's arrival QR code.
async function markCustomerArrivedForMerchant(customerId, merchantId) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Check if the customer already scanned arrival QR today.
    const [[arrivedBooking]] = await connection.query(
      `SELECT b.booking_id, b.status, ts.slot_date, ts.start_time, s.service_name, m.merchant_name
       FROM booking b
       JOIN time_slot ts ON b.slot_id = ts.slot_id
       JOIN service s ON b.service_id = s.service_id
       JOIN merchant m ON b.merchant_id = m.merchant_id
       WHERE b.customer_id = ?
         AND b.merchant_id = ?
         AND b.status = 'arrived'
         AND ts.slot_date = CURDATE()
       ORDER BY ts.start_time ASC
       LIMIT 1
       FOR UPDATE`,
      [customerId, merchantId]
    );

    if (arrivedBooking) {
      await connection.commit();
      return { status: 'already_arrived', booking: arrivedBooking };
    }

    // Find today's confirmed booking for this merchant.
    const [[booking]] = await connection.query(
      `SELECT b.booking_id, b.status, ts.slot_date, ts.start_time, s.service_name, m.merchant_name
       FROM booking b
       JOIN time_slot ts ON b.slot_id = ts.slot_id
       JOIN service s ON b.service_id = s.service_id
       JOIN merchant m ON b.merchant_id = m.merchant_id
       WHERE b.customer_id = ?
         AND b.merchant_id = ?
         AND b.status IN ('confirmed', 'rescheduled')
         AND ts.slot_date = CURDATE()
       ORDER BY ts.start_time ASC
       LIMIT 1
       FOR UPDATE`,
      [customerId, merchantId]
    );

    if (!booking) {
      await connection.commit();
      return { status: 'no_active_booking', booking: null };
    }

    // Mark customer as arrived after QR scan.
    await connection.query(
      `UPDATE booking
       SET status = 'arrived',
           checked_in_at = NOW(),
           arrival_method = 'qr'
       WHERE booking_id = ?
         AND merchant_id = ?
         AND customer_id = ?
         AND status IN ('confirmed', 'rescheduled')`,
      [booking.booking_id, merchantId, customerId]
    );

    await connection.commit();
    return { status: 'arrived', booking };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// ── CANCELLATION ───────────────────────────────────────────────────────────

// Cancels a customer booking before the appointment starts.
async function cancelCustomerBooking(bookingId, customerId) {
  await require('./bookingDisruptionModel').ensureSchema();
  const connection = await db.getConnection();
  let releasedSlot = null;
  let refundDecision = null;

  try {
    await connection.beginTransaction();
    await lockCustomerForBooking(connection, customerId);

    const [[booking]] = await connection.query(
      `SELECT b.booking_id, b.slot_id, b.status, b.merchant_id, b.service_id,
              ts.slot_date, ts.start_time
       FROM booking b
       JOIN time_slot ts ON b.slot_id = ts.slot_id
       WHERE b.booking_id = ? AND b.customer_id = ?
       FOR UPDATE`,
      [bookingId, customerId]
    );

    if (!booking) {
      throw new Error('Booking not found');
    }

    if (['cancelled', 'payment_failed', 'completed', 'no_show'].includes(booking.status)) {
      throw new Error('This booking cannot be cancelled');
    }

    const slotDate = formatDateValue(booking.slot_date);
    const slotDateTime = new Date(`${slotDate}T${String(booking.start_time).slice(0, 5)}:00`);

    if (slotDateTime < new Date()) {
      throw new Error('Past bookings cannot be cancelled');
    }

    const policy = await cancellationPolicyModel.getPolicyByMerchantId(booking.merchant_id, connection);
    refundDecision = cancellationPolicyModel.calculateCustomerCancellationRefund({
      policy,
      bookingDate: slotDate,
      bookingTime: booking.start_time,
    });

    await connection.query(
      "UPDATE booking SET status=?, cancelled_by='customer', cancellation_reason='Cancelled by customer' WHERE booking_id=?",
      ['cancelled', bookingId]
    );
    await connection.query('UPDATE time_slot SET is_available = TRUE WHERE slot_id = ?', [booking.slot_id]);

    await connection.commit();
    releasedSlot = booking;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  if (releasedSlot) {
    await waitlistModel.offerNextForSlot(releasedSlot);
  }

  return refundDecision;
}

// ── RESCHEDULING ───────────────────────────────────────────────────────────

// Moves a booking to a new date/time, freeing the old slot and claiming a new one.
async function rescheduleCustomerBooking(bookingId, customerId, bookingDate, bookingTime, { allowPolicyOverride = false } = {}) {
  const connection = await db.getConnection();
  let releasedSlot = null;

  try {
    await connection.beginTransaction();

    const [[booking]] = await connection.query(
      `SELECT b.*, s.duration_mins, ts.slot_date, ts.start_time
       FROM booking b
       JOIN service s ON b.service_id = s.service_id
       JOIN time_slot ts ON b.slot_id = ts.slot_id
       WHERE b.booking_id = ? AND b.customer_id = ?
       FOR UPDATE`,
      [bookingId, customerId]
    );

    if (!booking) {
      throw new Error('Booking not found');
    }

    if (['cancelled', 'payment_failed', 'completed', 'no_show'].includes(booking.status)) {
      throw new Error('This booking cannot be rescheduled');
    }

    const currentDateForPolicy = formatDateValue(booking.slot_date);
    const currentStartsAt = new Date(`${currentDateForPolicy}T${String(booking.start_time).slice(0, 5)}:00`);
    const hoursUntilCurrentSlot = (currentStartsAt.getTime() - Date.now()) / (60 * 60 * 1000);
    if (!allowPolicyOverride && (!Number.isFinite(hoursUntilCurrentSlot) || hoursUntilCurrentSlot < cancellationPolicyModel.PLATFORM_POLICY.rescheduleCutoffHours)) {
      throw new Error('Bookings can only be rescheduled until 6 hours before the appointment.');
    }

    assertCurrentOrFutureSlot(bookingDate, bookingTime);
    await waitlistModel.assertNoBlockingOffer({
      merchantId: booking.merchant_id,
      serviceId: booking.service_id,
      bookingDate,
      bookingTime,
    });

    const currentDate = currentDateForPolicy;
    const currentTime = String(booking.start_time).slice(0, 5);
    const requestedTime = String(bookingTime).slice(0, 5);

    if (currentDate === bookingDate && currentTime === requestedTime) {
      throw new Error('Please choose a different date or time to reschedule this booking.');
    }

    await assertNoCustomerBookingConflict(connection, {
      customerId,
      bookingDate,
      bookingTime,
      durationMins: booking.duration_mins,
      excludeBookingId: bookingId,
    });

    const assignedStaff = await resolveAvailableStaffForBooking(connection, {
      merchantId: booking.merchant_id,
      serviceId: booking.service_id,
      bookingDate,
      bookingTime,
      durationMins: booking.duration_mins,
      staffId: booking.staff_id || null,
      excludeBookingId: bookingId,
    });
    const safeStaffId = assignedStaff.staff_id;

    const [existing] = await connection.query(
      `SELECT slot_id, is_available
       FROM time_slot
       WHERE merchant_id = ? AND service_id = ? AND slot_date = ? AND start_time = ? AND is_available = TRUE
       AND staff_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM booking b WHERE b.slot_id = time_slot.slot_id
       )
       LIMIT 1
       FOR UPDATE`,
      [booking.merchant_id, booking.service_id, bookingDate, bookingTime, safeStaffId]
    );

    let newSlotId;
    if (existing.length) {
      newSlotId = existing[0].slot_id;
      await connection.query('UPDATE time_slot SET is_available = FALSE WHERE slot_id = ?', [newSlotId]);
    } else {
      const [conflicting] = await connection.query(
        `SELECT slot_id
         FROM time_slot
         WHERE staff_id = ?
           AND slot_date = ?
           AND start_time < ADDTIME(?, SEC_TO_TIME(? * 60))
           AND end_time > ?
           AND is_available = FALSE
         LIMIT 1`,
        [safeStaffId, bookingDate, bookingTime, booking.duration_mins, bookingTime]
      );

      if (conflicting.length) {
        throw new Error('That time slot is already booked');
      }

      const [slotResult] = await connection.query(
        `INSERT INTO time_slot (merchant_id, service_id, staff_id, slot_date, start_time, end_time, is_available)
         VALUES (?,?,?, ?, ?, ADDTIME(?, SEC_TO_TIME(? * 60)), FALSE)`,
        [
          booking.merchant_id,
          booking.service_id,
          safeStaffId,
          bookingDate,
          bookingTime,
          bookingTime,
          booking.duration_mins,
        ]
      );
      newSlotId = slotResult.insertId;
    }

    const nextStatus = booking.status === 'pending_payment' ? 'pending_payment' : 'rescheduled';
    // Free the old slot before updating the booking row.
    await connection.query('UPDATE time_slot SET is_available = TRUE WHERE slot_id = ?', [booking.slot_id]);
    await connection.query(
      'UPDATE booking SET slot_id = ?, staff_id = ?, status = ? WHERE booking_id = ?',
      [newSlotId, safeStaffId, nextStatus, bookingId]
    );

    await connection.commit();
    releasedSlot = booking;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  if (releasedSlot) {
    await waitlistModel.offerNextForSlot(releasedSlot);
  }
}

// ── MERCHANT VIEWS ─────────────────────────────────────────────────────────

// Returns all bookings for a merchant ordered by most recent first.
async function getMerchantBookings(merchantId) {
  // Pending checkout holds and failed attempts are customer/payment concerns,
  // not merchant bookings. Expire stale holds first so their slots are released.
  await expirePendingPaymentBookings();
  const [rows] = await db.query(
    `SELECT b.*,
            ts.slot_date  AS booking_date,
            ts.start_time AS booking_time,
            ts.end_time   AS booking_end_time,
            s.service_name,
            m.email AS merchant_email,
            m.address AS merchant_address,
            COALESCE(current_staff.full_name, 'Unassigned') AS staff_name,
            proposed_staff.full_name AS proposed_staff_name,
            COALESCE(c.full_name, b.guest_name) AS customer_name,
            COALESCE(c.email, b.guest_email) AS customer_email,
            COALESCE(c.phone, b.guest_phone) AS customer_phone
     FROM booking b
     JOIN time_slot ts ON b.slot_id     = ts.slot_id
     JOIN service   s  ON b.service_id  = s.service_id
     JOIN merchant  m  ON b.merchant_id = m.merchant_id
     LEFT JOIN users c ON b.customer_id = c.user_id
     LEFT JOIN staff current_staff ON current_staff.staff_id = b.staff_id
     LEFT JOIN staff proposed_staff ON proposed_staff.staff_id = b.proposed_staff_id
     WHERE b.merchant_id = ?
       AND b.status NOT IN ('pending_payment', 'payment_failed')
     ORDER BY ts.slot_date DESC, ts.start_time DESC`,
    [merchantId]
  );
  return rows;
}

// Aggregates decision-support counts for the merchant dashboard summary cards.
async function getMerchantDashboardSummary(merchantId, periodStart) {
  await expirePendingPaymentBookings();

  const [[row]] = await db.query(
    `SELECT
       COUNT(CASE WHEN b.status <> 'cancelled' THEN 1 END) AS month_bookings,
       (SELECT COUNT(*)
        FROM booking today
        JOIN time_slot today_slot ON today_slot.slot_id = today.slot_id
        WHERE today.merchant_id = ?
          AND today_slot.slot_date = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+08:00'))
          AND today.status IN ('confirmed', 'rescheduled', 'arrived')) AS today_bookings,
       (SELECT COUNT(*)
        FROM booking upcoming
        JOIN time_slot upcoming_slot ON upcoming_slot.slot_id = upcoming.slot_id
        WHERE upcoming.merchant_id = ?
          AND TIMESTAMP(upcoming_slot.slot_date, upcoming_slot.start_time) >
              CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+08:00')
          AND upcoming.status IN ('confirmed', 'rescheduled')) AS upcoming_bookings,
       COUNT(CASE WHEN b.status = 'confirmed' OR b.status = 'rescheduled' THEN 1 END) AS confirmed,
       COUNT(CASE WHEN b.status = 'arrived' THEN 1 END) AS arrived,
       COUNT(CASE WHEN b.status = 'completed' THEN 1 END) AS completed,
       COUNT(CASE WHEN b.status = 'cancelled' THEN 1 END) AS cancelled,
       COUNT(CASE WHEN b.status = 'no_show' THEN 1 END) AS no_show,
       COUNT(CASE WHEN b.status = 'completed' THEN 1 END) AS month_completed,
       COUNT(CASE WHEN b.status = 'cancelled' THEN 1 END) AS month_cancelled,
       COUNT(CASE WHEN b.status = 'no_show' THEN 1 END) AS month_no_show,
       COUNT(CASE WHEN b.source = 'qr' THEN 1 END) AS qr_bookings
     FROM booking b
     JOIN time_slot ts ON ts.slot_id = b.slot_id
     WHERE b.merchant_id = ?
       AND b.status <> 'payment_failed'
       AND ts.slot_date >= ?
       AND ts.slot_date < DATE_ADD(?, INTERVAL 1 MONTH)`,
    [merchantId, merchantId, merchantId, periodStart, periodStart]
  );

  // Most-booked service in the period — shown as a KPI on the dashboard.
  const [[mostBookedService]] = await db.query(
    `SELECT s.service_name, COUNT(*) AS booking_count
     FROM booking b
     JOIN service s ON s.service_id = b.service_id
     JOIN time_slot ts ON ts.slot_id = b.slot_id
     WHERE b.merchant_id = ?
       AND b.status NOT IN ('cancelled', 'payment_failed')
       AND ts.slot_date >= ?
       AND ts.slot_date < DATE_ADD(?, INTERVAL 1 MONTH)
     GROUP BY s.service_id, s.service_name
     ORDER BY booking_count DESC, s.service_name ASC
     LIMIT 1`,
    [merchantId, periodStart, periodStart]
  );

  return {
    ...row,
    most_booked_service: mostBookedService?.service_name || null,
    most_booked_service_count: Number(mostBookedService?.booking_count || 0),
  };
}

// Returns today's upcoming confirmed/arrived bookings for the merchant schedule panel.
async function getMerchantTodaySchedule(merchantId) {
  const [rows] = await db.query(
    `SELECT b.booking_id, b.status,
            ts.start_time AS booking_time,
            s.service_name,
            COALESCE(st.full_name, 'Any Available Staff') AS staff_name,
            COALESCE(c.full_name, b.guest_name, 'Guest customer') AS customer_name
     FROM booking b
     JOIN time_slot ts ON ts.slot_id = b.slot_id
     JOIN service s ON s.service_id = b.service_id
     LEFT JOIN staff st ON st.staff_id = b.staff_id
     LEFT JOIN users c ON c.user_id = b.customer_id
     WHERE b.merchant_id = ?
       AND ts.slot_date = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+08:00'))
       AND ts.start_time >= TIME(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+08:00'))
       AND b.status IN ('confirmed', 'rescheduled', 'arrived')
     ORDER BY ts.start_time ASC`,
    [merchantId]
  );

  return rows;
}

// ── CUSTOMER VIEWS ─────────────────────────────────────────────────────────

// Returns all bookings for a customer with promo, policy, and review status included.
async function getCustomerBookings(customerId) {
  await ensureBookingPromoSchema();
  await expirePendingPaymentBookings();

  const [rows] = await db.query(
    `SELECT b.*,
            ts.slot_date  AS booking_date,
            ts.start_time AS booking_time,
            s.service_name,
            s.duration_mins,
            COALESCE(st.full_name, 'Any Available Staff') AS staff_name,
            COALESCE(NULLIF(b.total_amount, 0), s.price)
              - COALESCE(b.discount_amount, 0)
              - COALESCE(b.voucher_discount_amount, 0) AS payable_amount,
            COALESCE(b.discount_amount, 0) AS discount_amount,
            COALESCE(b.voucher_discount_amount, 0) AS voucher_discount_amount,
            m.merchant_name,
            m.address AS merchant_address,
            m.email AS merchant_email,
            p.payment_status,
            p.payment_ref,
            p.transaction_ref,
            CASE
              WHEN b.status = 'pending_payment'
               AND COALESCE(p.payment_hold_expires_at, DATE_ADD(b.created_at, INTERVAL 5 MINUTE)) >= NOW()
              THEN 1 ELSE 0
            END AS pending_is_active,
            GREATEST(
              0,
              TIMESTAMPDIFF(
                SECOND,
                NOW(),
                COALESCE(p.payment_hold_expires_at, DATE_ADD(b.created_at, INTERVAL 5 MINUTE))
              )
            ) AS pending_remaining_seconds,
            mr.review_id AS merchant_review_id,
            pf.review_id AS platform_feedback_id
     FROM booking b
     JOIN time_slot ts ON b.slot_id     = ts.slot_id
     JOIN service   s  ON b.service_id  = s.service_id
     JOIN merchant  m  ON b.merchant_id = m.merchant_id
     LEFT JOIN staff st ON st.staff_id = b.staff_id
     LEFT JOIN payment p ON p.booking_id = b.booking_id
     LEFT JOIN reviews mr ON mr.booking_id = b.booking_id AND mr.review_target = 'merchant'
     LEFT JOIN reviews pf ON pf.booking_id = b.booking_id AND pf.review_target = 'platform'
     WHERE b.customer_id = ?
     ORDER BY ts.slot_date DESC, ts.start_time DESC`,
    [customerId]
  );
  return rows;
}

// ── PROMOTION / VOUCHER APPLICATION ───────────────────────────────────────

// Records a promotion discount against a booking (called after promo validation).
async function applyPromotion(bookingId, promoId, discountAmount) {
  await ensureBookingPromoSchema();
  await db.query(
    'UPDATE booking SET applied_promo_id = ?, discount_amount = ? WHERE booking_id = ?',
    [promoId || null, discountAmount || 0, bookingId]
  );
}

// Records a voucher discount against a booking (called after voucher validation).
async function applyVoucher(bookingId, cvId, voucherDiscountAmount) {
  await ensureBookingPromoSchema();
  await db.query(
    'UPDATE booking SET applied_cv_id = ?, voucher_discount_amount = ? WHERE booking_id = ?',
    [cvId || null, voucherDiscountAmount || 0, bookingId]
  );
}

// ── DATE UTILITY ───────────────────────────────────────────────────────────

// Normalises a Date object or raw DB date value to a YYYY-MM-DD string.
function formatDateValue(value) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return String(value || '').slice(0, 10);
}

module.exports = {
  createBooking,
  lockCustomerForBooking,
  getBookingById,
  getCustomerBookingById,
  getCustomerBookingsForWhatsApp,
  updateBookingStatus,
  updateMerchantBookingStatus,
  markCustomerArrivedForMerchant,
  cancelCustomerBooking,
  rescheduleCustomerBooking,
  getMerchantBookings,
  getMerchantDashboardSummary,
  getMerchantTodaySchedule,
  getCustomerBookings,
  applyPromotion,
  applyVoucher,
  formatDateValue,
};
