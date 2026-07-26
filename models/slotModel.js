/*
 * slotModel.js
 * Handles time-slot and staff availability for the booking flow: finding
 * free staff, detecting schedule conflicts, and enumerating bookable slots
 * within merchant opening hours.
 */

const db = require('../config/db');
const { expirePendingPaymentBookings } = require('./bookingNotificationModel');
const MAX_ADVANCE_BOOKING_DAYS = 365;
const waitlistModel = require('./waitlistModel');

// ── STAFF AVAILABILITY ─────────────────────────────────────────────────────

// Returns staff members who are free for a given service, date, and time window.
async function getAvailableStaffForSlot({
  merchantId,
  serviceId,
  bookingDate,
  bookingTime,
  durationMins = null,
  staffId = null,
  excludeBookingId = null,
  connection = db,
}) {
  if (!merchantId || !serviceId || !bookingDate || !bookingTime) return [];
  if (!isDateWithinAdvanceLimit(bookingDate)) return [];

  const disruptionModel = require('./bookingDisruptionModel');
  await disruptionModel.ensureSchema(connection);

  let safeDuration = Number(durationMins);
  if (!Number.isFinite(safeDuration) || safeDuration <= 0) {
    const [[service]] = await connection.query(
      `SELECT duration_mins
       FROM service
       WHERE service_id = ? AND merchant_id = ? AND is_active = 1`,
      [serviceId, merchantId]
    );
    if (!service) return [];
    safeDuration = Number(service.duration_mins || 0);
  }

  const params = [
    merchantId,
    serviceId,
    bookingDate,
    bookingTime,
    safeDuration,
    bookingTime,
  ];

  let excludeBookingFilter = '';
  if (excludeBookingId) {
    excludeBookingFilter = 'AND b.booking_id <> ?';
    params.push(excludeBookingId);
  }

  let staffFilter = '';
  if (staffId) {
    staffFilter = 'AND st.staff_id = ?';
    params.push(Number(staffId));
  }

  // Main query: staff linked to this service with no overlapping active booking.
  const [rows] = await connection.query(
    `SELECT DISTINCT st.staff_id, st.full_name, st.role, st.bio, st.experience_years
     FROM staff st
     JOIN staff_service ss ON ss.staff_id = st.staff_id
     WHERE st.merchant_id = ?
       AND ss.service_id = ?
       AND st.is_active = 1
       AND NOT EXISTS (
          SELECT 1
          FROM booking b
          JOIN time_slot ts ON ts.slot_id = b.slot_id
          LEFT JOIN payment p ON p.booking_id = b.booking_id
          WHERE b.staff_id = st.staff_id
            AND ts.slot_date = ?
            AND (
              b.status IN ('confirmed', 'rescheduled', 'arrived')
              OR (
                b.status = 'pending_payment'
                AND DATE_ADD(b.created_at, INTERVAL 5 MINUTE) >= NOW()
              )
            )
           AND ts.start_time < ADDTIME(?, SEC_TO_TIME(? * 60))
           AND ts.end_time > ?
           ${excludeBookingFilter}
       )
       ${staffFilter}
     ORDER BY st.full_name ASC`,
    params
  );

  const slotStart = `${bookingDate} ${String(bookingTime).slice(0, 5)}:00`;
  const slotEndDate = new Date(`${bookingDate}T${String(bookingTime).slice(0, 5)}:00`);
  slotEndDate.setMinutes(slotEndDate.getMinutes() + safeDuration);
  const slotEnd = [
    slotEndDate.getFullYear(),
    String(slotEndDate.getMonth() + 1).padStart(2, '0'),
    String(slotEndDate.getDate()).padStart(2, '0'),
  ].join('-') + ' ' + [
    String(slotEndDate.getHours()).padStart(2, '0'),
    String(slotEndDate.getMinutes()).padStart(2, '0'),
    '00',
  ].join(':');

  const [blocked] = await connection.query(
    `SELECT staff_id FROM time_slot
     WHERE merchant_id=? AND (service_id=? OR block_type IN ('staff_unavailable','merchant_cancellation'))
       AND block_type IS NOT NULL
       AND TIMESTAMP(slot_date,start_time) < ?
       AND TIMESTAMP(slot_date,end_time) > ?`,
    [merchantId, serviceId, slotEnd, slotStart]
  );
  const blocksAllStaff = blocked.some(item => item.staff_id === null);
  const blockedStaffIds = new Set(blocked.map(item => Number(item.staff_id)).filter(Boolean));
  const [reservedReplacements] = await connection.query(
    `SELECT b.proposed_staff_id AS staff_id FROM booking b
     JOIN time_slot ts ON ts.slot_id=b.slot_id
     WHERE b.merchant_id=? AND b.staff_change_status='pending'
       AND TIMESTAMP(ts.slot_date, ts.start_time) < ?
       AND TIMESTAMP(ts.slot_date, ts.end_time) > ?`,
    [merchantId, slotEnd, slotStart]
  );
  reservedReplacements.forEach(item => blockedStaffIds.add(Number(item.staff_id)));
  const operationalRows = blocksAllStaff ? [] : rows.filter(item => !blockedStaffIds.has(Number(item.staff_id)));

  // Legacy bookings with no staff_id hold a slot that must reduce available count.
  const [legacyRows] = await connection.query(
    `SELECT COUNT(*) AS legacy_count
      FROM booking b
      JOIN time_slot ts ON ts.slot_id = b.slot_id
      LEFT JOIN payment p ON p.booking_id = b.booking_id
      WHERE b.merchant_id = ?
        AND b.service_id = ?
        AND b.staff_id IS NULL
        AND ts.slot_date = ?
        AND (
          b.status IN ('confirmed', 'rescheduled', 'arrived')
          OR (
            b.status = 'pending_payment'
            AND DATE_ADD(b.created_at, INTERVAL 5 MINUTE) >= NOW()
          )
        )
       AND ts.start_time < ADDTIME(?, SEC_TO_TIME(? * 60))
       AND ts.end_time > ?
       ${excludeBookingId ? 'AND b.booking_id <> ?' : ''}`,
    excludeBookingId
      ? [merchantId, serviceId, bookingDate, bookingTime, safeDuration, bookingTime, excludeBookingId]
      : [merchantId, serviceId, bookingDate, bookingTime, safeDuration, bookingTime]
  );

  const legacyHoldCount = Number(legacyRows[0]?.legacy_count || 0);
  if (!legacyHoldCount) return operationalRows;

  if (staffId) {
    return operationalRows;
  }

  // Remove one available staff entry per legacy-booked slot.
  return operationalRows.slice(legacyHoldCount);
}

