const db = require('../config/db');

async function createPayment(bookingId, amount, method) {
  const [result] = await db.query(
    'INSERT INTO PAYMENT (booking_id, amount, payment_method) VALUES (?,?,?)',
    [bookingId, amount, method]
  );
  return result.insertId;
}

async function updatePaymentStatus(bookingId, status, transactionRef, amount) {
  const commissionPct  = 20.00;
  const unidayShare   = amount ? parseFloat((amount * commissionPct / 100).toFixed(2)) : null;
  const merchantShare  = amount ? parseFloat((amount - unidayShare).toFixed(2))        : null;
  await db.query(
    `UPDATE PAYMENT SET payment_status=?, transaction_ref=?, paid_at=NOW(),
     commission_pct=?, uniday_share=?, merchant_share=? WHERE booking_id=?`,
    [status, transactionRef, commissionPct, unidayShare, merchantShare, bookingId]
  );
}

async function getPaymentByBooking(bookingId) {
  const [rows] = await db.query('SELECT * FROM PAYMENT WHERE booking_id = ?', [bookingId]);
  return rows[0] || null;
}

module.exports = { createPayment, updatePaymentStatus, getPaymentByBooking };
