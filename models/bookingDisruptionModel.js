const db = require('../config/db');

let schemaReady = false;

async function columnExists(tableName, columnName, connection = db) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`,
    [tableName, columnName]
  );
  return Number(row.total) > 0;
}

async function addColumn(tableName, columnName, ddl, connection = db) {
  if (!(await columnExists(tableName, columnName, connection))) {
    await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${ddl}`);
  }
}

async function ensureSchema(connection = db) {
  if (schemaReady) return;
  await addColumn('booking', 'cancelled_by', "cancelled_by ENUM('customer','merchant','admin') NULL", connection);
  await addColumn('booking', 'cancellation_reason', 'cancellation_reason TEXT NULL', connection);
  await addColumn('booking', 'proposed_staff_id', 'proposed_staff_id INT NULL', connection);
  await addColumn('booking', 'staff_change_reason', 'staff_change_reason TEXT NULL', connection);
  await addColumn('booking', 'staff_change_status', "staff_change_status ENUM('pending','accepted','reschedule_requested','cancelled') NULL", connection);
  await addColumn('booking', 'staff_change_requested_at', 'staff_change_requested_at DATETIME NULL', connection);
  await addColumn('booking', 'staff_change_responded_at', 'staff_change_responded_at DATETIME NULL', connection);
  await addColumn('time_slot', 'block_type', "block_type ENUM('staff_unavailable','merchant_cancellation','emergency_closure') NULL", connection);
  await addColumn('time_slot', 'block_reason', 'block_reason TEXT NULL', connection);
  schemaReady = true;
}

async function getMerchantBooking(bookingId, merchantId, connection = db) {
  await ensureSchema(connection);
  const [[row]] = await connection.query(
    `SELECT b.*, ts.slot_date AS booking_date, ts.start_time AS booking_time,
            ts.end_time AS booking_end_time, s.service_name, s.duration_mins,
            m.merchant_name, st.full_name AS staff_name,
            u.user_id AS customer_user_id, u.full_name AS customer_name
     FROM booking b
     JOIN time_slot ts ON ts.slot_id=b.slot_id
     JOIN service s ON s.service_id=b.service_id
     JOIN merchant m ON m.merchant_id=b.merchant_id
     LEFT JOIN staff st ON st.staff_id=b.staff_id
     LEFT JOIN users u ON u.user_id=b.customer_id
     WHERE b.booking_id=? AND b.merchant_id=? LIMIT 1`, [bookingId, merchantId]
  );
  return row || null;
}

async function getReplacementStaff(bookingId, merchantId) {
  const booking = await getMerchantBooking(bookingId, merchantId);
  if (!booking) return [];
  const [rows] = await db.query(
    `SELECT st.staff_id, st.full_name, st.role FROM staff st
     JOIN staff_service ss ON ss.staff_id=st.staff_id AND ss.service_id=?
     WHERE st.merchant_id=? AND st.is_active=1 AND st.staff_id<>?
       AND NOT EXISTS (
         SELECT 1 FROM booking ob JOIN time_slot ots ON ots.slot_id=ob.slot_id
         WHERE ob.staff_id=st.staff_id AND ob.booking_id<>?
           AND ob.status IN ('confirmed','rescheduled','arrived','pending_payment')
           AND ots.slot_date=? AND ots.start_time<? AND ots.end_time>?
       )
       AND NOT EXISTS (
         SELECT 1 FROM time_slot blocked
         WHERE blocked.merchant_id=? AND blocked.staff_id=st.staff_id
           AND blocked.block_type IS NOT NULL AND blocked.slot_date=?
           AND blocked.start_time<? AND blocked.end_time>?
       )
       AND NOT EXISTS (
         SELECT 1 FROM booking pending JOIN time_slot pts ON pts.slot_id=pending.slot_id
         WHERE pending.merchant_id=? AND pending.proposed_staff_id=st.staff_id
           AND pending.staff_change_status='pending' AND pts.slot_date=?
           AND pts.start_time<? AND pts.end_time>?
       )
     ORDER BY st.full_name`,
    [booking.service_id, merchantId, booking.staff_id || 0, bookingId,
      booking.booking_date, booking.booking_end_time, booking.booking_time,
      merchantId, booking.booking_date, booking.booking_end_time, booking.booking_time,
      merchantId, booking.booking_date, booking.booking_end_time, booking.booking_time]
  );
  return rows;
}

