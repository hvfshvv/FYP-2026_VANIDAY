const db = require('../config/db');

async function createPayment(bookingId, amount, method) {
  const [result] = await db.query(
    'INSERT INTO payment (booking_id, amount, payment_method) VALUES (?,?,?)',
    [bookingId, amount, method]
  );
  return result.insertId;
}

async function createOrUpdatePayment(bookingId, amount, method) {
  const [result] = await db.query(
    `INSERT INTO payment (booking_id, amount, payment_method)
     VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE
       amount = VALUES(amount),
       payment_method = VALUES(payment_method)`,
    [bookingId, amount, method]
  );
  return result.insertId;
}

async function updatePaymentStatus(bookingId, status, transactionRef) {
  const mappedStatus = status === 'success' ? 'paid' : status;
  await db.query(
    `UPDATE payment
     SET payment_status=?, transaction_ref=?, paid_at=NOW()
     WHERE booking_id=?`,
    [mappedStatus, transactionRef, bookingId]
  );
}

async function getPaymentByBooking(bookingId) {
  const [rows] = await db.query('SELECT * FROM payment WHERE booking_id = ?', [bookingId]);
  return rows[0] || null;
}

module.exports = { createPayment, createOrUpdatePayment, updatePaymentStatus, getPaymentByBooking };
