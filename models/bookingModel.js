const db = require('../config/db');

async function createBooking({ customerId, serviceId, merchantId, bookingDate, bookingTime, source }) {
  // Confirm the selected service belongs to the selected merchant before pricing.
  const [[svc]] = await db.query(
    'SELECT price, duration_mins FROM service WHERE service_id = ? AND merchant_id = ? AND is_active = 1',
    [serviceId, merchantId]
  );
  if (!svc) {
    throw new Error('Selected service is not available for this merchant');
  }

  // find an existing available slot or create one
  const [existing] = await db.query(
    `SELECT slot_id FROM time_slot
     WHERE merchant_id=? AND service_id=? AND slot_date=? AND start_time=? AND is_available=TRUE
     LIMIT 1`,
    [merchantId, serviceId, bookingDate, bookingTime]
  );

  let slotId;
  if (existing.length) {
    slotId = existing[0].slot_id;
    await db.query('UPDATE time_slot SET is_available=FALSE WHERE slot_id=?', [slotId]);
  } else {
    const [slotResult] = await db.query(
      `INSERT INTO time_slot (merchant_id, service_id, staff_id, slot_date, start_time, end_time, is_available)
       VALUES (?,?,NULL,?,?,ADDTIME(?,SEC_TO_TIME(?*60)),FALSE)`,
      [merchantId, serviceId, bookingDate, bookingTime, bookingTime, svc.duration_mins]
    );
    slotId = slotResult.insertId;
  }

  const mappedSource = source === 'qr_scan' ? 'qr' : source === 'portal' ? 'web' : source;
  const allowedSources = ['web', 'qr', 'marketplace'];
  const safeSource = allowedSources.includes(mappedSource) ? mappedSource : 'web';
  const mappedBookingType = safeSource === 'qr' ? 'walk_in' : 'advance';

  const [result] = await db.query(
    `INSERT INTO booking
       (customer_id, merchant_id, service_id, staff_id, slot_id, booking_type, source, status, total_amount)
     VALUES (?,?,?,NULL,?,?,?,'pending_payment',?)`,
    [customerId, merchantId, serviceId, slotId, mappedBookingType, safeSource, svc.price]
  );
  return result.insertId;
}

async function getBookingById(bookingId) {
  const [rows] = await db.query(
    `SELECT b.*,
            ts.slot_date  AS booking_date,
            ts.start_time AS booking_time,
            s.service_name, s.price, s.duration_mins,
            COALESCE(b.total_amount, s.price) AS payable_amount,
            m.merchant_name,
            c.full_name   AS customer_name,
            c.phone       AS customer_phone
     FROM booking b
     JOIN time_slot ts ON b.slot_id     = ts.slot_id
     JOIN service   s  ON b.service_id  = s.service_id
     JOIN merchant  m  ON b.merchant_id = m.merchant_id
     JOIN customer c ON b.customer_id = c.customer_id
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
  await db.query('UPDATE booking SET status = ? WHERE booking_id = ?', [status, bookingId]);
}

async function updateMerchantBookingStatus(bookingId, merchantId, status) {
  const fields = ['status = ?'];
  const params = [status];

  if (status === 'arrived') {
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

    const [[booking]] = await connection.query(
      `SELECT b.booking_id, b.status, ts.slot_date, ts.start_time, s.service_name, m.merchant_name
       FROM booking b
       JOIN time_slot ts ON b.slot_id = ts.slot_id
       JOIN service s ON b.service_id = s.service_id
       JOIN merchant m ON b.merchant_id = m.merchant_id
       WHERE b.customer_id = ?
         AND b.merchant_id = ?
         AND b.status = 'confirmed'
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

    await connection.query(
      `UPDATE booking
       SET status = 'arrived',
           checked_in_at = NOW(),
           arrival_method = 'qr'
       WHERE booking_id = ?
         AND merchant_id = ?
         AND customer_id = ?
         AND status = 'confirmed'`,
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

    const [existing] = await connection.query(
      `SELECT slot_id, is_available
       FROM time_slot
       WHERE merchant_id = ? AND service_id = ? AND slot_date = ? AND start_time = ? AND is_available = TRUE
       LIMIT 1
       FOR UPDATE`,
      [booking.merchant_id, booking.service_id, bookingDate, bookingTime]
    );

    let newSlotId;
    if (existing.length) {
      newSlotId = existing[0].slot_id;
      await connection.query('UPDATE time_slot SET is_available = FALSE WHERE slot_id = ?', [newSlotId]);
    } else {
      const [conflicting] = await connection.query(
        `SELECT slot_id
         FROM time_slot
         WHERE merchant_id = ? AND service_id = ? AND slot_date = ? AND start_time = ? AND is_available = FALSE
         LIMIT 1`,
        [booking.merchant_id, booking.service_id, bookingDate, bookingTime]
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
          booking.staff_id || null,
          bookingDate,
          bookingTime,
          bookingTime,
          booking.duration_mins,
        ]
      );
      newSlotId = slotResult.insertId;
    }

    await connection.query('UPDATE time_slot SET is_available = TRUE WHERE slot_id = ?', [booking.slot_id]);
    await connection.query('UPDATE booking SET slot_id = ? WHERE booking_id = ?', [newSlotId, bookingId]);

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
            c.full_name   AS customer_name,
            c.phone       AS customer_phone
     FROM booking b
     JOIN time_slot ts ON b.slot_id     = ts.slot_id
     JOIN service   s  ON b.service_id  = s.service_id
     JOIN customer c ON b.customer_id = c.customer_id
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

  const [[service]] = await db.query(
    `SELECT duration_mins 
     FROM service 
     WHERE service_id = ? AND merchant_id = ? AND is_active = 1`,
    [serviceId, merchantId]
  );

  if (!service) return [];

  const dayOfWeek = new Date(bookingDate + 'T00:00:00')
    .toLocaleDateString('en-US', { weekday: 'long' });

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
  getAvailableSlots
};
