const db = require('../config/db');

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
}) {
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

    const safeStaffId = staffId ? Number(staffId) : null;

    if (safeStaffId) {
      const [[staff]] = await connection.query(
        `SELECT s.staff_id
         FROM staff s
         JOIN staff_service ss ON ss.staff_id = s.staff_id
         WHERE s.staff_id = ?
           AND s.merchant_id = ?
           AND ss.service_id = ?
           AND s.is_active = 1
         LIMIT 1`,
        [safeStaffId, merchantId, serviceId]
      );

      if (!staff) {
        throw new Error('Selected staff member is not available for this service');
      }
    }

    if (customerId) {
      // Check if customer already has an overlapping booking.
      await assertNoCustomerBookingConflict(connection, {
        customerId,
        bookingDate,
        bookingTime,
        durationMins: svc.duration_mins,
      });
    }

    // Find an existing available slot or create one.
    const availableStaffSql = safeStaffId ? 'AND staff_id = ?' : 'AND staff_id IS NULL';
    const availableParams = [merchantId, serviceId, bookingDate, bookingTime];
    if (safeStaffId) availableParams.push(safeStaffId);

    const [existing] = await connection.query(
      `SELECT slot_id FROM time_slot
       WHERE merchant_id=? AND service_id=? AND slot_date=? AND start_time=? AND is_available=TRUE
       ${availableStaffSql}
       LIMIT 1
       FOR UPDATE`,
      availableParams
    );

    let slotId;
    if (existing.length) {
      // Reserve an existing available slot.
      slotId = existing[0].slot_id;
      await connection.query('UPDATE time_slot SET is_available=FALSE WHERE slot_id=?', [slotId]);
    } else {
      const conflictingStaffSql = safeStaffId ? 'AND staff_id = ?' : '';
      const conflictingParams = [merchantId, serviceId, bookingDate, bookingTime];
      if (safeStaffId) conflictingParams.push(safeStaffId);

      const [conflicting] = await connection.query(
        `SELECT slot_id
         FROM time_slot
         WHERE merchant_id = ? AND service_id = ? AND slot_date = ? AND start_time = ? AND is_available = FALSE
         ${conflictingStaffSql}
         LIMIT 1
         FOR UPDATE`,
        conflictingParams
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

    // Save booking as pending payment until Stripe confirms payment.
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

async function lockCustomerForBooking(connection, customerId) {
  const [[customer]] = await connection.query(
    'SELECT customer_id FROM customer WHERE customer_id = ? FOR UPDATE',
    [customerId]
  );

  if (!customer) {
    throw new Error('Customer account not found');
  }
}

async function assertNoCustomerBookingConflict(connection, {
  customerId,
  bookingDate,
  bookingTime,
  durationMins,
  excludeBookingId = null,
}) {
  // Validate booking slot availability for this customer.
  let query = `
    SELECT b.booking_id, ts.start_time, ts.end_time, s.service_name, m.merchant_name
    FROM booking b
    JOIN time_slot ts ON b.slot_id = ts.slot_id
    JOIN service s ON b.service_id = s.service_id
    JOIN merchant m ON b.merchant_id = m.merchant_id
    WHERE b.customer_id = ?
      AND b.status IN ('pending_payment', 'confirmed', 'rescheduled', 'arrived')
      AND ts.slot_date = ?
      AND ts.start_time < ADDTIME(?, SEC_TO_TIME(? * 60))
      AND ts.end_time > ?
  `;
  const params = [customerId, bookingDate, bookingTime, durationMins, bookingTime];

  if (excludeBookingId) {
    query += ' AND b.booking_id <> ?';
    params.push(excludeBookingId);
  }

  query += ' LIMIT 1 FOR UPDATE';

  const [[conflict]] = await connection.query(query, params);

  if (conflict) {
    const start = String(conflict.start_time).slice(0, 5);
    const end = String(conflict.end_time).slice(0, 5);
    throw new Error(
      `You already have a booking at ${conflict.merchant_name} (${conflict.service_name}) from ${start} to ${end}. Please choose a different time.`
    );
  }
}

async function getBookingById(bookingId) {
  const [rows] = await db.query(
    `SELECT b.*,
            ts.slot_date  AS booking_date,
            ts.start_time AS booking_time,
            s.service_name, s.price, s.duration_mins,
            COALESCE(b.total_amount, s.price) AS payable_amount,
            m.merchant_name,
            m.email AS merchant_email,
            m.address AS merchant_address,
            COALESCE(c.full_name, b.guest_name) AS customer_name,
            COALESCE(c.email, b.guest_email) AS customer_email,
            COALESCE(c.phone, b.guest_phone) AS customer_phone
     FROM booking b
     JOIN time_slot ts ON b.slot_id     = ts.slot_id
     JOIN service   s  ON b.service_id  = s.service_id
     JOIN merchant  m  ON b.merchant_id = m.merchant_id
     LEFT JOIN customer c ON b.customer_id = c.customer_id
     WHERE b.booking_id = ?`,
    [bookingId]
  );
  return rows[0] || null;
}

async function getCustomerBookingById(bookingId, customerId) {
  const [rows] = await db.query(
    `SELECT b.*,
            ts.slot_date  AS booking_date,
            ts.start_time AS booking_time,
            s.service_name, s.price, s.duration_mins,
            COALESCE(b.total_amount, s.price) AS payable_amount,
            m.merchant_name,
            m.address AS merchant_address,
            m.email AS merchant_email,
            p.payment_status
     FROM booking b
     JOIN time_slot ts ON b.slot_id     = ts.slot_id
     JOIN service   s  ON b.service_id  = s.service_id
     JOIN merchant  m  ON b.merchant_id = m.merchant_id
     LEFT JOIN payment p ON p.booking_id = b.booking_id
     WHERE b.booking_id = ? AND b.customer_id = ?`,
    [bookingId, customerId]
  );
  return rows[0] || null;
}

async function updateBookingStatus(bookingId, status) {
  const booking = await getBookingById(bookingId);
  await db.query('UPDATE booking SET status = ? WHERE booking_id = ?', [status, bookingId]);
  return booking;
}

async function updateMerchantBookingStatus(bookingId, merchantId, status) {
  const fields = ['status = ?'];
  const params = [status];

  if (status === 'arrived') {
    // Record manual merchant check-in from the dashboard.
    fields.push('checked_in_at = NOW()', "arrival_method = 'manual'");
  }

  params.push(bookingId, merchantId);

  const [result] = await db.query(
    `UPDATE booking
     SET ${fields.join(', ')}
     WHERE booking_id = ?
       AND merchant_id = ?`,
    params
  );

  return result.affectedRows;
}

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

async function cancelCustomerBooking(bookingId, customerId) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    await lockCustomerForBooking(connection, customerId);

    const [[booking]] = await connection.query(
      `SELECT b.booking_id, b.slot_id, b.status, ts.slot_date, ts.start_time
       FROM booking b
       JOIN time_slot ts ON b.slot_id = ts.slot_id
       WHERE b.booking_id = ? AND b.customer_id = ?
       FOR UPDATE`,
      [bookingId, customerId]
    );

    if (!booking) {
      throw new Error('Booking not found');
    }

    if (['cancelled', 'completed', 'no_show'].includes(booking.status)) {
      throw new Error('This booking cannot be cancelled');
    }

    const slotDate = formatDateValue(booking.slot_date);
    const slotDateTime = new Date(`${slotDate}T${String(booking.start_time).slice(0, 5)}:00`);

    if (slotDateTime < new Date()) {
      throw new Error('Past bookings cannot be cancelled');
    }

    await connection.query('UPDATE booking SET status = ? WHERE booking_id = ?', ['cancelled', bookingId]);
    await connection.query('UPDATE time_slot SET is_available = TRUE WHERE slot_id = ?', [booking.slot_id]);

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function rescheduleCustomerBooking(bookingId, customerId, bookingDate, bookingTime) {
  const connection = await db.getConnection();

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

    if (['cancelled', 'completed', 'no_show'].includes(booking.status)) {
      throw new Error('This booking cannot be rescheduled');
    }

    const requestedSlot = new Date(`${bookingDate}T${String(bookingTime).slice(0, 5)}:00`);
    if (Number.isNaN(requestedSlot.getTime()) || requestedSlot < new Date()) {
      throw new Error('Please choose a future date and time');
    }

    const currentDate = formatDateValue(booking.slot_date);
    const currentTime = String(booking.start_time).slice(0, 5);
    const requestedTime = String(bookingTime).slice(0, 5);

    if (currentDate === bookingDate && currentTime === requestedTime) {
      await connection.commit();
      return;
    }

    await assertNoCustomerBookingConflict(connection, {
      customerId,
      bookingDate,
      bookingTime,
      durationMins: booking.duration_mins,
      excludeBookingId: bookingId,
    });

    const safeStaffId = booking.staff_id || null;
    const availableStaffSql = safeStaffId ? 'AND staff_id = ?' : 'AND staff_id IS NULL';
    const availableParams = [booking.merchant_id, booking.service_id, bookingDate, bookingTime];
    if (safeStaffId) availableParams.push(safeStaffId);

    const [existing] = await connection.query(
      `SELECT slot_id, is_available
       FROM time_slot
       WHERE merchant_id = ? AND service_id = ? AND slot_date = ? AND start_time = ? AND is_available = TRUE
       ${availableStaffSql}
       LIMIT 1
       FOR UPDATE`,
      availableParams
    );

    let newSlotId;
    if (existing.length) {
      newSlotId = existing[0].slot_id;
      await connection.query('UPDATE time_slot SET is_available = FALSE WHERE slot_id = ?', [newSlotId]);
    } else {
      const conflictingStaffSql = safeStaffId ? 'AND staff_id = ?' : '';
      const conflictingParams = [booking.merchant_id, booking.service_id, bookingDate, bookingTime];
      if (safeStaffId) conflictingParams.push(safeStaffId);

      const [conflicting] = await connection.query(
        `SELECT slot_id
         FROM time_slot
         WHERE merchant_id = ? AND service_id = ? AND slot_date = ? AND start_time = ? AND is_available = FALSE
         ${conflictingStaffSql}
         LIMIT 1`,
        conflictingParams
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
    await connection.query('UPDATE time_slot SET is_available = TRUE WHERE slot_id = ?', [booking.slot_id]);
    await connection.query('UPDATE booking SET slot_id = ?, status = ? WHERE booking_id = ?', [newSlotId, nextStatus, bookingId]);

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

function formatDateValue(value) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return String(value || '').slice(0, 10);
}

async function getMerchantBookings(merchantId) {
  const [rows] = await db.query(
    `SELECT b.*,
            ts.slot_date  AS booking_date,
            ts.start_time AS booking_time,
            s.service_name,
            m.email AS merchant_email,
            m.address AS merchant_address,
            COALESCE(c.full_name, b.guest_name) AS customer_name,
            COALESCE(c.email, b.guest_email) AS customer_email,
            COALESCE(c.phone, b.guest_phone) AS customer_phone
     FROM booking b
     JOIN time_slot ts ON b.slot_id     = ts.slot_id
     JOIN service   s  ON b.service_id  = s.service_id
     JOIN merchant  m  ON b.merchant_id = m.merchant_id
     LEFT JOIN customer c ON b.customer_id = c.customer_id
     WHERE b.merchant_id = ?
     ORDER BY ts.slot_date DESC, ts.start_time DESC`,
    [merchantId]
  );
  return rows;
}

async function getCustomerBookings(customerId) {
  const [rows] = await db.query(
    `SELECT b.*,
            ts.slot_date  AS booking_date,
            ts.start_time AS booking_time,
            s.service_name,
            s.duration_mins,
            COALESCE(b.total_amount, s.price) AS payable_amount,
            m.merchant_name,
            m.address AS merchant_address,
            m.email AS merchant_email,
            p.payment_status,
            p.payment_ref,
            p.transaction_ref
     FROM booking b
     JOIN time_slot ts ON b.slot_id     = ts.slot_id
     JOIN service   s  ON b.service_id  = s.service_id
     JOIN merchant  m  ON b.merchant_id = m.merchant_id
     LEFT JOIN payment p ON p.booking_id = b.booking_id
     WHERE b.customer_id = ?
     ORDER BY ts.slot_date DESC, ts.start_time DESC`,
    [customerId]
  );
  return rows;
}

async function getAvailableSlots({ merchantId, serviceId, staffId, bookingDate }) {
  if (!merchantId || !serviceId || !bookingDate) return [];

  // Load service duration before building available time slots.
  const [[service]] = await db.query(
    `SELECT duration_mins 
     FROM service 
     WHERE service_id = ? AND merchant_id = ? AND is_active = 1`,
    [serviceId, merchantId]
  );

  if (!service) return [];

  const dayOfWeek = new Date(bookingDate + 'T00:00:00')
    .toLocaleDateString('en-US', { weekday: 'long' });

  // Use merchant opening hours for the selected day.
  const [[availability]] = await db.query(
    `SELECT start_time, end_time
     FROM merchant_availability
     WHERE merchant_id = ?
     AND day_of_week = ?
     AND is_active = 1
     LIMIT 1`,
    [merchantId, dayOfWeek]
  );

  if (!availability) return [];

  let bookedQuery = `
    SELECT start_time
    FROM time_slot
    WHERE merchant_id = ?
    AND slot_date = ?
    AND is_available = 0
  `;

  const bookedParams = [merchantId, bookingDate];

  if (staffId) {
    bookedQuery += ` AND staff_id = ?`;
    bookedParams.push(staffId);
  }

  // Remove time slots that are already booked.
  const [bookedRows] = await db.query(bookedQuery, bookedParams);
  const bookedTimes = bookedRows.map(row => String(row.start_time).slice(0, 5));

  const slots = [];

  const start = String(availability.start_time).slice(0, 5);
  const end = String(availability.end_time).slice(0, 5);

  let current = new Date(`${bookingDate}T${start}:00`);
  const closing = new Date(`${bookingDate}T${end}:00`);

  while (current < closing) {
    const slotEnd = new Date(current.getTime() + service.duration_mins * 60000);

    if (slotEnd <= closing && current >= new Date()) {
      const timeValue = current.toTimeString().slice(0, 5);

      if (!bookedTimes.includes(timeValue)) {
        slots.push({
          start_time: timeValue + ':00',
          label: timeValue
        });
      }
    }

    current.setMinutes(current.getMinutes() + 30);
  }

  return slots;
}

async function hasSentEmailNotification(bookingId, notificationType) {
  const [rows] = await db.query(
    `SELECT notification_id
     FROM notification
     WHERE booking_id = ?
       AND notification_type = ?
       AND channel = 'email'
       AND status = 'sent'
     LIMIT 1`,
    [bookingId, notificationType]
  );
  return Boolean(rows[0]);
}

async function recordEmailNotification(booking, notificationType, message, status) {
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
     LEFT JOIN customer c ON b.customer_id = c.customer_id
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

module.exports = {
  createBooking,
  getBookingById,
  getCustomerBookingById,
  updateBookingStatus,
  updateMerchantBookingStatus,
  markCustomerArrivedForMerchant,
  cancelCustomerBooking,
  rescheduleCustomerBooking,
  getMerchantBookings,
  getCustomerBookings,
  getAvailableSlots,
  hasSentEmailNotification,
  recordEmailNotification,
  getBookingsNeedingEmailReminders,
};