// Picks an available staff member for a booking, throwing if none are free.
async function resolveAvailableStaffForBooking(connection, {
  merchantId,
  serviceId,
  bookingDate,
  bookingTime,
  durationMins,
  staffId = null,
  excludeBookingId = null,
}) {
  const availableStaff = await getAvailableStaffForSlot({
    merchantId,
    serviceId,
    bookingDate,
    bookingTime,
    durationMins,
    staffId,
    excludeBookingId,
    connection,
  });

  if (staffId) {
    if (!availableStaff.length) {
      throw new Error('Selected staff member is no longer available for this time.');
    }
    return availableStaff[0];
  }

  if (!availableStaff.length) {
    throw new Error('No staff are available for this service at the selected time.');
  }

  return availableStaff[0];
}

// ── BOOKING CONFLICT CHECK ─────────────────────────────────────────────────

// Throws if the customer already has an active booking that overlaps the requested window.
async function assertNoCustomerBookingConflict(connection, {
  customerId,
  bookingDate,
  bookingTime,
  durationMins,
  excludeBookingId = null,
}) {
  // Join service and merchant to build a human-readable conflict message.
  let query = `
    SELECT b.booking_id, ts.slot_date, ts.start_time, ts.end_time, s.service_name, m.merchant_name
    FROM booking b
    JOIN time_slot ts ON b.slot_id = ts.slot_id
    JOIN service s ON b.service_id = s.service_id
    JOIN merchant m ON b.merchant_id = m.merchant_id
    LEFT JOIN payment p ON p.booking_id = b.booking_id
    WHERE b.customer_id = ?
      AND (
        b.status IN ('confirmed', 'rescheduled', 'arrived')
        OR (
          b.status = 'pending_payment'
          AND DATE_ADD(b.created_at, INTERVAL 5 MINUTE) >= NOW()
        )
      )
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
    const error = new Error(
      `You already have a booking at ${conflict.merchant_name} (${conflict.service_name}) from ${start} to ${end}. Please choose a different time.`
    );
    error.code = 'CUSTOMER_BOOKING_OVERLAP';
    error.conflict = {
      bookingId: conflict.booking_id,
      merchantName: conflict.merchant_name,
      serviceName: conflict.service_name,
      bookingDate: conflict.slot_date,
      startTime: conflict.start_time,
      endTime: conflict.end_time
    };
    throw error;
  }
}

// ── SLOT VALIDATION ────────────────────────────────────────────────────────

function dateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function maxBookableDateValue() {
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + MAX_ADVANCE_BOOKING_DAYS);
  return dateInputValue(maxDate);
}

function isDateWithinAdvanceLimit(bookingDate) {
  return Boolean(bookingDate) && String(bookingDate).slice(0, 10) <= maxBookableDateValue();
}

// Throws if the given date/time combination is in the past, too far ahead, or missing.
function assertCurrentOrFutureSlot(bookingDate, bookingTime) {
  if (!bookingDate || !bookingTime) {
    throw new Error('Please choose a booking date and time.');
  }

  if (!isDateWithinAdvanceLimit(bookingDate)) {
    throw new Error('Bookings can only be made within the next 12 months.');
  }

  const slot = new Date(`${bookingDate}T${String(bookingTime).slice(0, 5)}:00`);

  if (Number.isNaN(slot.getTime()) || slot < new Date()) {
    throw new Error('Please choose a booking date and time that is not in the past.');
  }
}

// ── AVAILABLE SLOTS QUERY ──────────────────────────────────────────────────

// Returns all bookable time slots within merchant opening hours for a given date and service.
async function getAvailableSlots({ merchantId, serviceId, staffId, bookingDate, includeUnavailable = false }) {
  await expirePendingPaymentBookings();
  await waitlistModel.expireOffersAndPromote();

  if (!merchantId || !serviceId || !bookingDate) return [];
  if (!isDateWithinAdvanceLimit(bookingDate)) return [];

  // Fetch service duration to compute slot end times and filter by available staff.
  const [[service]] = await db.query(
    `SELECT duration_mins
     FROM service
     WHERE service_id = ? AND merchant_id = ? AND is_active = 1`,
    [serviceId, merchantId]
  );

  if (!service) return [];

  const dayOfWeek = new Date(bookingDate + 'T00:00:00')
    .toLocaleDateString('en-US', { weekday: 'long' });

  // Use the merchant's configured availability for this day of the week.
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

  const slots = [];
  await require('./bookingDisruptionModel').ensureSchema();
  const [closureRows] = await db.query(
    `SELECT start_time, end_time, block_reason
     FROM time_slot WHERE merchant_id=? AND service_id=? AND slot_date=?
       AND block_type='emergency_closure'`,
    [merchantId, serviceId, bookingDate]
  );
  const waitlistCounts = includeUnavailable
    ? await waitlistModel.getSlotWaitlistCounts({ merchantId, serviceId, bookingDate })
    : new Map();

  const start = String(availability.start_time).slice(0, 5);
  const end = String(availability.end_time).slice(0, 5);

  let current = new Date(`${bookingDate}T${start}:00`);
  const closing = new Date(`${bookingDate}T${end}:00`);

  // Step through 30-minute increments and include slots with at least one free staff member.
  while (current < closing) {
    const slotEnd = new Date(current.getTime() + service.duration_mins * 60000);

    if (slotEnd <= closing && current >= new Date()) {
      const timeValue = current.toTimeString().slice(0, 5);
      const closure = closureRows.find(row => {
        const closureStart = new Date(`${bookingDate}T${String(row.start_time).slice(0, 8)}`);
        const closureEnd = new Date(`${bookingDate}T${String(row.end_time).slice(0, 8)}`);
        return current < closureEnd && slotEnd > closureStart;
      });
      const availableStaff = await getAvailableStaffForSlot({
        merchantId,
        serviceId,
        bookingDate,
        bookingTime: timeValue,
        durationMins: service.duration_mins,
        staffId,
      });
      const waitlist = waitlistCounts.get(timeValue) || { waitlist_count: 0, active_offer_count: 0 };
      const hasBlockingOffer = Number(waitlist.active_offer_count || 0) > 0;
      const isClosed = Boolean(closure);
      const isAvailable = !isClosed && availableStaff.length > 0 && !hasBlockingOffer;

      if (isAvailable || includeUnavailable) {
        slots.push({
          start_time: timeValue + ':00',
          label: timeValue,
          available_staff_count: availableStaff.length,
          is_available: isAvailable,
          waitlist_count: Number(waitlist.waitlist_count || 0),
          has_active_waitlist_offer: hasBlockingOffer,
          is_closed: isClosed,
          closure_reason: closure?.block_reason || null,
          closure_start: closure ? String(closure.start_time).slice(0, 5) : null,
          closure_end: closure ? String(closure.end_time).slice(0, 5) : null,
        });
      }
    }

    current.setMinutes(current.getMinutes() + 30);
  }

  return slots;
}

module.exports = {
  getAvailableStaffForSlot,
  resolveAvailableStaffForBooking,
  assertNoCustomerBookingConflict,
  assertCurrentOrFutureSlot,
  maxBookableDateValue,
  isDateWithinAdvanceLimit,
  getAvailableSlots,
};