async function createStaffReplacementRequest({ bookingId, merchantId, proposedStaffId, reason }) {
  await ensureSchema();
  const booking = await getMerchantBooking(bookingId, merchantId);
  if (!booking || !['confirmed', 'rescheduled'].includes(booking.status)) {
    throw new Error('Only upcoming confirmed bookings can receive a replacement proposal.');
  }
  const replacements = await getReplacementStaff(bookingId, merchantId);
  const proposedStaff = replacements.find(row => Number(row.staff_id) === Number(proposedStaffId));
  if (!proposedStaff) throw new Error('The selected replacement staff member is not available.');
  await db.query(
    `UPDATE booking SET proposed_staff_id=?, staff_change_reason=?, staff_change_status='pending',
       staff_change_requested_at=NOW(), staff_change_responded_at=NULL WHERE booking_id=? AND merchant_id=?`,
    [proposedStaffId, reason, bookingId, merchantId]
  );
  if (booking.staff_id) {
    await db.query(
      `INSERT INTO time_slot (merchant_id, service_id, staff_id, slot_date, start_time, end_time,
         is_available, block_type, block_reason) VALUES (?, ?, ?, ?, ?, ?, FALSE, 'staff_unavailable', ?)`,
      [merchantId, booking.service_id, booking.staff_id, booking.booking_date,
        booking.booking_time, booking.booking_end_time, reason]
    );
  }
  return { ...booking, change_request_id: bookingId, proposed_staff: proposedStaff };
}

async function getPendingRequestForCustomer(requestId, customerId, connection = db) {
  await ensureSchema(connection);
  const [[row]] = await connection.query(
    `SELECT b.booking_id AS change_request_id, b.booking_id, b.customer_id, b.merchant_id,
            b.slot_id, b.staff_id, b.service_id, b.proposed_staff_id,
            b.staff_change_reason AS reason, b.staff_change_status AS status,
            ts.slot_date AS booking_date, ts.start_time AS booking_time,
            s.service_name, m.merchant_name, st.full_name AS proposed_staff_name
     FROM booking b JOIN time_slot ts ON ts.slot_id=b.slot_id
     JOIN service s ON s.service_id=b.service_id JOIN merchant m ON m.merchant_id=b.merchant_id
     JOIN staff st ON st.staff_id=b.proposed_staff_id
     WHERE b.booking_id=? AND b.customer_id=? AND b.staff_change_status='pending' LIMIT 1`,
    [requestId, customerId]
  );
  return row || null;
}

async function acceptReplacement(requestId, customerId) {
  await ensureSchema();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const request = await getPendingRequestForCustomer(requestId, customerId, connection);
    if (!request) throw new Error('This replacement proposal is no longer available.');
    await connection.query(
      `UPDATE booking SET staff_id=proposed_staff_id, proposed_staff_id=NULL,
       staff_change_status='accepted', staff_change_responded_at=NOW() WHERE booking_id=?`, [requestId]
    );
    await connection.query('UPDATE time_slot SET staff_id=? WHERE slot_id=?', [request.proposed_staff_id, request.slot_id]);
    await connection.commit();
    return request;
  } catch (err) { await connection.rollback(); throw err; }
  finally { connection.release(); }
}

async function markRequest(requestId, customerId, status) {
  const request = await getPendingRequestForCustomer(requestId, customerId);
  if (!request) throw new Error('This replacement proposal is no longer available.');
  await db.query(
    'UPDATE booking SET staff_change_status=?, staff_change_responded_at=NOW() WHERE booking_id=?',
    [status, requestId]
  );
  return request;
}

