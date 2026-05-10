const db = require('../config/db');

async function createBooking({ customerId, serviceId, merchantId, qrId, bookingDate, bookingTime, source }) {
  const [result] = await db.query(
    `INSERT INTO BOOKING (customer_id, service_id, merchant_id, qr_id, booking_date, booking_time, source)
     VALUES (?,?,?,?,?,?,?)`,
    [customerId, serviceId, merchantId, qrId || null, bookingDate, bookingTime, source]
  );
  return result.insertId;
}

async function getBookingById(bookingId) {
  const [rows] = await db.query(
    `SELECT b.*, s.service_name, s.price, s.duration_mins, m.merchant_name, u.full_name AS customer_name, u.phone AS customer_phone
     FROM BOOKING b
     JOIN SERVICE  s ON b.service_id  = s.service_id
     JOIN MERCHANT m ON b.merchant_id = m.merchant_id
     JOIN USERS    u ON b.customer_id = u.user_id
     WHERE b.booking_id = ?`,
    [bookingId]
  );
  return rows[0] || null;
}

async function updateBookingStatus(bookingId, status) {
  await db.query('UPDATE BOOKING SET status = ? WHERE booking_id = ?', [status, bookingId]);
}

async function getMerchantBookings(merchantId) {
  const [rows] = await db.query(
    `SELECT b.*, s.service_name, u.full_name AS customer_name, u.phone AS customer_phone
     FROM BOOKING b
     JOIN SERVICE s ON b.service_id  = s.service_id
     JOIN USERS   u ON b.customer_id = u.user_id
     WHERE b.merchant_id = ? ORDER BY b.booking_date DESC, b.booking_time DESC`,
    [merchantId]
  );
  return rows;
}

module.exports = { createBooking, getBookingById, updateBookingStatus, getMerchantBookings };