async function cancelBookingByMerchant({ bookingId, merchantId, reason, blockSlot = true }) {
  await ensureSchema();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const booking = await getMerchantBooking(bookingId, merchantId, connection);
    if (!booking || !['confirmed', 'rescheduled', 'pending_payment'].includes(booking.status)) {
      throw new Error('This booking cannot be cancelled by the merchant.');
    }
    await connection.query(
      `UPDATE booking SET status='cancelled', cancelled_by='merchant', cancellation_reason=?,
       staff_change_status=IF(staff_change_status='pending','cancelled',staff_change_status),
       staff_change_responded_at=IF(staff_change_status='pending',NOW(),staff_change_responded_at)
       WHERE booking_id=?`, [reason, bookingId]
    );
    if (blockSlot) {
      await connection.query(
        `INSERT INTO time_slot (merchant_id, service_id, staff_id, slot_date, start_time, end_time,
         is_available, block_type, block_reason) VALUES (?, ?, ?, ?, ?, ?, FALSE, 'merchant_cancellation', ?)`,
        [merchantId, booking.service_id, booking.staff_id || null, booking.booking_date,
          booking.booking_time, booking.booking_end_time, reason]
      );
    }
    await connection.commit();
    return booking;
  } catch (err) { await connection.rollback(); throw err; }
  finally { connection.release(); }
}

async function createEmergencyClosure({ merchantId, startsAt, endsAt, reason }) {
  await ensureSchema();
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new Error('Please enter a valid closure period.');
  }
  if (start < new Date()) {
    throw new Error('Emergency closures cannot start in the past.');
  }
  const [services] = await db.query('SELECT service_id FROM service WHERE merchant_id=? AND is_active=1', [merchantId]);
  const dateValue = value => [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-');
  const timeValue = value => [String(value.getHours()).padStart(2, '0'), String(value.getMinutes()).padStart(2, '0'), '00'].join(':');
  for (let day = new Date(start.getFullYear(), start.getMonth(), start.getDate()); day <= end; day.setDate(day.getDate() + 1)) {
    const dayKey = dateValue(day);
    const segmentStart = dayKey === dateValue(start) ? timeValue(start) : '00:00:00';
    const segmentEnd = dayKey === dateValue(end) ? timeValue(end) : '23:59:59';
    if (segmentStart >= segmentEnd) continue;
    for (const service of services) {
      await db.query(
        `INSERT INTO time_slot (merchant_id, service_id, staff_id, slot_date, start_time, end_time,
         is_available, block_type, block_reason) VALUES (?, ?, NULL, ?, ?, ?, FALSE, 'emergency_closure', ?)`,
        [merchantId, service.service_id, dayKey, segmentStart, segmentEnd, reason]
      );
    }
  }
  const [bookings] = await db.query(
    `SELECT b.booking_id FROM booking b JOIN time_slot ts ON ts.slot_id=b.slot_id
     WHERE b.merchant_id=? AND b.status IN ('confirmed','rescheduled','pending_payment')
       AND TIMESTAMP(ts.slot_date,ts.start_time)<? AND TIMESTAMP(ts.slot_date,ts.end_time)>?`,
    [merchantId, end, start]
  );
  return { closureId: null, bookings };
}

async function listClosures(merchantId) {
  await ensureSchema();
  const [rows] = await db.query(
    `SELECT MIN(slot_id) AS closure_id, TIMESTAMP(slot_date,start_time) AS starts_at,
            TIMESTAMP(slot_date,end_time) AS ends_at, block_reason AS reason
     FROM time_slot WHERE merchant_id=? AND block_type='emergency_closure'
       AND TIMESTAMP(slot_date,end_time)>=NOW()
     GROUP BY slot_date,start_time,end_time,block_reason ORDER BY slot_date DESC LIMIT 20`, [merchantId]
  );
  return rows;
}

async function getPendingRequestsForCustomer(customerId) {
  await ensureSchema();
  const [rows] = await db.query(
    `SELECT b.booking_id AS change_request_id, b.booking_id, b.staff_change_reason AS reason,
            s.service_name,m.merchant_name,ts.slot_date AS booking_date,ts.start_time AS booking_time,
            st.full_name AS proposed_staff_name
     FROM booking b JOIN service s ON s.service_id=b.service_id
     JOIN merchant m ON m.merchant_id=b.merchant_id JOIN time_slot ts ON ts.slot_id=b.slot_id
     JOIN staff st ON st.staff_id=b.proposed_staff_id
     WHERE b.customer_id=? AND b.staff_change_status='pending'
     ORDER BY b.staff_change_requested_at DESC`, [customerId]
  );
  return rows;
}

module.exports = { ensureSchema, getMerchantBooking, getReplacementStaff,
  createStaffReplacementRequest, getPendingRequestForCustomer, acceptReplacement,
  markRequest, cancelBookingByMerchant, createEmergencyClosure, listClosures,
  getPendingRequestsForCustomer };
